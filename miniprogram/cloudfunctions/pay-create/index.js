const cloud = require('wx-server-sdk');
const crypto = require('crypto');
const wxpay = require('./lib/wxpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

// 价格只认这里，前端传什么都不能改价（单位：分）
const PRODUCTS = {
  'source-check': { title: '资料来源核对清单', amount: 990 },
  'delivery-check': { title: '交付验收核对', amount: 1990 },
  'document-tidy': { title: '资料整理与格式校对', amount: 1490 }
};

function makeOutTradeNo() {
  const t = new Date();
  const p = n => (n < 10 ? '0' + n : '' + n);
  const stamp = '' + t.getFullYear() + p(t.getMonth() + 1) + p(t.getDate()) +
    p(t.getHours()) + p(t.getMinutes()) + p(t.getSeconds());
  return ('SZ' + stamp + crypto.randomBytes(3).toString('hex').toUpperCase()).slice(0, 32);
}

exports.main = async (event) => {
  const { OPENID, APPID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, message: '未获取到用户身份，请重新进入小程序' };

  const productId = event && event.productId;
  const product = PRODUCTS[productId];
  if (!product) return { ok: false, message: '服务不存在' };
  if (!wxpay.isConfigured()) return { ok: false, message: '支付尚未配置完成，请联系客服' };

  const outTradeNo = makeOutTradeNo();
  const orderBody = {
    appid: APPID,
    mchid: wxpay.MCHID,
    description: product.title,
    out_trade_no: outTradeNo,
    amount: { total: product.amount, currency: 'CNY' },
    payer: { openid: OPENID }
  };

  const res = await wxpay.request('POST', '/v3/pay/transactions/jsapi', orderBody);
  if (res.statusCode !== 200 || !res.body.prepay_id) {
    console.error('jsapi order failed', res.statusCode, JSON.stringify(res.body));
    return { ok: false, message: '下单失败：' + ((res.body && res.body.message) || res.statusCode) };
  }

  const timeStamp = Math.floor(Date.now() / 1000).toString();
  const nonceStr = crypto.randomBytes(16).toString('hex');
  const pkg = 'prepay_id=' + res.body.prepay_id;
  const paySign = wxpay.paySign(APPID, timeStamp, nonceStr, pkg);

  await db.collection('orders').add({
    data: {
      out_trade_no: outTradeNo,
      product_id: productId,
      title: product.title,
      amount: product.amount,
      status: 'pending',
      openid: OPENID,
      prepay_id: res.body.prepay_id,
      created_at: new Date().toISOString(),
      paid_at: null
    }
  });

  return {
    ok: true,
    outTradeNo,
    payment: { timeStamp, nonceStr, package: pkg, signType: 'RSA', paySign }
  };
};
