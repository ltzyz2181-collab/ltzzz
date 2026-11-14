'use strict';

// 客服消息发送通道：环境不支持云调用（cloud.openapi 报 invalid wx openapi access_token），
// 因此用 AppSecret 换 access_token，再调 cgi-bin/message/custom/send。
const https = require('https');

const TOKEN_CACHE_COLLECTION = 'kf_token_cache';
const TOKEN_DOC_ID = 'global';
const TOKEN_SAFE_MARGIN_MS = 5 * 60 * 1000;

function requestJson(method, url, payload) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const data = payload === undefined ? null : Buffer.from(JSON.stringify(payload));
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method,
        headers: data
          ? { 'Content-Type': 'application/json', 'Content-Length': data.length }
          : {}
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          let parsed;
          try {
            parsed = JSON.parse(body);
          } catch (err) {
            parsed = { raw: body };
          }
          resolve({ statusCode: res.statusCode, body: parsed });
        });
      }
    );
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function readCachedToken(db) {
  try {
    const res = await db.collection(TOKEN_CACHE_COLLECTION).doc(TOKEN_DOC_ID).get();
    const doc = (res.data || [])[0];
    if (!doc || !doc.access_token) return null;
    if (Number(doc.expire_at) - TOKEN_SAFE_MARGIN_MS <= Date.now()) return null;
    return doc.access_token;
  } catch (err) {
    return null;
  }
}

async function cacheToken(db, accessToken, expiresIn) {
  const expireAt = Date.now() + (Number(expiresIn) || 7200) * 1000;
  const data = { access_token: accessToken, expire_at: expireAt, updated_at: new Date().toISOString() };
  try {
    await db.collection(TOKEN_CACHE_COLLECTION).doc(TOKEN_DOC_ID).set({ data });
  } catch (err) {
    // 缓存写失败不影响本次发送
  }
}

function buildTokenUrl(appid, secret) {
  return 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=' +
    encodeURIComponent(appid) + '&secret=' + encodeURIComponent(secret);
}

function buildSendUrl(accessToken) {
  return 'https://api.weixin.qq.com/cgi-bin/message/custom/send?access_token=' + encodeURIComponent(accessToken);
}

function buildSendPayload(openid, content) {
  return { touser: openid, msgtype: 'text', text: { content } };
}

async function getAccessToken(db, appid, secret) {
  const cached = await readCachedToken(db);
  if (cached) return cached;
  const res = await requestJson('GET', buildTokenUrl(appid, secret));
  const token = res.body && res.body.access_token;
  if (!token) {
    throw new Error('get access_token failed: ' + JSON.stringify(res.body || {}).slice(0, 120));
  }
  await cacheToken(db, token, res.body.expires_in);
  return token;
}

async function sendText(db, appid, secret, openid, content) {
  const token = await getAccessToken(db, appid, secret);
  const res = await requestJson('POST', buildSendUrl(token), buildSendPayload(openid, content));
  const body = res.body || {};
  if (body.errcode !== 0) {
    throw new Error('custom/send failed: ' + JSON.stringify(body).slice(0, 160));
  }
  return body;
}

module.exports = {
  requestJson,
  getAccessToken,
  sendText,
  buildTokenUrl,
  buildSendUrl,
  buildSendPayload,
  TOKEN_CACHE_COLLECTION,
  TOKEN_DOC_ID
};
