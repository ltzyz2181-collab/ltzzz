const cloud = require('wx-server-sdk');
const crypto = require('crypto');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ── 小程序虚拟支付消息推送接收（HTTP 网关 + 云函数调用双通道）─────────────
// 通道 A：HTTP 网关路由 /vpay-notify（微信公众平台「消息推送」自定义服务器模式）
//   GET  → 平台验证 URL，原样回 echostr（校验 sha1 签名）
//   POST → 事件推送，JSON / XML 均可，回 {"ErrCode":0,"ErrMsg":"success"}
// 通道 B：直接云函数调用（event 里直接带 Event 字段）
// 发货以本推送为主；推送丢失时由订单页/人工核对兜底。
// 幂等：以业务单号 outTradeNo 判定，重复推送只置一次 paid。

const PUSH_TOKEN = process.env.VPAY_PUSH_TOKEN || '';

function pickString(v) {
  return typeof v === 'string' ? v : (v == null ? '' : String(v));
}

function checkSignature(query) {
  if (!PUSH_TOKEN) return true; // 未配置令牌时不强制校验，避免把自己锁死
  const { signature, timestamp, nonce } = query || {};
  if (!signature || !timestamp || !nonce) return false;
  const raw = [PUSH_TOKEN, timestamp, nonce].sort().join('');
  const calc = crypto.createHash('sha1').update(raw).digest('hex');
  return calc === signature;
}

// 极简 XML → 对象（只处理一层嵌套，够消息推送用）
function parseXml(xml) {
  const out = {};
  const re = /<(\w+)>(?:<!\[CDATA\[([\s\S]*?)\]\]>|([\s\S]*?))<\/\1>/g;
  let m;
  while ((m = re.exec(xml)) !== null) {
    const key = m[1];
    const val = m[2] !== undefined ? m[2] : m[3];
    if (/^<\w+>/.test(val.trim())) {
      out[key] = parseXml(val);
    } else {
      out[key] = val.trim();
    }
  }
  return out;
}

function normalizeEvent(raw) {
  if (raw && typeof raw === 'object') return raw;
  const text = pickString(raw).trim();
  if (!text) return {};
  if (text[0] === '{') {
    try { return JSON.parse(text); } catch (e) { return {}; }
  }
  if (text[0] === '<') return parseXml(text);
  return {};
}

async function handleDeliver(e) {
  const outTradeNo = pickString(e.OutTradeNo);
  const payInfo = e.WeChatPayInfo || {};
  const wxOrderId = pickString(payInfo.MchOrderNo);
  const goods = e.GoodsInfo || {};
  const productId = pickString(goods.ProductId);
  const env = Number(e.Env || 0);

  if (!outTradeNo) {
    console.error('deliver notify without outTradeNo');
    return { ErrCode: 0, ErrMsg: 'success' };
  }

  const found = await db.collection('orders').where({ out_trade_no: outTradeNo }).get();
  const order = (found.data || [])[0];
  if (!order) {
    console.error('deliver notify for unknown order', outTradeNo);
    return { ErrCode: 0, ErrMsg: 'success' };
  }
  if (order.status === 'paid' || order.status === 'delivered') {
    return { ErrCode: 0, ErrMsg: 'success' };
  }

  await db.collection('orders').doc(order._id).update({
    data: {
      status: 'paid',
      paid_at: new Date().toISOString(),
      wx_order_id: wxOrderId,
      env: env,
      notify_product_id: productId,
      notify_quantity: Number(goods.Quantity || 1),
      notify_at: new Date().toISOString()
    }
  });
  console.log('order paid', outTradeNo, wxOrderId);
  return { ErrCode: 0, ErrMsg: 'success' };
}

async function handleRefund(e) {
  const outTradeNo = pickString(e.OutTradeNo);
  if (!outTradeNo) return { ErrCode: 0, ErrMsg: 'success' };
  const found = await db.collection('orders').where({ out_trade_no: outTradeNo }).get();
  const order = (found.data || [])[0];
  if (!order) return { ErrCode: 0, ErrMsg: 'success' };
  await db.collection('orders').doc(order._id).update({
    data: { status: 'refunded', refunded_at: new Date().toISOString() }
  });
  return { ErrCode: 0, ErrMsg: 'success' };
}

async function dispatch(e) {
  if (e.Event === 'xpay_goods_deliver_notify') return await handleDeliver(e);
  if (e.Event === 'xpay_refund_notify') return await handleRefund(e);
  console.log('vpay notify ignored event', pickString(e.Event));
  return { ErrCode: 0, ErrMsg: 'success' };
}

function httpReply(statusCode, contentType, body) {
  return { statusCode: statusCode, headers: { 'Content-Type': contentType }, body: body };
}

exports.main = async function (event) {
  const e = event || {};
  try {
    // HTTP 网关形态
    if (e.httpMethod) {
      const method = String(e.httpMethod).toUpperCase();
      const query = e.queryString || e.queryStringParameters || {};
      if (method === 'GET') {
        const echo = pickString(query.echostr);
        if (!checkSignature(query)) {
          console.error('push verify signature mismatch');
          return httpReply(403, 'text/plain', 'invalid signature');
        }
        console.log('push verify ok');
        return httpReply(200, 'text/plain', echo);
      }
      let body = e.body;
      if (e.isBase64Encoded && typeof body === 'string') {
        body = Buffer.from(body, 'base64').toString('utf8');
      }
      const payload = normalizeEvent(body);
      console.log('vpay notify(http)', pickString(payload.Event), pickString(payload.OutTradeNo));
      const result = await dispatch(payload);
      return httpReply(200, 'application/json', JSON.stringify(result));
    }
    // 云函数直接调用形态
    console.log('vpay notify(call)', pickString(e.Event), pickString(e.OutTradeNo));
    return await dispatch(e);
  } catch (err) {
    console.error('vpay notify failed', err && err.message);
    // 返回非 0 会触发平台重试，这里保留错误让重试机制兜底
    const fail = { ErrCode: -1, ErrMsg: (err && err.message) || 'error' };
    if (e.httpMethod) return httpReply(200, 'application/json', JSON.stringify(fail));
    return fail;
  }
};
