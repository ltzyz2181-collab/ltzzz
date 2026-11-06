const cloud = require('wx-server-sdk');
const wxpay = require('./lib/wxpay');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async (event) => {
  const outTradeNo = event && event.outTradeNo;
  if (!outTradeNo) return { ok: false, paid: false, message: '缺少订单号' };
  if (!wxpay.isConfigured()) return { ok: false, paid: false, message: '支付尚未配置完成' };

  const path = '/v3/pay/transactions/out-trade-no/' + encodeURIComponent(outTradeNo) +
    '?mchid=' + wxpay.MCHID;

  const res = await wxpay.request('GET', path, null);
  if (res.statusCode !== 200) {
    console.error('order query failed', res.statusCode, JSON.stringify(res.body));
    return { ok: false, paid: false, message: '查询失败', code: res.statusCode };
  }

  const tradeState = res.body.trade_state || '';
  const paid = tradeState === 'SUCCESS';

  if (paid) {
    const found = await db.collection('orders').where({ out_trade_no: outTradeNo }).get();
    const order = (found.data || [])[0];
    if (order && order.status === 'pending') {
      await db.collection('orders').doc(order._id).update({
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
