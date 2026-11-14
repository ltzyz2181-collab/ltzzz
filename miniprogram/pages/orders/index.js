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

// 材料上传口径：单个文件 ≤10MB，每单最多 10 个，与 order-deliver 云函数的校验保持一致。
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const FILE_TOO_LARGE = '单个材料不能超过 10MB';

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = n => (n < 10 ? '0' + n : '' + n);
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate()) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
}

function intakeView(list) {
  const raw = Array.isArray(list) ? list : [];
  return raw.slice(-5).map(f => ({
    name: (f && f.name) || '材料',
    time: formatTime(f && f.uploaded_at)
  }));
}

Page({
  data: {
    orders: [],
    loading: true,
    empty: false,
    // 加载失败必须和「真的没有订单」区分开：早期版本失败时也渲染成空列表，
    // 真机上表现为「暂无订单记录」，把服务故障伪装成了正常状态。
    error: false,
    errorMessage: '',
    payEnabled: config.payEnabled,
    uploadingTradeNo: '',
    uploadingHint: ''
  },

  onShow() {
    this.loadOrders();
  },

  loadOrders() {
    if (!config.cloudEnv) {
      this.setData({ loading: false, empty: false, error: true, errorMessage: '未配置云开发环境，暂无法读取订单' });
      return;
    }
    this.setData({ loading: true, error: false, errorMessage: '' });
    wx.cloud.callFunction({ name: 'order-list' })
      .then(res => {
        const result = (res && res.result) || {};
        if (result.ok !== true) {
          this.setData({
            loading: false,
            orders: [],
            empty: false,
            error: true,
            errorMessage: result.message || '订单服务返回异常，请稍后重试'
          });
          return;
        }
        const raw = result.orders || [];
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
            status: o.status,
            title: PRODUCT_TITLE[o.product_id] || o.title,
            out_trade_no: o.out_trade_no,
            amountLabel: (total / 100).toFixed(2),
            statusLabel: STATUS_LABEL[o.status] || o.status,
            created_at_label: formatTime(o.created_at),
            delivered_at_label: formatTime(o.delivered_at),
            intakeFiles: intakeView(o.intake),
            canUpload: o.status === 'paid',
            isRefunded,
            // 部分退款要同时写清「退了多少、还剩多少」，避免客户以为全额已退。
            refundedLabel: isRefunded && refunded > 0 ? (refunded / 100).toFixed(2) : '',
            remainingLabel: isRefunded && refunded > 0 && total - refunded > 0 ? ((total - refunded) / 100).toFixed(2) : '',
            refundTimeLabel: formatTime(o.refunded_at),
            refundNote: REFUND_NOTE[o.status] || ''
          };
        });
        this.setData({ orders: list, loading: false, empty: list.length === 0, error: false, errorMessage: '' });
      })
      .catch(() => {
        // 这里不再把失败当成空列表：网络/云函数异常与「无订单」是两回事。
        this.setData({
          loading: false,
          orders: [],
          empty: false,
          error: true,
          errorMessage: '订单加载失败，请检查网络后重试'
        });
      });
  },

  retryLoad() {
    this.loadOrders();
  },

  // 材料入口：按订单号上传到云存储 intake/<订单号>/，再由 order-deliver 写入 orders.intake。
  // 不再依赖「联系客服提交材料」把文件发进客服聊天（那条通道无人值守、无推送）。
  chooseAndUpload(e) {
    const tradeNo = (e && e.currentTarget && e.currentTarget.dataset && e.currentTarget.dataset.trade) || '';
    if (!tradeNo) {
      wx.showToast({ title: '订单号缺失，请刷新后重试', icon: 'none' });
      return;
    }
    if (this.data.uploadingTradeNo) return;
    wx.chooseMessageFile({
      count: 1,
      type: 'all',
      success: res => {
        const file = (res && res.tempFiles && res.tempFiles[0]) || null;
        if (!file) return;
        if (typeof file.size === 'number' && file.size > MAX_FILE_BYTES) {
          wx.showToast({ title: FILE_TOO_LARGE, icon: 'none' });
          return;
        }
        this.uploadMaterial(file, tradeNo);
      },
      fail: () => {
        wx.showToast({ title: '已取消选择', icon: 'none' });
      }
    });
  },

  uploadMaterial(file, tradeNo) {
    const rawName = String(file.name || 'material');
    const safeName = rawName.replace(/[^\w.\-\u4e00-\u9fa5]/g, '_').slice(-80) || 'material';
    const cloudPath = 'intake/' + tradeNo + '/' + Date.now() + '-' + safeName;
    this.setData({ uploadingTradeNo: tradeNo, uploadingHint: '正在上传材料…' });

    wx.cloud.uploadFile({ cloudPath, filePath: file.path })
      .then(up => wx.cloud.callFunction({
        name: 'order-deliver',
        data: {
          action: 'intake',
          outTradeNo: tradeNo,
          fileID: up.fileID,
          fileName: rawName,
          size: file.size
        }
      }))
      .then(res => {
        const result = (res && res.result) || {};
        if (result.ok !== true) {
          this.setData({ uploadingTradeNo: '', uploadingHint: '' });
          wx.showToast({ title: result.message || '材料提交失败', icon: 'none' });
          return;
        }
        this.setData({ uploadingTradeNo: '', uploadingHint: '材料已提交，等待人工核对' });
        wx.showToast({ title: '材料已提交', icon: 'success' });
        this.loadOrders();
      })
      .catch(() => {
        this.setData({ uploadingTradeNo: '', uploadingHint: '' });
        wx.showToast({ title: '上传失败，请重试', icon: 'none' });
      });
  }
});
