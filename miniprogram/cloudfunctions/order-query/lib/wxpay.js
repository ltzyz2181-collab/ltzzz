const crypto = require('crypto');
const https = require('https');

const MCHID = (process.env.WXPAY_MCHID || '').trim();
const SERIAL_NO = (process.env.WXPAY_SERIAL_NO || '').trim();
const RAW_KEY = process.env.WXPAY_PRIVATE_KEY || '';
const PRIVATE_KEY = RAW_KEY.indexOf('\\n') >= 0 ? RAW_KEY.replace(/\\n/g, '\n') : RAW_KEY;
const API_HOST = 'api.mch.weixin.qq.com';

function isConfigured() {
  return Boolean(MCHID && SERIAL_NO && PRIVATE_KEY.indexOf('BEGIN PRIVATE KEY') >= 0);
}

function buildAuthorization(method, urlPath, bodyStr) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const message = method + '\n' + urlPath + '\n' + timestamp + '\n' + nonce + '\n' + bodyStr + '\n';
  const signature = crypto.createSign('RSA-SHA256').update(message, 'utf8').sign(PRIVATE_KEY, 'base64');
  return 'WECHATPAY2-SHA256-RSA2048 mchid="' + MCHID + '",nonce_str="' + nonce +
    '",signature="' + signature + '",timestamp="' + timestamp + '",serial_no="' + SERIAL_NO + '"';
}

function request(method, urlPath, payload) {
  return new Promise((resolve, reject) => {
    const bodyStr = payload ? JSON.stringify(payload) : '';
    const headers = {
      Authorization: buildAuthorization(method, urlPath, bodyStr),
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': 'shizhang-ai-miniprogram/1.0'
    };
    if (bodyStr) headers['Content-Length'] = Buffer.byteLength(bodyStr);

    const req = https.request({
      hostname: API_HOST,
      path: urlPath,
      method,
      headers,
      timeout: 15000
    }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let parsed = {};
        try { parsed = data ? JSON.parse(data) : {}; } catch (e) { parsed = { raw: data }; }
        resolve({ statusCode: res.statusCode, body: parsed });
      });
    });

    req.on('timeout', () => { req.destroy(new Error('微信支付接口请求超时')); });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

function paySign(appId, timeStamp, nonceStr, pkg) {
  const message = appId + '\n' + timeStamp + '\n' + nonceStr + '\n' + pkg + '\n';
  return crypto.createSign('RSA-SHA256').update(message, 'utf8').sign(PRIVATE_KEY, 'base64');
}

module.exports = { MCHID, SERIAL_NO, isConfigured, request, paySign, buildAuthorization };
