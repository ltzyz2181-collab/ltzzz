// Regression for the virtual-payment refund / delivery push handler.
// Run: node --test scripts/tests/vpay-notify-refund.test.mjs
//
// Drives the real handler through its HTTP + signature ingress (never by calling
// internal helpers), with wx-server-sdk replaced by an in-memory `orders`
// collection. Covers: full refund, partial refund auto-closure, cumulative
// promotion to refunded, duplicate-push idempotency, over-total rejection,
// delivery push on a partially refunded order, unpaid orders, RetCode != 0.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import Module from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const TOKEN = '<REDACTED>';
process.env.VPAY_PUSH_TOKEN = TOKEN;

const here = path.dirname(fileURLToPath(import.meta.url));
const FN = path.resolve(here, '../../miniprogram/cloudfunctions/vpay-notify/index.js');

let docs = [];
const PUSH = Symbol('push');
const command = { push: v => ({ [PUSH]: v }) };
const matches = (doc, cond) => Object.keys(cond).every(k => doc[k] === cond[k]);
const collection = () => ({
  where(cond) {
    return {
      async get() { return { data: docs.filter(d => matches(d, cond)) }; },
      async update({ data }) {
        let updated = 0;
        for (const d of docs) {
          if (!matches(d, cond)) continue;
          for (const [k, v] of Object.entries(data)) {
            if (v && typeof v === 'object' && v[PUSH]) d[k] = (Array.isArray(d[k]) ? d[k] : []).concat(v[PUSH]);
            else d[k] = v;
          }
          updated++;
        }
        return { stats: { updated } };
      }
    };
  }
});
const fakeCloud = {
  DYNAMIC_CURRENT_ENV: 'test-env',
  init() {},
  database() { return { collection, command }; },
  getWXContext() { return { OPENID: 'o_test', APPID: 'wx562bcb6057346fb2' }; }
};
const origLoad = Module._load;
Module._load = function (request, ...rest) {
  if (request === 'wx-server-sdk') return fakeCloud;
  return origLoad.call(this, request, ...rest);
};

const fn = await import(FN);
const handler = fn.main || fn.exports.main;

const now = new Date().toISOString();
function seed(over = {}) {
  docs = [Object.assign({
    _id: 'ord1', out_trade_no: 'VP-TEST', status: 'delivered', amount: 990,
    product_id: 'source_check', wx_order_id: 'VPO-TEST', pay_channel: 'virtual',
    openid: 'o_test', env: 1, created_at: now, paid_at: now, notify_at: now
  }, over)];
}
const refundEvent = (over = {}) => Object.assign({
  FromUserName: 'o_test', CreateTime: '1794274300', MsgType: 'event', Event: 'xpay_refund_notify',
  WxRefundId: 'VPR-A', MchRefundId: 'VP-TEST', WxOrderId: 'VPO-TEST', RefundFee: '990',
  RetCode: '0', RetMsg: 'OK', RefundStartTimestamp: '1794274300', RefundSuccTimestamp: '1794274300'
}, over);
const deliverEvent = () => ({
  FromUserName: 'o_test', MsgType: 'event', Event: 'xpay_goods_deliver_notify',
  OutTradeNo: 'VP-TEST', OpenId: 'o_test', Env: '1',
  GoodsInfo: { ProductId: 'source_check', Quantity: '1', OrigPrice: '990', ActualPrice: '990' },
  WeChatPayInfo: { MchOrderNo: 'VPO-TEST' }
});
function sign(ts, nonce) {
  return crypto.createHash('sha1').update([TOKEN, ts, nonce].sort().join('')).digest('hex');
}
async function push(event) {
  const ts = String(1794274300 + Math.floor(Math.random() * 1000));
  const nonce = 'n' + Math.random().toString(36).slice(2);
  const res = await handler({
    httpMethod: 'POST',
    queryStringParameters: { signature: sign(ts, nonce), timestamp: ts, nonce },
    body: JSON.stringify(event)
  });
  return { statusCode: res.statusCode, body: JSON.parse(res.body) };
}
const body = () => docs[0];

