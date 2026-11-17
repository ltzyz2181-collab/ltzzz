// Order page refund display.
// Run: node --test scripts/tests/order-refund-display.test.mjs
//
// F1 (2026-11-11 receipt): a legacy/manually-written order in
// partially_refunded with refunded_total === amount must render as 已退款,
// not as a "部分退款" row that has no remaining amount.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const SRC = path.resolve(here, '../../miniprogram/pages/orders/index.js');
const source = fs.readFileSync(SRC, 'utf8');

function loadPage({orders, payEnabled = true}) {
  let def = null;
  const context = {
    require: name => {
      if (name.includes('data/products')) return {products: [{id: 'source-check', title: '资料来源核对清单'}]};
      if (name.includes('config')) return {payEnabled, cloudEnv: 'test-env'};
      throw new Error('unexpected require: ' + name);
    },
    Page: value => { def = value; },
    wx: {cloud: {callFunction: async () => ({result: {ok: true, orders}})}},
    console,
  };
  vm.runInNewContext(source, context);
  assert.ok(def, 'Page() was not registered');
  const page = {...def, data: {...def.data}};
  page.setData = patch => Object.assign(page.data, patch);
  return page;
}

const base = {
  _id: 'ord1', out_trade_no: 'VP-1', product_id: 'source_check',
  amount: 990, created_at: '2026-11-16T03:00:00Z',
};

test('F1: partially_refunded that already returned the full amount renders as 已退款', async () => {
  const page = loadPage({orders: [{...base, status: 'partially_refunded', refunded_total: 990, refund_signal_at: '2026-11-16T04:00:00Z'}]});
  await page.loadOrders();
  const [row] = page.data.orders;
  assert.equal(row.statusLabel, '已退款');
  assert.equal(row.refundedLabel, '9.90');
  assert.equal(row.remainingLabel, '');
  assert.match(row.refundNote, /退款已完成，交付不再进行/);
  assert.match(row.refundTimeLabel, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('genuine partial refund still shows amount, remaining and pause note', async () => {
  const page = loadPage({orders: [{...base, status: 'partially_refunded', refunded_total: 500, refund_signal_at: '2026-11-16T04:00:00Z'}]});
  await page.loadOrders();
  const [row] = page.data.orders;
  assert.equal(row.statusLabel, '部分退款 · 已暂停交付');
  assert.equal(row.refundedLabel, '5.00');
  assert.equal(row.remainingLabel, '4.90');
  assert.match(row.refundNote, /剩余款项若继续退款/);
});

test('refund_pending_verification never fabricates a refunded amount', async () => {
  const page = loadPage({orders: [{...base, status: 'refund_pending_verification'}]});
  await page.loadOrders();
  const [row] = page.data.orders;
  assert.equal(row.statusLabel, '退款核对中 · 已暂停交付');
  assert.equal(row.refundedLabel, '');
  assert.equal(row.remainingLabel, '');
  assert.match(row.refundNote, /退款正在与支付渠道核对/);
});

test('refunded keeps the recorded refund time', async () => {
  const page = loadPage({orders: [{...base, status: 'refunded', refunded_total: 990, refunded_at: '2026-11-09T09:44:00Z'}]});
  await page.loadOrders();
  const [row] = page.data.orders;
  assert.equal(row.statusLabel, '已退款');
  assert.equal(row.refundedLabel, '9.90');
  assert.match(row.refundTimeLabel, /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/);
});

test('refund_amount fallback is used when refunded_total is absent', async () => {
  const page = loadPage({orders: [{...base, status: 'partially_refunded', refund_amount: 490}]});
  await page.loadOrders();
  const [row] = page.data.orders;
  assert.equal(row.refundedLabel, '4.90');
  assert.equal(row.remainingLabel, '5.00');
});

test('pending orders stay hidden while payment is disabled', async () => {
  const page = loadPage({payEnabled: false, orders: [{...base, status: 'pending'}, {...base, _id: 'ord2', status: 'refunded', refunded_total: 990}]});
  await page.loadOrders();
  assert.deepEqual(page.data.orders.map(o => o._id), ['ord2']);
});
