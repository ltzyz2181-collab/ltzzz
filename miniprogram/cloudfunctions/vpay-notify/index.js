const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const PUSH_TOKEN = process.env.VPAY_PUSH_TOKEN || '';
const MAX_BODY_BYTES = 64 * 1024;
const success = () => ({ ErrCode: 0, ErrMsg: 'success' });
const fail = code => { throw new Error(code); };
const text = value => typeof value === 'string' ? value : '';
const object = value => value && typeof value === 'object' && !Array.isArray(value);
function integer(value) {
  if (typeof value === 'string' && /^(0|[1-9]\d*)$/.test(value)) value = Number(value);
  return Number.isSafeInteger(value) && value >= 0 ? value : -1;
}

// Current deployment uses MP plaintext message push over HTTPS. Token signature
// is the documented inbound protocol, not the outbound virtual-payment paySig.
// Missing configuration NEVER opens the endpoint. Safe/encrypted mode requires
// a separate, verified AES implementation/config migration; reject it meanwhile.
function checkSignature(query) {
  if (!PUSH_TOKEN || !object(query)) return false;
  const { signature, timestamp, nonce } = query;
  if (!/^[a-f0-9]{40}$/.test(text(signature)) || !/^\d{1,16}$/.test(text(timestamp)) || !text(nonce) || nonce.length > 256) return false;
  const digest = crypto.createHash('sha1').update([PUSH_TOKEN, timestamp, nonce].sort().join('')).digest();
  return crypto.timingSafeEqual(digest, Buffer.from(signature, 'hex'));
}

// Bounded, non-entity-expanding parser for MP's nested message fields. Reject
// malformed/duplicate fields instead of accepting an ambiguous payment proof.
function parseXml(xml, depth = 0) {
  if (depth > 6) fail('invalid_payload');
  const out = Object.create(null);
  const re = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
  let m, cursor = 0;
  while ((m = re.exec(xml))) {
    if (xml.slice(cursor, m.index).trim() || Object.hasOwn(out, m[1])) fail('invalid_payload');
    const value = m[2] === undefined ? m[3].trim() : m[2];
    out[m[1]] = m[2] === undefined && value.startsWith('<') ? parseXml(value, depth + 1) : value;
    cursor = re.lastIndex;
  }
  if (!cursor || xml.slice(cursor).trim()) fail('invalid_payload');
  return out;
}
function normalizeEvent(raw) {
  if (object(raw)) {
    if (Buffer.byteLength(JSON.stringify(raw)) > MAX_BODY_BYTES) fail('invalid_payload');
    if (raw.Encrypt) fail('encrypted_mode_not_configured');
    return { event: raw, xml: false };
  }
  if (typeof raw !== 'string' || Buffer.byteLength(raw) > MAX_BODY_BYTES) fail('invalid_payload');
  let input = raw.trim();
  let event, xml = false;
  if (input.startsWith('{')) {
    try { event = JSON.parse(input); } catch (_) { fail('invalid_payload'); }
  } else if (input.startsWith('<')) {
    if (/<!DOCTYPE|<!ENTITY/i.test(input)) fail('invalid_payload');
    input = input.replace(/^<\?xml[^?]*\?>\s*/, '');
    const root = parseXml(input);
    if (Object.keys(root).length !== 1 || !object(root.xml)) fail('invalid_payload');
    event = root.xml; xml = true;
  } else fail('invalid_payload');
  if (!object(event)) fail('invalid_payload');
  if (event.Encrypt) fail('encrypted_mode_not_configured');
  return { event, xml };
}

