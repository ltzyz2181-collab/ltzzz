'use strict';

import test from 'node:test';
import assert from 'node:assert';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const logic = require('../../miniprogram/cloudfunctions/kf-reply/lib/logic.js');
const wxapi = require('../../miniprogram/cloudfunctions/kf-reply/lib/wxapi.js');

const PAID_ORDER = {
  out_trade_no: 'VP20261112215711c7e626e9',
  amount: 990,
  status: 'paid',
  product_name: '资料来源核对清单'
};

test('能从自然语言里抠出订单号', () => {
  assert.equal(logic.extractOrderNo('我的单 VP20261112215711c7e626e9 什么时候交付'), 'VP20261112215711c7e626e9');
  assert.equal(logic.extractOrderNo('vp20261112215711c7e626e9'), null, '前缀必须大写');
  assert.equal(logic.extractOrderNo('没有单号'), null);
  assert.equal(logic.extractOrderNo(null), null);
});

test('只对该回的消息回话', () => {
  const base = { openid: 'o1', msgType: 'text', eventName: '', content: 'hi' };
  assert.equal(logic.shouldReply(logic.normalizePush({ FromUserName: 'o1', MsgType: 'text', Content: 'hi' })), true);
  assert.equal(logic.shouldReply(logic.normalizePush({ FromUserName: 'o1', MsgType: 'image', PicUrl: 'x' })), true);
  assert.equal(logic.shouldReply(logic.normalizePush({ FromUserName: 'o1', MsgType: 'event', Event: 'user_enter_tempsession' })), true);
  assert.equal(logic.shouldReply(logic.normalizePush({ FromUserName: 'o1', MsgType: 'event', Event: 'wxa_media_check' })), false);
  assert.equal(logic.shouldReply(logic.normalizePush({ FromUserName: '', MsgType: 'text', Content: 'hi' })), false);
  assert.ok(base);
});

test('命中订单时回复真实状态与金额', () => {
  const msg = logic.normalizePush({ FromUserName: 'o1', MsgType: 'text', Content: '查一下 VP20261112215711c7e626e9' });
  const reply = logic.buildReply(msg, { order: PAID_ORDER, orderNo: PAID_ORDER.out_trade_no });
  assert.match(reply, /VP20261112215711c7e626e9/);
  assert.match(reply, /9\.90/);
  assert.match(reply, /已支付·待交付/);
  assert.match(reply, /上传原始清单/);
});

test('未命中的订单号不乱承诺', () => {
  const msg = logic.normalizePush({ FromUserName: 'o1', MsgType: 'text', Content: 'VP20990101010101abcdef01' });
  const reply = logic.buildReply(msg, { order: null, orderNo: 'VP20990101010101abcdef01' });
  assert.match(reply, /未查到订单/);
  assert.doesNotMatch(reply, /已支付/);
});

test('图片消息按材料登记并索要订单号', () => {
  const msg = logic.normalizePush({ FromUserName: 'o1', MsgType: 'image', PicUrl: 'https://x/y.jpg', MediaId: 'm1' });
  const reply = logic.buildReply(msg, {});
  assert.match(reply, /图片已收到/);
  assert.match(reply, /订单号/);
});

test('进入会话事件只回欢迎语，不重复承诺', () => {
  const msg = logic.normalizePush({ FromUserName: 'o1', MsgType: 'event', Event: 'user_enter_tempsession' });
  const reply = logic.buildReply(msg, {});
  assert.match(reply, /欢迎咨询/);
  assert.doesNotMatch(reply, /24 小时内给出结果/);
});

test('任何回复都不超过长度上限，并带合规口径', () => {
  const longContent = '退款'.repeat(200);
  const msg = logic.normalizePush({ FromUserName: 'o1', MsgType: 'text', Content: longContent });
  const reply = logic.buildReply(msg, {});
  assert.ok(reply.length <= logic.MAX_REPLY_LEN, 'reply 超长: ' + reply.length);
  assert.match(reply, /退款请求已自动登记/);
  assert.match(reply, /AI 自动应答/);
  assert.doesNotMatch(reply, /客服由人工处理/);

  const general = logic.buildReply(logic.normalizePush({ FromUserName: 'o1', MsgType: 'text', Content: '在吗' }), {});
  assert.ok(general.length <= logic.MAX_REPLY_LEN);
  assert.match(general, /AI 自动应答/);
  assert.doesNotMatch(general, /客服由人工处理/);
});

test('落库记录字段齐全且以 msg_id 去重', () => {
  const msg = logic.normalizePush({
    FromUserName: 'o8IYYxiWJIJo6Lz5TuLUYlz1uFxw',
    ToUserName: 'gh_52e35279b132',
    MsgType: 'text',
    Content: 'VP20261112215711c7e626e9 到哪了',
    CreateTime: 1763000000,
    MsgId: '1234567890'
  });
  const rec = logic.buildMessageRecord(msg, { replied: true, replyContent: 'ok' });
  assert.equal(rec.msg_id, '1234567890');
  assert.equal(rec.openid, 'o8IYYxiWJIJo6Lz5TuLUYlz1uFxw');
  assert.equal(rec.order_no, 'VP20261112215711c7e626e9');
  assert.equal(rec.replied, true);
  assert.equal(rec.reply_content, 'ok');
  assert.ok(rec.received_at);
});

test('回退通道的请求地址与载荷符合微信接口要求', () => {
  const url = wxapi.buildTokenUrl('wx562bcb6057346fb2', 'abc123');
  assert.match(url, /grant_type=client_credential/);
  assert.match(url, /appid=wx562bcb6057346fb2/);
  assert.match(url, /secret=abc123/);

  const send = wxapi.buildSendPayload('o8IYYxiWJIJo6Lz5TuLUYlz1uFxw', '已收到');
  assert.deepEqual(send, { touser: 'o8IYYxiWJIJo6Lz5TuLUYlz1uFxw', msgtype: 'text', text: { content: '已收到' } });

  assert.match(wxapi.buildSendUrl('TOKEN'), /\/cgi-bin\/message\/custom\/send\?access_token=TOKEN/);
  assert.equal(wxapi.TOKEN_CACHE_COLLECTION, 'kf_token_cache');
});
