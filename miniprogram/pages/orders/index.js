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
  partially_refunded: '部分退款 · 已暂停交付',
  refund_pending_verification: '退款核对中 · 已暂停交付',
  closed: '已关闭'
};

// 退款类订单必须让客户看懂三件事：实际退了多少、交付是否暂停、接下来怎么办。
// 只显示状态码（或只显示「部分退款」四个字）等于没有告知。
const REFUND_NOTE = {
  partially_refunded: '交付已暂停。剩余款项若继续退款，累计达到订单金额后会自动转为「已退款」；如需继续交付，请通过下方「联系客服」确认后重新下单，已退部分不重复收取。',
  refund_pending_verification: '交付已暂停，退款正在与支付渠道核对。核对完成后订单状态会自动更新，无需重复申请。',
  refunded: '退款已完成，交付不再进行。如金额或到账时间有疑问，请通过下方「联系客服」核对。'
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
        const list = visible.map(o => {
          const total = o.amount || 0;
          const refunded = Number.isFinite(o.refunded_total) ? o.refunded_total
            : (Number.isFinite(o.refund_amount) ? o.refund_amount : 0);
          const isRefunded = o.status === 'refunded' || o.status === 'partially_refunded' || o.status === 'refund_pending_verification';
          return {
            _id: o._id,
            title: PRODUCT_TITLE[o.product_id] || o.title,
            out_trade_no: o.out_trade_no,
            amountLabel: (total / 100).toFixed(2),
            statusLabel: STATUS_LABEL[o.status] || o.status,
            created_at_label: formatTime(o.created_at),
            isRefunded,
            // 部分退款要同时写清「退了多少、还剩多少」，避免客户以为全额已退。
            refundedLabel: isRefunded && refunded > 0 ? (refunded / 100).toFixed(2) : '',
            remainingLabel: isRefunded && refunded > 0 && total - refunded > 0 ? ((total - refunded) / 100).toFixed(2) : '',
            refundTimeLabel: formatTime(o.refunded_at),
            refundNote: REFUND_NOTE[o.status] || ''
          };
        });
        this.setData({ orders: list, loading: false, empty: list.length === 0 });
      })
      .catch(() => this.setData({ loading: false, empty: true }));
  }
});
