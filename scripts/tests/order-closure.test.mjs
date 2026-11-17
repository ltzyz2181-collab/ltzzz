import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const root = new URL('../../', import.meta.url);
const read = p => fs.readFileSync(new URL(p, root), 'utf8');
const logic = require('../../miniprogram/cloudfunctions/order-deliver/lib/logic.js');

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function pageHarness({ payEnabled = true, cloudEnv = 'env-test' } = {}) {
  let page = null;
  const toasts = [];
  const wx = {
    showToast: o => toasts.push(o && o.title),
    cloud: { callFunction: null, uploadFile: null }
  };
  vm.runInNewContext(read('miniprogram/pages/orders/index.js'), {
    Page: p => { page = p; },
    wx,
    require: p => (p === '../../data/products'
      ? { products: [{ id: 'source-check', title: '资料来源核对清单' }] }
      : { payEnabled, cloudEnv }),
    console,
    Date,
    Number,
    String,
    Array,
    Object,
    JSON
  });
  page.setData = function (v) { Object.assign(this.data, v); };
  page.data = Object.assign({}, page.data);
  return { page, wx, toasts };
}

function fnHarness({ order = null, openid = 'user-1', adminOpenids = '' } = {}) {
  const writes = [];
  const command = { push: v => ({ __push: v }) };
  const collection = () => ({
    where: cond => ({
      get: async () => ({ data: order && Object.keys(cond).every(k => order[k] === cond[k]) ? [order] : [] }),
      update: async ({ data }) => {
        const matched = order && Object.keys(cond).every(k => order[k] === cond[k]);
        if (!matched) return { stats: { updated: 0 } };
        Object.entries(data).forEach(([k, v]) => {
          if (v && typeof v === 'object' && '__push' in v) {
            order[k] = (Array.isArray(order[k]) ? order[k] : []).concat(v.__push);
          } else {
            order[k] = v;
          }
        });
        writes.push({ cond, data });
        return { stats: { updated: 1 } };
      }
    })
  });
  const db = { command, collection };
  const cloud = {
    init: () => {},
    database: () => db,
    getWXContext: () => ({ OPENID: openid, APPID: 'wx562bcb6057346fb2' })
  };
  const exportsObj = {};
  vm.runInNewContext(read('miniprogram/cloudfunctions/order-deliver/index.js'), {
    exports: exportsObj,
    require: p => (p === 'wx-server-sdk' ? cloud : logic),
    process: { env: adminOpenids ? { ADMIN_OPENIDS: adminOpenids } : {} },
    console,
    Date,
    Number,
    String,
    Array,
    Object,
    Error,
    JSON
  });
  return { run: payload => exportsObj.main(payload), writes: () => writes, order };
}

const paidOrder = () => ({
  _id: 'doc-1',
  out_trade_no: 'VP20261112215711c7e626e9',
  openid: 'user-1',
  status: 'paid',
  amount: 990,
  intake: []
});

// ---------- 回归护栏：这次修的误报不许再回来 ----------

