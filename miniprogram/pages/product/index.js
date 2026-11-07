const { products } = require('../../data/products');
const config = require('../../config/index');

Page({
  data: {
    product: null,
    agreed: false,
    paying: false,
    payEnabled: config.payEnabled === true && !!config.cloudEnv && !!wx.cloud?.callFunction,
    merchantName: config.merchantName
  },

  onLoad(query) {
    const product = products.find(item => item.id === query.id);
    if (!product) {
      wx.showToast({ title: '未找到产品', icon: 'none' });
      return;
    }
    this.setData({ product });
    wx.setNavigationBarTitle({ title: product.title });
  },

  toggleAgree() {
    this.setData({ agreed: !this.data.agreed });
  },

  openAgreement() {
    wx.navigateTo({ url: '/pages/agreement/index' });
  },

  openOrders() {
    wx.navigateTo({ url: '/pages/orders/index' });
  },

  onBuy() {
    const product = this.data.product;
    if (!product || this.data.paying) return;
    if (!this.data.payEnabled) {
      wx.showToast({ title: '在线预约暂未开放', icon: 'none' });
      return;
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意服务协议', icon: 'none' });
      return;
    }
    if (!this.checkWechatVersion()) return;

    this.setData({ paying: true });
    wx.showLoading({ title: '正在创建订单', mask: true });

    this.login()
      .then(code => wx.cloud.callFunction({ name: 'vpay-order', data: { productId: product.id, code } }))
      .then(res => {
        const r = (res && res.result) || {};
        if (!r.ok || !r.payData) throw new Error(r.message || '下单失败');
        wx.hideLoading();
        this._outTradeNo = r.outTradeNo;
        return this.requestVirtualPay(r.payData);
      })
      .then(() => this.confirmOrder())
      .then(paid => {
        wx.showToast({ title: paid ? '支付成功' : '支付结果确认中', icon: paid ? 'success' : 'none' });
        setTimeout(() => wx.navigateTo({ url: '/pages/orders/index' }), paid ? 900 : 1500);
      })
      .catch(err => {
        wx.hideLoading();
        const msg = (err && (err.errMsg || err.message)) || '支付未完成';
        if (msg.indexOf('cancel') >= 0) {
          wx.showToast({ title: '已取消支付', icon: 'none' });
        } else {
          wx.showModal({ title: '支付未完成', content: msg, showCancel: false });
        }
      })
      .then(() => this.setData({ paying: false }));
  },

  login() {
    return new Promise((resolve, reject) => {
      wx.login({
        success: res => (res && res.code ? resolve(res.code) : reject(new Error('微信登录失败，请重试'))),
        fail: reject
      });
    });
  },

  // iOS 端虚拟支付需微信客户端 ≥ 8.0.68
  checkWechatVersion() {
    let sys = {};
    try { sys = wx.getSystemInfoSync() || {}; } catch (e) { return true; }
    if (sys.platform !== 'ios') return true;
    const cur = String(sys.version || '0').split('.').map(Number);
    const base = [8, 0, 68];
    for (let i = 0; i < 3; i++) {
      const a = cur[i] || 0;
      if (a > base[i]) return true;
      if (a < base[i]) {
        wx.showModal({ title: '提示', content: '请将微信更新到最新版本后再支付', showCancel: false });
        return false;
      }
    }
    return true;
  },

  // 前端 success 回调不能作为发货依据，这里回查订单状态（发货以平台推送到 vpay-notify 为准）
  confirmOrder(attempt = 0) {
    const outTradeNo = this._outTradeNo;
    if (!outTradeNo) return Promise.resolve(false);
    return wx.cloud.callFunction({ name: 'order-list', data: {} })
      .then(res => {
        const list = (res && res.result && res.result.orders) || [];
        const mine = list.filter(o => o && o.out_trade_no === outTradeNo)[0];
        const paid = !!(mine && (mine.status === 'paid' || mine.status === 'delivered'));
        if (paid || attempt >= 3) return paid;
        return new Promise(r => setTimeout(r, 1200)).then(() => this.confirmOrder(attempt + 1));
      })
      .catch(() => false);
  },

  // 小程序虚拟支付：payData（signData / paySig / signature / mode）由云函数签名生成
  requestVirtualPay(payData) {
    return new Promise((resolve, reject) => {
      wx.requestVirtualPayment({
        signData: payData.signData,
        paySig: payData.paySig,
        signature: payData.signature,
        mode: payData.mode || 'short_series_goods',
        success: resolve,
        fail: reject
      });
    });
  }
});