async function findOrder(outTradeNo) {
  if (!text(outTradeNo) || outTradeNo.length > 64) fail('invalid_order_reference');
  const found = await db.collection('orders').where({ out_trade_no: outTradeNo }).get();
  if (!Array.isArray(found.data) || found.data.length !== 1) fail('order_not_unique_or_unavailable');
  return found.data[0];
}
// Refund push carries the payment's WxOrderId and no OpenId/Env, so refund
// binding resolves through the stored wx_order_id written at delivery time.
async function findOrderByWxRef(wxOrderId) {
  if (!text(wxOrderId) || wxOrderId.length > 128) fail('invalid_order_reference');
  const found = await db.collection('orders').where({ wx_order_id: wxOrderId }).get();
  if (!Array.isArray(found.data) || found.data.length !== 1) fail('order_not_unique_or_unavailable');
  return found.data[0];
}
function checkOwnerAndEnvironment(event, order) {
  if (order.pay_channel !== 'virtual' || !text(order.openid) || event.OpenId !== order.openid) fail('order_binding_mismatch');
  const env = integer(event.Env);
  if (![0, 1].includes(env) || env !== order.env) fail('order_binding_mismatch');
}
function orderCondition(order) {
  return { _id: order._id, status: order.status, openid: order.openid, env: order.env,
    product_id: order.product_id, amount: order.amount, pay_channel: 'virtual' };
}
async function handleDeliver(event) {
  const order = await findOrder(event.OutTradeNo);
  checkOwnerAndEnvironment(event, order);
  const goods = event.GoodsInfo || {}, wxOrderId = text(event.WeChatPayInfo?.MchOrderNo);
  // Current catalogue only sells one item, without discounts. Missing price is
  // unknown, not proof of payment; keep the order pending for reconciliation.
  if (goods.ProductId !== order.product_id || integer(goods.Quantity) !== 1 || !Number.isSafeInteger(order.amount) || order.amount <= 0 ||
      integer(goods.OrigPrice) !== order.amount || integer(goods.ActualPrice) !== order.amount || !wxOrderId || wxOrderId.length > 128) fail('order_payment_mismatch');
  if (['paid', 'delivered'].includes(order.status)) {
    if (order.wx_order_id !== wxOrderId) fail('payment_reference_conflict');
    return success();
  }
  if (['refunded', 'closed', 'refund_pending_verification'].includes(order.status)) return success();
  if (order.status !== 'pending') fail('order_state_conflict');
  const now = new Date().toISOString();
  const result = await db.collection('orders').where(orderCondition(order)).update({ data: {
    status: 'paid', paid_at: now, wx_order_id: wxOrderId,
    notify_product_id: goods.ProductId, notify_quantity: 1, notify_at: now
  } });
  if (result.stats?.updated !== 1) {
    const current = await findOrder(event.OutTradeNo);
    if (!['refunded', 'closed', 'refund_pending_verification'].includes(current.status) &&
        !(['paid', 'delivered'].includes(current.status) && current.wx_order_id === wxOrderId)) fail('order_state_conflict');
  }
  return success();
}
async function handleRefund(event) {
  // A platform-attested refund for a bound order is the refund receipt itself.
  // Owner decided (2026-11-09) that a FULL refund closes the order as `refunded`.
  // A PARTIAL refund is not the whole order: it pauses fulfillment and stays
  // `refund_pending_verification` for reconciliation instead of claiming full refund.
  if (integer(event.RetCode) !== 0) {
    if (event.RetCode === undefined) fail('refund_result_missing');
    return success();
  }
  const wxOrderId = text(event.WxOrderId);
  const order = await findOrderByWxRef(wxOrderId);
  if (order.pay_channel !== 'virtual' || !text(order.wx_order_id) || order.wx_order_id !== wxOrderId) fail('refund_binding_mismatch');
  const amount = integer(event.RefundFee);
  if (!text(event.MchRefundId) || !text(event.WxRefundId) ||
      amount <= 0 || amount > order.amount) fail('refund_binding_mismatch');
  if (['refunded', 'refund_pending_verification'].includes(order.status)) return success();
  if (!['paid', 'delivered'].includes(order.status)) fail('refund_state_unverified');
  const now = new Date().toISOString(), full = amount === order.amount;
  const result = await db.collection('orders').where(orderCondition(order)).update({ data: full ? {
    status: 'refunded', refunded_at: now, refund_signal_at: now,
    refund_amount: amount, refund_reference: event.MchRefundId,
    wx_refund_reference: event.WxRefundId
  } : {
    status: 'refund_pending_verification', refund_signal_at: now,
    refund_amount_pending: amount, refund_reference_pending: event.MchRefundId,
    wx_refund_reference_pending: event.WxRefundId
  } });
  if (result.stats?.updated !== 1) fail('refund_state_conflict');
  return success();
}
async function dispatch(event) {
  if (event.Event === 'xpay_goods_deliver_notify') return handleDeliver(event);
  if (event.Event === 'xpay_refund_notify') return handleRefund(event);
  if (text(event.Event).startsWith('xpay_')) fail('event_not_supported');
  return success();
}
const httpReply = (statusCode, contentType, body) => ({ statusCode, headers: { 'Content-Type': contentType }, body });

exports.main = async function (event) {
  const request = event || {};
  // Caller-controlled Event/OPENID/SOURCE cannot establish platform ingress.
  // Only the configured HTTP push route is enabled by this deployment.
  if (!request.httpMethod) return { ErrCode: 403, ErrMsg: 'authenticated_http_push_required' };
  const method = text(request.httpMethod).toUpperCase();
  if (!['GET', 'POST'].includes(method)) return httpReply(405, 'text/plain', 'method not allowed');
  const query = request.queryStringParameters || request.queryString;
  if (!checkSignature(query)) return httpReply(403, 'text/plain', 'invalid signature');
  if (method === 'GET') return httpReply(200, 'text/plain', text(query.echostr));
  let xml = false;
  try {
    let body = request.body;
    if (request.isBase64Encoded) {
      if (typeof body !== 'string' || body.length > Math.ceil(MAX_BODY_BYTES / 3) * 4) fail('invalid_payload');
      body = Buffer.from(body, 'base64').toString('utf8');
    }
    const normalized = normalizeEvent(body); xml = normalized.xml;
    const result = await dispatch(normalized.event);
    return httpReply(200, xml ? 'application/xml' : 'application/json', xml ? '<xml><ErrCode>0</ErrCode><ErrMsg><![CDATA[success]]></ErrMsg></xml>' : JSON.stringify(result));
  } catch (error) {
    // Never echo provider/network errors, URLs, payloads or credentials.
    // Only our own fail() codes (lowercase snake case) are safe to log.
    const code = typeof error?.message === 'string' && /^[a-z][a-z0-9_]{2,63}$/.test(error.message)
      ? error.message : 'unclassified';
    console.error('vpay_notification_unverified', code);
    return httpReply(200, xml ? 'application/xml' : 'application/json', xml ? '<xml><ErrCode>-1</ErrCode><ErrMsg><![CDATA[notification_unverified]]></ErrMsg></xml>' : JSON.stringify({ ErrCode: -1, ErrMsg: 'notification_unverified' }));
  }
};
