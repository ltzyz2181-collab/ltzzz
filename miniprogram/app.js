const config = require('./config/index');

App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('基础库版本过低，无法使用云能力');
      return;
    }
    if (config.cloudEnv) {
      wx.cloud.init({ env: config.cloudEnv, traceUser: true });
    } else {
      console.warn('未配置云开发环境 ID，支付相关功能不可用');
    }
  },
  globalData: { config }
});
