import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';

const source = fs.readFileSync(new URL('../../miniprogram/cloudfunctions/vpay-notify/index.js', import.meta.url), 'utf8');
const token = 'synthetic-push-token';
function fixture({ orderPatch = {}, pushToken = token, beforeUpdate } = {}) {
  const order = { _id: 'fixture-one', out_trade_no: 'VP-FIXTURE', openid: 'owner', product_id: 'source_check', amount: 990, env: 1, pay_channel: 'virtual', status: 'pending', ...orderPatch };
  let writes = 0, reads = 0;
  const match = condition => Object.entries(condition).every(([k,v]) => order[k] === v);
  const update = async (condition, { data }) => {
    if (beforeUpdate) beforeUpdate(order);
    if (!match(condition)) return { stats: { updated: 0 } };
    Object.assign(order, data); writes++;
    return { stats: { updated: 1 } };
  };
  const db = { collection: () => ({
    where: condition => ({ get: async () => { reads++; return { data: match(condition) ? [{ ...order }] : [] }; }, update: data => update(condition, data) }),
    doc: id => ({ update: data => update({ _id: id }, data) })
  }) };
  const cloud = { init() {}, database: () => db, getWXContext: () => ({ OPENID: 'client', SOURCE: 'wx_client' }) };
  const exports = {};
  vm.runInNewContext(source, { exports, require: name => name === 'wx-server-sdk' ? cloud : crypto, process: { env: { VPAY_PUSH_TOKEN: pushToken } }, Buffer, console: { log() {}, error() {} } });
  return { run: e => exports.main(e), order, writes: () => writes, reads: () => reads };
}
function delivery(patch = {}) {
  return { Event: 'xpay_goods_deliver_notify', OutTradeNo: 'VP-FIXTURE', OpenId: 'owner', Env: 1,
    WeChatPayInfo: { MchOrderNo: 'WX-FIXTURE' }, GoodsInfo: { ProductId: 'source_check', Quantity: 1, OrigPrice: 990, ActualPrice: 990 }, ...patch };
}
function signed(body, extra = {}) {
  const timestamp = '1794035434', nonce = 'fixture-nonce';
  const signature = crypto.createHash('sha1').update([token, timestamp, nonce].sort().join('')).digest('hex');
  return { httpMethod: 'POST', queryStringParameters: { signature, timestamp, nonce }, body: JSON.stringify(body), ...extra };
}

test('unsigned, wrong-token and direct client delivery calls cannot even read orders', async () => {
  for (const event of [{ httpMethod: 'POST', body: JSON.stringify(delivery()) }, signed(delivery(), { queryStringParameters: { signature: '0'.repeat(40), timestamp: '1794035434', nonce: 'fixture' } }), delivery()]) {
    const f = fixture(); const r = await f.run(event);
    assert.equal(r.statusCode === 403 || r.ErrCode !== 0, true);
    assert.equal(f.reads(), 0); assert.equal(f.writes(), 0);
  }
});
test('missing Token fails closed for GET and POST; signed GET alone echoes challenge', async () => {
  const f = fixture({ pushToken: '' });
  for (const httpMethod of ['GET', 'POST']) assert.equal((await f.run(signed(delivery(), { httpMethod }))).statusCode, 403);
  const good = fixture(); const request = signed({}, { httpMethod: 'GET' }); request.queryStringParameters.echostr = 'official-fixture-echo';
  assert.equal((await good.run(request)).body, 'official-fixture-echo'); assert.equal(good.reads(), 0);
});
test('matching signed delivery is paid once, without rewriting original order binding', async () => {
  const f = fixture();
  assert.equal((await f.run(signed(delivery()))).statusCode, 200);
  assert.equal(f.order.status, 'paid'); assert.equal(f.order.wx_order_id, 'WX-FIXTURE');
  await f.run(signed(delivery())); assert.equal(f.writes(), 1); assert.equal(f.order.env, 1);
});
test('owner, product, quantity, price, environment and channel mismatches leave order pending', async () => {
  const cases = [ { OpenId: 'other' }, { OpenId: undefined }, { Env: 0 }, { Env: undefined },
    { GoodsInfo: { ...delivery().GoodsInfo, ProductId: 'another' } }, { GoodsInfo: { ...delivery().GoodsInfo, Quantity: 2 } },
    { GoodsInfo: { ...delivery().GoodsInfo, OrigPrice: 1 } }, { GoodsInfo: { ...delivery().GoodsInfo, ActualPrice: 1 } },
    { GoodsInfo: { ...delivery().GoodsInfo, ActualPrice: undefined } }, { WeChatPayInfo: {} } ];
  for (const patch of cases) { const f = fixture(); await f.run(signed(delivery(patch))); assert.equal(f.writes(), 0, JSON.stringify(patch)); assert.equal(f.order.status, 'pending'); }
  const f = fixture({ orderPatch: { pay_channel: 'jsapi' } }); await f.run(signed(delivery())); assert.equal(f.writes(), 0);
});
test('delivery cannot reopen refunded, closed, or refund-reconciliation orders', async () => {
  for (const status of ['refunded', 'closed', 'refund_pending_verification']) { const f = fixture({ orderPatch: { status } }); await f.run(signed(delivery())); assert.equal(f.order.status, status); assert.equal(f.writes(), 0); }
});
test('atomic pending-only update preserves a refund that wins the race after the read', async () => {
  const f = fixture({ beforeUpdate: order => { order.status = 'refunded'; } });
  await f.run(signed(delivery())); assert.equal(f.order.status, 'refunded'); assert.equal(f.writes(), 0);
});
test('XML root is unwrapped and XML acknowledgement matches the event format', async () => {
  const body = '<xml><Event><![CDATA[xpay_goods_deliver_notify]]></Event><OutTradeNo>VP-FIXTURE</OutTradeNo><OpenId>owner</OpenId><Env>1</Env><WeChatPayInfo><MchOrderNo>WX-FIXTURE</MchOrderNo></WeChatPayInfo><GoodsInfo><ProductId>source_check</ProductId><Quantity>1</Quantity><OrigPrice>990</OrigPrice><ActualPrice>990</ActualPrice></GoodsInfo></xml>';
  const f = fixture(); const r = await f.run(signed({}, { body }));
  assert.equal(f.order.status, 'paid'); assert.match(r.body, /<ErrCode>0<\/ErrCode>/);
});
test('malformed, oversized, DTD and encrypted payloads never mutate orders', async () => {
  for (const body of ['{bad', '<!DOCTYPE xml><xml></xml>', '<xml><Event>bad</xml>', 'x'.repeat(70000), '{"Encrypt":"unverified-ciphertext"}']) {
    const f = fixture(); await f.run(signed({}, { body })); assert.equal(f.reads(), 0); assert.equal(f.writes(), 0);
  }
});
test('base64 HTTP body is verified before parsing and delivers the same bounded event', async () => {
  const f = fixture(); await f.run(signed({}, { body: Buffer.from(JSON.stringify(delivery())).toString('base64'), isBase64Encoded: true })); assert.equal(f.order.status, 'paid');
});
test('failed refund and unrelated refund do not turn any order into refunded', async () => {
  for (const RetCode of [undefined, -1, 0]) {
    const f = fixture({ orderPatch: { status: 'paid', wx_order_id: 'WX-FIXTURE' } });
    await f.run(signed({ Event: 'xpay_refund_notify', OutTradeNo: 'VP-FIXTURE', MchOrderId: 'OTHER', RetCode }));
    assert.equal(f.order.status, 'paid'); assert.equal(f.writes(), 0);
  }
});
test('bound successful refund signal pauses fulfillment, without inventing final refund proof', async () => {
  const f = fixture({ orderPatch: { status: 'paid', wx_order_id: 'WX-FIXTURE' } });
  const e = { Event: 'xpay_refund_notify', MchOrderId: 'VP-FIXTURE', WxOrderId: 'WX-FIXTURE', OpenId: 'owner', Env: 1, RetCode: 0, RefundFee: 990, MchRefundId: 'REF-FIXTURE', WxRefundId: 'WXREF-FIXTURE' };
  await f.run(signed(e)); assert.equal(f.order.status, 'refund_pending_verification');
  await f.run(signed(delivery())); assert.equal(f.order.status, 'refund_pending_verification'); assert.equal(f.writes(), 1);
});
test('unsupported HTTP methods and unknown orders are never acknowledged as paid', async () => {
  const f = fixture(); assert.equal((await f.run(signed(delivery(), { httpMethod: 'PUT' }))).statusCode, 405); assert.equal(f.writes(), 0);
  const g = fixture(); const r = await g.run(signed(delivery({ OutTradeNo: 'UNKNOWN' }))); assert.notEqual(JSON.parse(r.body).ErrCode, 0); assert.equal(g.writes(), 0);
});

