'use strict';

const cloud = require('wx-server-sdk');
const logic = require('./lib/logic');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

// 管理员白名单：云函数环境变量 ADMIN_OPENIDS（逗号分隔）。未配置时交付写入一律拒绝。
const ADMIN_OPENIDS = logic.parseAdminList(process.env.ADMIN_OPENIDS);

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, code: 'NO_IDENTITY', message: '请重新进入小程序' };
  const action = event && event.action;
  if (action === 'intake') return handleIntake(event, OPENID);
  if (action === 'deliver') return handleDeliver(event, OPENID);
  return { ok: false, code: 'UNKNOWN_ACTION', message: '未知操作' };
};

// 客户按订单号提交材料：只允许订单归属人上传，材料先落云存储，再把 fileID 记进 orders.intake。
async function handleIntake(event, openid) {
  const outTradeNo = event && event.outTradeNo;
  if (!logic.isTradeNo(outTradeNo)) return { ok: false, code: 'BAD_TRADE_NO', message: '订单号无效' };

  let entry;
  try {
    entry = logic.normalizeIntake({
      fileID: event.fileID,
      fileName: event.fileName,
      size: event.size,
      now: new Date().toISOString()
    });
  } catch (err) {
    return { ok: false, code: err.code || 'BAD_INPUT', message: err.message || '材料无效' };
  }

  if (!logic.isIntakeFileId(entry.file_id, outTradeNo)) {
    return { ok: false, code: 'BAD_PATH', message: '材料未按本单订单号归档，请重新上传' };
  }

  const found = await db.collection('orders').where({ out_trade_no: outTradeNo, openid }).get();
  const order = (found.data || [])[0];
  if (!order) return { ok: false, code: 'NOT_FOUND', message: '未找到属于你的订单' };
  if (order.status !== 'paid' && order.status !== 'delivered') {
    return { ok: false, code: 'NOT_PAID', message: '订单未支付，暂不能提交材料' };
  }

  const existing = Array.isArray(order.intake) ? order.intake : [];
  if (existing.length >= logic.MAX_INTAKE) {
    return { ok: false, code: 'INTAKE_FULL', message: '材料已达 ' + logic.MAX_INTAKE + ' 个上限，请联系人工客服' };
  }

  await db.collection('orders').where({ _id: order._id, openid }).update({
    data: { intake: _.push(entry) }
  });
  return { ok: true, intakeCount: existing.length + 1, name: entry.name, uploaded_at: entry.uploaded_at };
}

// 管理员人工确认后写交付：只有 paid 单可推进，重复调用幂等返回，不覆盖首次交付时间。
async function handleDeliver(event, openid) {
  if (!ADMIN_OPENIDS.length) {
    return { ok: false, code: 'NOT_CONFIGURED', message: '未配置管理员白名单（ADMIN_OPENIDS）' };
  }
  if (!logic.isAdmin(ADMIN_OPENIDS, openid)) {
    return { ok: false, code: 'FORBIDDEN', message: '没有交付权限' };
  }

  const outTradeNo = event && event.outTradeNo;
  if (!logic.isTradeNo(outTradeNo)) return { ok: false, code: 'BAD_TRADE_NO', message: '订单号无效' };

  let patch;
  try {
    patch = logic.buildDeliverPatch({
      sha256: event.sha256,
      fileID: event.fileID,
      openid,
      now: new Date().toISOString()
    });
  } catch (err) {
    return { ok: false, code: err.code || 'BAD_INPUT', message: err.message || '交付参数无效' };
  }

  const found = await db.collection('orders').where({ out_trade_no: outTradeNo }).get();
  const order = (found.data || [])[0];
  if (!order) return { ok: false, code: 'NOT_FOUND', message: '订单不存在' };
  if (order.status === 'delivered') {
    return { ok: true, already: true, delivered_at: order.delivered_at || null };
  }
  if (order.status !== 'paid') {
    return { ok: false, code: 'NOT_PAID', message: '仅已支付订单可标记交付（当前：' + order.status + '）' };
  }

  // 条件更新：只有仍是 paid 的那条记录会被改写，避免并发重复交付。
  const res = await db.collection('orders').where({ _id: order._id, status: 'paid' }).update({ data: patch });
  const updated = (res && res.stats && res.stats.updated) || 0;
  if (updated !== 1) return { ok: false, code: 'RACE', message: '订单状态已变化，请刷新后重试' };
  return { ok: true, delivered_at: patch.delivered_at, deliverable_sha256: patch.deliverable_sha256 };
}
