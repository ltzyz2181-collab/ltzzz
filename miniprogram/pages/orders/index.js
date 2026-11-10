const { products } = require('../../data/products');
const config = require('../../config/index');

// 历史订单里存的是下单当时的商品标题（旧名「稿件源文核验」等）；
// 展示层按 product_id 映射到 data/products.js 的当前名称，避免旧标题泄漏给用户。
const PRODUCT_TITLE = {};
products.forEach(p => {
  PRODUCT_TITLE[p.id] = p.title;
  PRODUCT_TITLE[p.id.replace(/-/g, '_')] = p.title; // source-check ↔ source_check
});

const STATUS_LABEL = {
  pending: '待支付',
  paid: '已支付 · 待交付',
  delivered: '已交付',
  refunded: '已退款',
  partially_refunded: '部分退款 · 暂停交付',
  refund_pending_verification: '退款核对中 · 暂停交付',
  closed: '已关闭'
};

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

Page({
  data: { orders: [], loading: true, empty: false, payEnabled: config.payEnabled },

  onShow() {
    this.loadOrders();
  },

  loadOrders() {
    if (!config.cloudEnv) {
      this.setData({ loading: false, empty: true });
      return;
    }
    this.setData({ loading: true });
    wx.cloud.callFunction({ name: 'order-list' })
      .then(res => {
        const raw = (res && res.result && res.result.orders) || [];
        // 支付未开放时不展示 pending（未付款）订单：体验环境里那些真实测试单
        // 只有下单人自己能处理，不该出现在任何体验者的订单列表里。
        const visible = config.payEnabled === true ? raw : raw.filter(o => o && o.status !== 'pending');
        const list = visible.map(o => ({
          _id: o._id,
          title: PRODUCT_TITLE[o.product_id] || o.title,
          out_trade_no: o.out_trade_no,
          amountLabel: ((o.amount || 0) / 100).toFixed(2),
          statusLabel: STATUS_LABEL[o.status] || o.status,
          created_at_label: formatTime(o.created_at)
        }));
        this.setData({ orders: list, loading: false, empty: list.length === 0 });
      })
      .catch(() => this.setData({ loading: false, empty: true }));
  }
});