function orderFixture({ openid = 'owner', session = { openid: 'owner', session_key: 'synthetic-session-key' }, requestError } = {}) {
  let requests = 0, writes = 0; const logs = [], exports = {};
  const cloud = { init() {}, getWXContext: () => ({ OPENID: openid }), database: () => ({ collection: () => ({ add: async () => { writes++; } }) }) };
  const https = { request: (_options, callback) => {
    requests++; const req = new EventEmitter(); req.destroy = () => {};
    req.end = () => { if (requestError) { req.emit('error', new Error(requestError)); return; }
      const res = new EventEmitter(); callback(res); res.emit('data', JSON.stringify(session)); res.emit('end'); };
    return req;
  } };
  vm.runInNewContext(fs.readFileSync(new URL('../../miniprogram/cloudfunctions/vpay-order/index.js', import.meta.url), 'utf8'), {
    exports, require: name => name === 'wx-server-sdk' ? cloud : name === 'https' ? https : crypto,
    process: { env: { WX_APP_SECRET: 'synthetic-app-secret', VPAY_APPKEY_SANDBOX: 'synthetic-sandbox-key' } },
    console: { error: (...items) => logs.push(items.join(' ')) }
  });
  return { run: () => exports.main({ productId: 'source_check', code: 'synthetic-code' }), requests: () => requests, writes: () => writes, logs };
}
test('order signing requires platform OPENID before sending a login code upstream', async () => {
  const f = orderFixture({ openid: null }); assert.equal((await f.run()).ok, false); assert.equal(f.requests(), 0); assert.equal(f.writes(), 0);
});
test('upstream login OPENID must match caller before an order or payment signature is returned', async () => {
  const f = orderFixture({ session: { openid: 'another', session_key: 'synthetic-session-key' } }); assert.equal((await f.run()).ok, false); assert.equal(f.writes(), 0);
  const good = orderFixture(); const r = await good.run(); assert.equal(r.ok, true); assert.equal(good.writes(), 1); assert.equal(r.env, 1); assert.equal(JSON.stringify(r).includes('synthetic-session-key'), false);
});
test('incomplete login response and transport errors cannot leak session keys or secret-bearing URLs', async () => {
  for (const options of [{ session: { session_key: 'DO_NOT_LOG_SESSION', errmsg: 'DO_NOT_LOG_RAW' } }, { requestError: 'https://official.example/?secret=DO_NOT_LOG_SECRET' }]) {
    const f = orderFixture(options); const r = await f.run(); assert.equal(r.ok, false); assert.equal(f.writes(), 0);
    assert.equal(JSON.stringify([r, f.logs]).includes('DO_NOT_LOG'), false);
  }
});
