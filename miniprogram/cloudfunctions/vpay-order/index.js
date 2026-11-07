const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const https = require('https');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// ── 小程序虚拟支付（OfferID 1450712330）下单签名 ─────────────────────────
// 密钥一律从云函数环境变量读取，不写进代码、不进仓库：
//   WX_APP_SECRET         小程序 AppSecret（用于 code2Session 取 session_key）
//   VPAY_OFFER_ID         虚拟支付 OfferID，默认 1450712330
//   VPAY_ENV              0=现网环境，1=沙箱环境（默认 1，测试期用沙箱）
//   VPAY_APPKEY_SANDBOX   沙箱 AppKey（VPAY_ENV=1 时使用）
//   VPAY_APPKEY_LIVE      现网 AppKey（VPAY_ENV=0 时使用）
const APPID = process.env.WX_APPID || 'wx562bcb6057346fb2';
const APP_SECRET = process.env.WX_APP_SECRET || '';
const OFFER_ID = process.env.VPAY_OFFER_ID || '1450712330';
const ENV_FLAG = String(process.env.VPAY_ENV || '1') === '0' ? 0 : 1;
const APP_KEY = ENV_FLAG === 0
  ? (process.env.VPAY_APPKEY_LIVE || '')
  : (process.env.VPAY_APPKEY_SANDBOX || '');

// 道具 ID 必须与 MP 后台「虚拟支付 → 基本配置 → 道具配置」已发布的一致；
// 价格（分）必须与后台道具价格一致，前端传任何价格都不认。
const GOODS = {
  source_check: { legacy: 'source-check', title: '稿件源文核验', amount: 990 },
  delivery_check: { legacy: 'delivery-check', title: '交付质量校验', amount: 1990 },
  document_tidy: { legacy: 'document-tidy', title: '文档整理交付', amount: 1490 }
};

function pickGoods(id) {
  if (!id) return null;
  if (GOODS[id]) return Object.assign({ id: id }, GOODS[id]);
  const hit = Object.keys(GOODS).find(function (k) { return GOODS[k].legacy === id; });
  return hit ? Object.assign({ id: hit }, GOODS[hit]) : null;
}

function hmacHex(key, msg) {
  return crypto.createHmac('sha256', key).update(msg, 'utf8').digest('hex');
}

function makeOutTradeNo() {
  const d = new Date();
  const p = function (n) { return n < 10 ? '0' + n : '' + n; };
  const stamp = '' + d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()) +
    p(d.getHours()) + p(d.getMinutes()) + p(d.getSeconds());
  return ('VP' + stamp + crypto.randomBytes(4).toString('hex')).slice(0, 32);
}

function code2Session(code) {
  return new Promise(function (resolve, reject) {
    const path = '/sns/jscode2session?appid=' + encodeURIComponent(APPID) +
      '&secret=' + encodeURIComponent(APP_SECRET) +
      '&js_code=' + encodeURIComponent(code) +
      '&grant_type=authorization_code';
    const req = https.request({
      hostname: 'api.weixin.qq.com',
      path: path,
      method: 'GET',
      timeout: 8000
    }, function (res) {
      let raw = '';
      res.on('data', function (c) { raw += c; });
      res.on('end', function () {
        try { resolve(JSON.parse(raw)); } catch (e) { reject(new Error('code2Session 返回无法解析')); }
      });
    });
    req.on('timeout', function () { req.destroy(new Error('code2Session 超时')); });
    req.on('error', reject);
    req.end();
  });
}

exports.main = async function (event) {
  const ctx = cloud.getWXContext();
  const OPENID = ctx.OPENID;

  const goods = pickGoods(event && event.productId);
  if (!goods) return { ok: false, message: '服务不存在' };
  if (!APP_SECRET || !APP_KEY) {
    return { ok: false, message: '支付尚未配置完成（缺少虚拟支付密钥），请联系客服' };
  }

  const code = event && event.code;
  if (!code) return { ok: false, message: '登录态缺失，请退出小程序重进后再试' };

  let session = null;
  try {
    session = await code2Session(code);
  } catch (e) {
    console.error('code2Session error', e && e.message);
    return { ok: false, message: '登录校验失败，请重试' };
  }
  if (!session || !session.session_key || !session.openid) {
    console.error('code2Session bad', JSON.stringify(session));
    return { ok: false, message: '登录校验失败：' + ((session && session.errmsg) || '未返回 session_key') };
  }
  if (OPENID && session.openid !== OPENID) {
    return { ok: false, message: '用户身份不一致，请重进小程序' };
  }

  const outTradeNo = makeOutTradeNo();
  // signData 的键序在签名与前端透传时必须完全一致，因此只生成一次字符串
  const signData = JSON.stringify({
    offerId: OFFER_ID,
    buyQuantity: 1,
    env: ENV_FLAG,
    currencyType: 'CNY',
    productId: goods.id,
    goodsPrice: goods.amount,
    outTradeNo: outTradeNo,
    attach: goods.id
  });
  const paySig = hmacHex(APP_KEY, 'requestVirtualPayment&' + signData);
  const signature = hmacHex(session.session_key, signData);

  try {
    await db.collection('orders').add({
      data: {
        out_trade_no: outTradeNo,
        product_id: goods.id,
        title: goods.title,
        amount: goods.amount,
        status: 'pending',
        pay_channel: 'virtual',
        env: ENV_FLAG,
        openid: session.openid,
        created_at: new Date().toISOString(),
        paid_at: null,
        wx_order_id: null
      }
    });
  } catch (e) {
    console.error('order save failed', e && e.message);
    return { ok: false, message: '订单写入失败，请联系客服' };
  }

  return {
    ok: true,
    outTradeNo: outTradeNo,
    env: ENV_FLAG,
    payData: {
      signData: signData,
      paySig: paySig,
      signature: signature,
      mode: 'short_series_goods'
    }
  };
};
