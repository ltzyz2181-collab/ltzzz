'use strict';

// 客服消息推送的纯逻辑层：不依赖 wx-server-sdk，便于本地单测。

const ORDER_NO_RE = /VP\d{14}[0-9a-fA-F]{8}/;
const MAX_REPLY_LEN = 300;

const FOOTER = '说明：本会话由 AI 自动应答并自动登记；极少数需人工判断的问题会转交跟进；AI 不承诺自动交付，交付进度以「我的订单」页状态为准。';

const STATUS_TEXT = {
  pending: '待付款',
  paid: '已支付·待交付',
  delivered: '已交付',
  refunded: '已退款',
  closed: '已关闭',
  refunding: '退款处理中'
};

function clip(text) {
  if (typeof text !== 'string') return '';
  return text.length > MAX_REPLY_LEN ? text.slice(0, MAX_REPLY_LEN - 1) + '…' : text;
}

function extractOrderNo(text) {
  if (typeof text !== 'string') return null;
  const m = text.match(ORDER_NO_RE);
  return m ? m[0] : null;
}

function normalizePush(event) {
  const e = event || {};
  return {
    openid: e.FromUserName || '',
    toUser: e.ToUserName || '',
    msgType: e.MsgType || '',
    eventName: e.Event || '',
    content: typeof e.Content === 'string' ? e.Content.trim() : '',
    picUrl: e.PicUrl || '',
    mediaId: e.MediaId || '',
    title: e.Title || '',
    pagePath: e.PagePath || '',
    msgId: e.MsgId || '',
    createTime: Number(e.CreateTime) || 0
  };
}

// 同一个 <消息类型, 事件类型> 只会推到一个函数；这里再兜一层，避免对无关事件回话。
function shouldReply(msg) {
  if (!msg.openid) return false;
  if (msg.msgType === 'text' || msg.msgType === 'image' || msg.msgType === 'miniprogrampage') return true;
  if (msg.msgType === 'event' && msg.eventName === 'user_enter_tempsession') return true;
  return false;
}

function buildReply(msg, ctx) {
  const c = ctx || {};

  if (msg.msgType === 'event' && msg.eventName === 'user_enter_tempsession') {
    return clip('欢迎咨询世章 AI 助手。本会话由 AI 自动应答：下单后可在「我的订单」查看进度、上传材料；把订单号发我，我立刻查状态。');
  }

  if (msg.msgType === 'image') {
    return clip('图片已收到，已自动登记为材料。要对应到具体订单，请补发订单号（VP 开头的那串），我收到后即核对。' + '\n' + FOOTER);
  }

  if (msg.msgType === 'miniprogrampage') {
    return clip('您分享的小程序页面已收到并登记。查订单进度请直接回复订单号，或进入「我的订单」页。' + '\n' + FOOTER);
  }

  const order = c.order || null;
  const orderNo = c.orderNo || extractOrderNo(msg.content);

  if (orderNo && order) {
    const amount = Number.isFinite(Number(order.amount)) ? (Number(order.amount) / 100).toFixed(2) : '—';
    const status = STATUS_TEXT[order.status] || order.status || '未知';
    let body = `已查到订单 ${orderNo}：${order.product_name || '服务'} ¥${amount}，当前状态：${status}。`;
    if (order.status === 'paid') {
      body += '已进入交付流程，请在「我的订单」页上传原始清单，我收到后即开始核对。';
    } else if (order.status === 'delivered') {
      body += '交付物已发出，可在「我的订单」查看；如未收到请直接回复本条说明。';
    } else if (order.status === 'refunded' || order.status === 'refunding') {
      body += '退款进度已按订单状态同步；涉及金额调整的部分会由人工复核，结果回到本会话。';
    }
    return clip(body + '\n' + FOOTER);
  }

  if (orderNo && !order) {
    return clip(`未查到订单 ${orderNo}，请核对订单号是否完整；也可直接在「我的订单」页查看最新状态。` + '\n' + FOOTER);
  }

  const text = msg.content || '';
  if (/退款|退货/.test(text)) {
    return clip('退款请求已自动登记，进度会按订单状态在这里回复；涉及金额调整需人工复核，结果仍回到本会话。' + '\n' + FOOTER);
  }
  if (/人工|投诉|客服/.test(text)) {
    return clip('已收到。本会话由 AI 自动应答；如需人工介入，我会登记并转交，同时先把可自助的处理路径发你。订单问题请直接发订单号。' + '\n' + FOOTER);
  }

  return clip('已收到，AI 已自动登记并回复。查订单进度可在「我的订单」页，或把订单号发我，我立刻查。' + '\n' + FOOTER);
}

function buildMessageRecord(msg, extra) {
  const x = extra || {};
  return {
    msg_id: msg.msgId ? String(msg.msgId) : '',
    openid: msg.openid,
    msg_type: msg.msgType,
    event_name: msg.eventName,
    content: msg.content || '',
    pic_url: msg.picUrl || '',
    media_id: msg.mediaId || '',
    title: msg.title || '',
    page_path: msg.pagePath || '',
    create_time: msg.createTime,
    order_no: x.orderNo || extractOrderNo(msg.content) || '',
    replied: !!x.replied,
    reply_content: x.replyContent || '',
    received_at: new Date().toISOString()
  };
}

module.exports = {
  FOOTER,
  MAX_REPLY_LEN,
  STATUS_TEXT,
  clip,
  extractOrderNo,
  normalizePush,
  shouldReply,
  buildReply,
  buildMessageRecord,
  ORDER_NO_RE
};
