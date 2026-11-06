// 部署配置（本文件只放非敏感配置；商户密钥一律放云函数环境变量，不要写在这里）
module.exports = {
  // 微信云开发环境 ID，例如 'shizhang-ai-3gxxxxxx'。
  // 在微信开发者工具「云开发」面板复制环境 ID 后填到这里。
  cloudEnv: '',

  // 在线支付入口开关。云函数部署 + 商户号关联完成后保持 true；
  // 若临时要下线支付，改为 false，购买按钮会提示「支付暂未开放」。
  payEnabled: true,

  // 展示在服务协议、订单页的主体与售后信息
  merchantName: '世章印章（广州）有限责任公司',
  serviceHours: '工作日 9:00-18:00',
  deliveryDeadlineHours: 24
};
