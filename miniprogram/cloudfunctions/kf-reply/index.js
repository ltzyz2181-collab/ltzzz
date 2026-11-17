'use strict';

const cloud = require('wx-server-sdk');
const logic = require('./lib/logic');
const wxapi = require('./lib/wxapi');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const MESSAGES = 'service_messages';

async function recordMessage(record) {
  try {
    const key = record.record_key || record.msg_id;
    if (key) {
      // 以统一幂等键作为 _id：文本/图片消息用 MsgId，事件推送用 evt_<event>_<openid>_<createTime>。
      await db.collection(MESSAGES).add({ data: Object.assign({ _id: key }, record) });
    } else {
      await db.collection(MESSAGES).add({ data: record });
    }
    return true;
  } catch (err) {
    const text = String((err && (err.errMsg || err.message)) || '');
    if (/duplicate|already exist|E11000/.test(text)) return false;
    console.error('record message failed', text);
    return true;
  }
}

async function findOrder(orderNo) {
  if (!orderNo) return null;
  try {
    const res = await db.collection('orders').where({ out_trade_no: orderNo }).limit(1).get();
    return (res.data || [])[0] || null;
  } catch (err) {
    console.error('find order failed', String((err && err.message) || err));
    return null;
  }
}

exports.main = async (event) => {
  const msg = logic.normalizePush(event);

  if (!logic.shouldReply(msg)) {
    if (msg.openid) await recordMessage(logic.buildMessageRecord(msg, { replied: false }));
    return 'success';
  }

  const orderNo = logic.extractOrderNo(msg.content);
  const order = await findOrder(orderNo);

  if (event && event.dryRun) {
    const content = logic.buildReply(msg, { order, orderNo });
    return { dryRun: true, wouldReply: true, content, orderNo, orderFound: !!order };
  }

  const fresh = await recordMessage(logic.buildMessageRecord(msg, { orderNo }));
  if (!fresh) return 'success'; // 重推消息不重复回话

  let replyContent = '';
  try {
    replyContent = logic.buildReply(msg, { order, orderNo });
    const appid = process.env.WX_APPID;
    const secret = process.env.WX_APPSECRET;
    if (!appid || !secret) throw new Error('WX_APPID/WX_APPSECRET not configured');
    await wxapi.sendText(db, appid, secret, msg.openid, replyContent);
  } catch (err) {
    console.error('auto reply failed', String((err && (err.errMsg || err.message)) || err));
    return 'success'; // 对微信始终返回 success，避免重试风暴
  }

  const replyKey = logic.recordKey(msg);
  if (replyKey) {
    try {
      await db.collection(MESSAGES).doc(replyKey).update({
        data: { replied: true, reply_content: replyContent, replied_at: new Date().toISOString() }
      });
    } catch (err) {
      // 回写回复结果失败不影响主流程
    }
  }

  return 'success';
};
