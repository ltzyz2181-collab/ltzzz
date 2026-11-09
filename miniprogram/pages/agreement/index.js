const config = require('../../config/index');

Page({
  data: {
    merchantName: config.merchantName,
    serviceHours: config.serviceHours,
    deliveryDeadlineHours: config.deliveryDeadlineHours,
    payEnabled: config.payEnabled === true
  }
});
