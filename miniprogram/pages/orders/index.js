const config = require('../../config/index');

const STATUS_LABEL = {
  pending: '待支付',
  paid: '已支付 · 待交付',
  delivered: '已交付',
  refunded: '已退款',
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
        const list = ((res && res.result && res.result.orders) || []).map(o => ({
          _id: o._id,
          title: o.title,
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
