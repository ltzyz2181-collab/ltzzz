const { products } = require('../../data/products');
const config = require('../../config/index');
Page({
  // 列表页文案与详情页、订单页必须同口径，统一由 config.payEnabled 驱动
  data: { products, payEnabled: config.payEnabled === true },
  openProduct(event) {
    const id = event.currentTarget.dataset.id;
    if (!products.some(product => product.id === id)) return;
    wx.navigateTo({ url: '/pages/product/index?id=' + encodeURIComponent(id) });
  }
});