test('A 全额退款落 refunded，并写累计字段', async () => {
  seed();
  const r = await push(refundEvent({ RefundFee: '990', WxRefundId: 'VPR-FULL' }));
  assert.equal(r.body.ErrCode, 0);
  assert.equal(body().status, 'refunded');
  assert.equal(body().refunded_total, 990);
  assert.equal(body().refund_amount, 990);
  assert.ok(body().refunded_at);
});

test('B 部分退款自动收口为 partially_refunded，不冒充已退款', async () => {
  seed();
  const r = await push(refundEvent({ RefundFee: '400', WxRefundId: 'VPR-P1' }));
  assert.equal(r.body.ErrCode, 0);
  assert.equal(body().status, 'partially_refunded');
  assert.equal(body().refunded_total, 400);
  assert.equal(body().refund_amount, 400);
  assert.equal(body().refunded_at, undefined);
  assert.deepEqual(body().refund_wx_refs, ['VPR-P1']);
});

test('C 多笔部分退款累计到全额自动升级为 refunded', async () => {
  seed();
  await push(refundEvent({ RefundFee: '400', WxRefundId: 'VPR-P1' }));
  const r = await push(refundEvent({ RefundFee: '590', WxRefundId: 'VPR-P2' }));
  assert.equal(r.body.ErrCode, 0);
  assert.equal(body().status, 'refunded');
  assert.equal(body().refunded_total, 990);
  assert.ok(body().refunded_at);
  assert.equal(body().refund_wx_refs.length, 2);
});

test('D 同一 WxRefundId 重复推送不重复累计', async () => {
  seed({ status: 'partially_refunded', refunded_total: 400, refund_amount: 400, refund_wx_refs: ['VPR-P1'] });
  const r = await push(refundEvent({ RefundFee: '400', WxRefundId: 'VPR-P1' }));
  assert.equal(r.body.ErrCode, 0);
  assert.equal(body().status, 'partially_refunded');
  assert.equal(body().refunded_total, 400);
  assert.equal(body().refund_wx_refs.length, 1);
});

test('E 单笔退款超过订单金额被拒', async () => {
  seed();
  const r = await push(refundEvent({ RefundFee: '1200', WxRefundId: 'VPR-BIG' }));
  assert.equal(r.body.ErrCode, -1);
  assert.equal(body().status, 'delivered');
});

test('F 累计退款超过订单金额被拒', async () => {
  seed({ status: 'partially_refunded', refunded_total: 400, refund_amount: 400, refund_wx_refs: ['VPR-P1'] });
  const r = await push(refundEvent({ RefundFee: '700', WxRefundId: 'VPR-P3' }));
  assert.equal(r.body.ErrCode, -1);
  assert.equal(body().refunded_total, 400);
});

test('G 部分退款后的发货推送不改变订单状态', async () => {
  seed({ status: 'partially_refunded', refunded_total: 400, refund_amount: 400, refund_wx_refs: ['VPR-P1'] });
  const r = await push(deliverEvent());
  assert.equal(r.body.ErrCode, 0);
  assert.equal(body().status, 'partially_refunded');
});

test('H 未支付订单收到退款推送被拒', async () => {
  seed({ status: 'pending', paid_at: null });
  const r = await push(refundEvent({ RefundFee: '990', WxRefundId: 'VPR-PEND' }));
  assert.equal(r.body.ErrCode, -1);
  assert.equal(body().status, 'pending');
});

test('I RetCode != 0 确认收到但不写库', async () => {
  seed();
  const r = await push(refundEvent({ RetCode: '1', WxRefundId: 'VPR-FAIL' }));
  assert.equal(r.body.ErrCode, 0);
  assert.equal(body().status, 'delivered');
});
