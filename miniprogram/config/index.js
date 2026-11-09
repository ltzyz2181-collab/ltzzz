// 部署配置（本文件只放非敏感配置；商户密钥一律放云函数环境变量，不要写在这里）
module.exports = {
  // 微信云开发环境 ID。2026-11-06 实测：个人版环境已与小程序
  // wx562bcb6057346fb2 完成「扫码授权认证」（授权成功 18:18:57），
  // 该环境含文档型数据库（orders 集合）与 order-list / order-query / pay-create 三个云函数。
  // 注意：环境到期 2026-12-06，续费后配置与数据保留。
  cloudEnv: 'shizhang-pay-d0g1n58020acf6b5b',

  // 2026-11-09 打开：密钥、回调、道具三项已实测齐备，为跑通第一笔沙箱支付而开启。
  // 验收未通过（沙箱支付失败 / 回调未落 paid）就改回 false；改回后购买按钮提示「在线预约尚未开放」。
  payEnabled: true,

  // 展示在服务协议、订单页的主体与售后信息
  merchantName: '世章印章（广州）有限责任公司',
  serviceHours: '工作日 9:00-18:00',
  deliveryDeadlineHours: 24
};