test('回归护栏：订单页失败分支不得再写 empty:true，页面必须提供重试与上传入口', () => {
  const page = read('miniprogram/pages/orders/index.js');
  assert.equal(/catch\(\s*\(\)\s*=>\s*this\.setData\(\{\s*loading:\s*false,\s*empty:\s*true/.test(page), false);
  const wxml = read('miniprogram/pages/orders/index.wxml');
  assert.match(wxml, /wx:elif="\{\{error\}\}"/);
  assert.match(wxml, /bindtap="retryLoad"/);
  assert.match(wxml, /bindtap="chooseAndUpload"/);
});

// ---------- 页面：误报修复 ----------

test('订单页：云函数抛错时进入错误态，不再渲染成「暂无订单」', async () => {
  const h = pageHarness();
  h.wx.cloud.callFunction = () => Promise.reject(new Error('network down'));
  h.page.loadOrders();
  await tick();
  assert.equal(h.page.data.loading, false);
  assert.equal(h.page.data.error, true);
  assert.equal(h.page.data.empty, false);
  assert.equal(h.page.data.orders.length, 0);
  assert.match(h.page.data.errorMessage, /加载失败/);
});

test('订单页：云函数返回 ok:false（数据库异常）同样进入错误态并带服务端原因', async () => {
  const h = pageHarness();
  h.wx.cloud.callFunction = () => Promise.resolve({ result: { ok: false, message: '数据库不可用' } });
  h.page.loadOrders();
  await tick();
  assert.equal(h.page.data.error, true);
  assert.equal(h.page.data.empty, false);
  assert.equal(h.page.data.errorMessage, '数据库不可用');
});

test('订单页：真的没有订单时才显示空态', async () => {
  const h = pageHarness();
  h.wx.cloud.callFunction = () => Promise.resolve({ result: { ok: true, orders: [] } });
  h.page.loadOrders();
  await tick();
  assert.equal(h.page.data.error, false);
  assert.equal(h.page.data.empty, true);
});

test('订单页：有订单时展示支付态、可上传入口与已提交材料', async () => {
  const h = pageHarness();
  h.wx.cloud.callFunction = () => Promise.resolve({
    result: {
      ok: true,
      orders: [{
        _id: 'doc-1',
        out_trade_no: 'VP20261112215711c7e626e9',
        product_id: 'source_check',
        title: '稿件源文核验（旧名）',
        amount: 990,
        status: 'paid',
        created_at: '2026-11-12T21:57:11.984Z',
        intake: [{ name: '台账.jpg', size: 1024, uploaded_at: '2026-11-13T04:10:00.000Z' }]
      }]
    }
  });
  h.page.loadOrders();
  await tick();
  const order = h.page.data.orders[0];
  assert.equal(h.page.data.empty, false);
  assert.equal(order.title, '资料来源核对清单');
  assert.equal(order.statusLabel, '已支付 · 待交付');
  assert.equal(order.canUpload, true);
  assert.equal(order.intakeFiles.length, 1);
  assert.equal(order.intakeFiles[0].name, '台账.jpg');
});

test('订单页：未配置云环境时进入错误态而不是空态', async () => {
  const h = pageHarness({ cloudEnv: '' });
  h.page.loadOrders();
  await tick();
  assert.equal(h.page.data.error, true);
  assert.equal(h.page.data.empty, false);
});

test('订单页：超过 10MB 的材料在客户端就被拦下，不发起上传', async () => {
  const h = pageHarness();
  let uploads = 0;
  const wx = h.wx;
  wx.chooseMessageFile = ({ success }) => success({ tempFiles: [{ name: 'big.pdf', path: '/tmp/big.pdf', size: 10 * 1024 * 1024 + 1 }] });
  wx.cloud.uploadFile = () => { uploads++; return Promise.resolve({ fileID: 'cloud://x' }); };
  h.page.chooseAndUpload({ currentTarget: { dataset: { trade: 'VP20261112215711c7e626e9' } } });
  assert.equal(uploads, 0);
  assert.equal(h.toasts[h.toasts.length - 1], '单个材料不能超过 10MB');
});

// ---------- 云函数：交付写入 ----------

test('order-deliver：未配置 ADMIN_OPENIDS 时拒绝一切交付写入（fail closed）', async () => {
  const h = fnHarness({ order: paidOrder(), openid: 'owner' });
  const r = await h.run({ action: 'deliver', outTradeNo: 'VP20261112215711c7e626e9', fileID: 'cloud://x/deliver/a.pdf', sha256: 'a'.repeat(64) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NOT_CONFIGURED');
  assert.equal(h.writes().length, 0);
});

test('order-deliver：白名单外的人即使已支付也无法标记交付', async () => {
  const h = fnHarness({ order: paidOrder(), openid: 'user-1', adminOpenids: 'admin-openid' });
  const r = await h.run({ action: 'deliver', outTradeNo: 'VP20261112215711c7e626e9', fileID: 'cloud://x/deliver/a.pdf', sha256: 'a'.repeat(64) });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'FORBIDDEN');
  assert.equal(h.writes().length, 0);
});

test('order-deliver：交付必须带 64 位 sha256，参数不全不写库', async () => {
  const h = fnHarness({ order: paidOrder(), openid: 'admin-openid', adminOpenids: 'admin-openid' });
  for (const sha256 of ['', 'abc', 'z'.repeat(64), undefined]) {
    const r = await h.run({ action: 'deliver', outTradeNo: 'VP20261112215711c7e626e9', fileID: 'cloud://x/deliver/a.pdf', sha256 });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'BAD_SHA256');
  }
  const missingFile = await h.run({ action: 'deliver', outTradeNo: 'VP20261112215711c7e626e9', sha256: 'a'.repeat(64) });
  assert.equal(missingFile.code, 'BAD_FILE');
  assert.equal(h.writes().length, 0);
});

test('order-deliver：管理员对 paid 单写入 delivered，重复调用幂等且不覆盖首次交付时间', async () => {
  const order = paidOrder();
  const h = fnHarness({ order, openid: 'admin-openid', adminOpenids: 'admin-openid,admin-2' });
  const sha = 'A'.repeat(64);
  const first = await h.run({ action: 'deliver', outTradeNo: order.out_trade_no, fileID: 'cloud://x/deliver/report.pdf', sha256: sha });
  assert.equal(first.ok, true);
  assert.equal(order.status, 'delivered');
  assert.equal(order.deliverable_sha256, 'a'.repeat(64));
  assert.equal(order.deliverable_file_id, 'cloud://x/deliver/report.pdf');
  assert.equal(order.delivered_by, 'admin-openid');
  assert.ok(order.delivered_at);
  assert.equal(h.writes().length, 1);

  const again = await h.run({ action: 'deliver', outTradeNo: order.out_trade_no, fileID: 'cloud://x/deliver/report.pdf', sha256: sha });
  assert.equal(again.ok, true);
  assert.equal(again.already, true);
  assert.equal(h.writes().length, 1);
  assert.equal(again.delivered_at, order.delivered_at);
});

test('order-deliver：未支付或已退款的订单不能被标记交付', async () => {
  for (const status of ['pending', 'refunded', 'partially_refunded']) {
    const order = Object.assign(paidOrder(), { status });
    const h = fnHarness({ order, openid: 'admin-openid', adminOpenids: 'admin-openid' });
    const r = await h.run({ action: 'deliver', outTradeNo: order.out_trade_no, fileID: 'cloud://x/deliver/a.pdf', sha256: 'a'.repeat(64) });
    assert.equal(r.ok, false);
    assert.equal(r.code, 'NOT_PAID');
    assert.equal(h.writes().length, 0);
  }
});

// ---------- 云函数：材料归档 ----------

test('order-deliver：别人不能往他人订单里塞材料', async () => {
  const order = paidOrder();
  const h = fnHarness({ order, openid: 'other-user' });
  const r = await h.run({ action: 'intake', outTradeNo: order.out_trade_no, fileID: 'cloud://env-x/intake/' + order.out_trade_no + '/1-a.pdf', fileName: 'a.pdf', size: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NOT_FOUND');
  assert.equal(h.writes().length, 0);
});

test('order-deliver：材料必须归档在本单订单号目录下', async () => {
  const order = paidOrder();
  const h = fnHarness({ order, openid: 'user-1' });
  const r = await h.run({ action: 'intake', outTradeNo: order.out_trade_no, fileID: 'cloud://env-x/intake/OTHER-ORDER/1-a.pdf', fileName: 'a.pdf', size: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'BAD_PATH');
  assert.equal(h.writes().length, 0);
});

test('order-deliver：合法材料写入 intake，超出上限后拒绝', async () => {
  const order = paidOrder();
  const h = fnHarness({ order, openid: 'user-1' });
  const payload = {
    action: 'intake',
    outTradeNo: order.out_trade_no,
    fileID: 'cloud://env-x/intake/' + order.out_trade_no + '/1730000000-台账.jpg',
    fileName: '台账.jpg',
    size: 1024
  };
  const r = await h.run(payload);
  assert.equal(r.ok, true);
  assert.equal(r.intakeCount, 1);
  assert.equal(order.intake.length, 1);
  assert.equal(order.intake[0].name, '台账.jpg');
  assert.ok(order.intake[0].uploaded_at);

  const full = [];
  for (let i = 0; i < logic.MAX_INTAKE; i++) full.push({ file_id: 'cloud://env-x/intake/' + order.out_trade_no + '/' + i, name: 'f' + i, size: 1, uploaded_at: '' });
  const capped = Object.assign(paidOrder(), { intake: full });
  const h2 = fnHarness({ order: capped, openid: 'user-1' });
  const fullRes = await h2.run(payload);
  assert.equal(fullRes.ok, false);
  assert.equal(fullRes.code, 'INTAKE_FULL');
  assert.equal(h2.writes().length, 0);
});

test('order-deliver：未支付订单不接受材料，超限大小在服务端也会被拦', async () => {
  const order = Object.assign(paidOrder(), { status: 'pending' });
  const h = fnHarness({ order, openid: 'user-1' });
  const r = await h.run({ action: 'intake', outTradeNo: order.out_trade_no, fileID: 'cloud://env-x/intake/' + order.out_trade_no + '/1-a.pdf', fileName: 'a.pdf', size: 10 });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'NOT_PAID');

  const order2 = paidOrder();
  const h2 = fnHarness({ order: order2, openid: 'user-1' });
  const big = await h2.run({ action: 'intake', outTradeNo: order2.out_trade_no, fileID: 'cloud://env-x/intake/' + order2.out_trade_no + '/1-a.pdf', fileName: 'a.pdf', size: 10 * 1024 * 1024 + 1 });
  assert.equal(big.ok, false);
  assert.equal(big.code, 'FILE_TOO_LARGE');
});

// ---------- 判定逻辑本身 ----------

test('order-deliver 判定逻辑：白名单解析与基本校验', () => {
  assert.deepEqual(logic.parseAdminList(' a , b ,, '), ['a', 'b']);
  assert.deepEqual(logic.parseAdminList(''), []);
  assert.deepEqual(logic.parseAdminList(undefined), []);
  assert.equal(logic.isAdmin(['a'], 'a'), true);
  assert.equal(logic.isAdmin(['a'], ''), false);
  assert.equal(logic.isAdmin([], 'a'), false);
  assert.equal(logic.isSha256('a'.repeat(64)), true);
  assert.equal(logic.isSha256('a'.repeat(63)), false);
  assert.equal(logic.isTradeNo('VP20261112215711c7e626e9'), true);
  assert.equal(logic.isTradeNo('short'), true);
  assert.equal(logic.isTradeNo('../etc'), false);
  assert.equal(logic.isIntakeFileId('cloud://env-x/intake/VP1/1-a.pdf', 'VP1'), true);
  assert.equal(logic.isIntakeFileId('cloud://env-x/intake/VP1x/1-a.pdf', 'VP1'), false);
  assert.equal(logic.isIntakeFileId('https://example.com/a.pdf', 'VP1'), false);
});
