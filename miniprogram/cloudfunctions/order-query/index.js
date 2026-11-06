const cloud = require('wx-server-sdk');
const wxpay = require('./lib/wxpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const { OPENID, APPID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, paid: false, message: '请重新进入小程序' };
  const outTradeNo = event && event.outTradeNo;
  if (typeof outTradeNo !== 'string' || !outTradeNo.trim() || outTradeNo.length > 64) return { ok: false, paid: false, message: '缺少有效订单号' };
  const found = await db.collection('orders').where({ out_trade_no: outTradeNo, openid: OPENID }).get();
  const order = (found.data || [])[0];
  if (!order) return { ok: false, paid: false, message: '未找到可查询的订单' };
  if (!wxpay.isConfigured()) return { ok: false, paid: false, message: '支付尚未配置完成' };

  const path = '/v3/pay/transactions/out-trade-no/' + encodeURIComponent(outTradeNo) +
    '?mchid=' + wxpay.MCHID;

  const res = await wxpay.request('GET', path, null);
  if (res.statusCode !== 200) {
    console.error('order query failed', res.statusCode);
    return { ok: false, paid: false, message: '查询失败', code: res.statusCode };
  }

  const tradeState = res.body.trade_state || '';
  const paid = tradeState === 'SUCCESS';

  if (paid) {
    const proof = res.body;
    if (proof.out_trade_no !== order.out_trade_no || proof.appid !== APPID || proof.mchid !== wxpay.MCHID || proof.payer?.openid !== OPENID || !Number.isSafeInteger(proof.amount?.total) || proof.amount.total !== order.amount || proof.amount.currency !== 'CNY' || typeof proof.transaction_id !== 'string' || !proof.transaction_id) return { ok: false, paid: false, message: '订单结果待核对' };
    if (order.status === 'pending') {
      await db.collection('orders').where({ _id: order._id, openid: OPENID, status: 'pending' }).update({
        data: {
          status: 'paid',
          paid_at: new Date().toISOString(),
          transaction_id: res.body.transaction_id || ''
        }
      });
    }
  }

  return { ok: true, paid, tradeState };
};
