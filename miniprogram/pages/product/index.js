const { products } = require('../../data/products');
Page({
  data: { product: null },
  onLoad(query) {
    const product = products.find(item => item.id === query.id);
    if (!product) {
      wx.showToast({ title: '未找到产品', icon: 'none' });
      return;
    }
    this.setData({ product });
    wx.setNavigationBarTitle({ title: product.title });
  }
});
