const { products } = require('../../data/products');
const config = require('../../config/index');

Page({
  data: {
    product: null,
    agreed: false,
    paying: false,
    payEnabled: config.payEnabled,
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
    if (!config.payEnabled) {
      wx.showToast({ title: '支付暂未开放', icon: 'none' });
      return;
    }
    if (!config.cloudEnv) {
      wx.showToast({ title: '支付环境未配置', icon: 'none' });
      return;
    }
    if (!this.data.agreed) {
      wx.showToast({ title: '请先阅读并同意服务协议', icon: 'none' });
      return;
    }

    this.setData({ paying: true });
    wx.showLoading({ title: '正在创建订单', mask: true });

    wx.cloud.callFunction({ name: 'pay-create', data: { productId: product.id } })
      .then(res => {
        const r = (res && res.result) || {};
        if (!r.ok) throw new Error(r.message || '下单失败');
        return this.requestPay(r.payment).then(() => r.outTradeNo);
      })
      .then(outTradeNo => wx.cloud.callFunction({ name: 'order-query', data: { outTradeNo } }))
      .then(res => {
        wx.hideLoading();
        const paid = !!(res && res.result && res.result.paid);
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

  requestPay(payment) {
    return new Promise((resolve, reject) => {
      wx.requestPayment({
        timeStamp: payment.timeStamp,
        nonceStr: payment.nonceStr,
        package: payment.package,
        signType: 'RSA',
        paySign: payment.paySign,
        success: resolve,
        fail: reject
      });
    });
  }
});
