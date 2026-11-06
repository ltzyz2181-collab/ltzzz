const cloud = require('wx-server-sdk');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

exports.main = async () => {
  const { OPENID } = cloud.getWXContext();
  if (!OPENID) return { ok: false, orders: [] };

  const res = await db.collection('orders')
    .where({ openid: OPENID })
    .orderBy('created_at', 'desc')
    .limit(20)
    .get();

  return { ok: true, orders: res.data || [] };
};
