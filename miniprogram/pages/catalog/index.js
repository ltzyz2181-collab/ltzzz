const { products } = require('../../data/products');
Page({
  data: { products },
  openProduct(event) {
    const id = event.currentTarget.dataset.id;
    if (!products.some(product => product.id === id)) return;
    wx.navigateTo({ url: '/pages/product/index?id=' + encodeURIComponent(id) });
  }
});
