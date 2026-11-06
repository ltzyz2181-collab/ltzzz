// 部署配置（本文件只放非敏感配置；商户密钥一律放云函数环境变量，不要写在这里）
module.exports = {
  // 微信云开发环境 ID。2026-11-06 实测：个人版环境已与小程序
  // wx562bcb6057346fb2 完成「扫码授权认证」（授权成功 18:18:57），
  // 该环境含文档型数据库（orders 集合）与 order-list / order-query / pay-create 三个云函数。
  // 注意：环境到期 2026-12-06，续费后配置与数据保留。
  cloudEnv: 'shizhang-pay-d0g1n58020acf6b5b',

  // 在线支付入口开关。云函数部署 + 商户号关联完成后保持 true；
  // 若临时要下线支付，改为 false，购买按钮会提示「支付暂未开放」。
  payEnabled: true,

  // 展示在服务协议、订单页的主体与售后信息
  merchantName: '世章印章（广州）有限责任公司',
  serviceHours: '工作日 9:00-18:00',
  deliveryDeadlineHours: 24
};
