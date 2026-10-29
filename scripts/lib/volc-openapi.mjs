// 火山引擎 OpenAPI 请求封装（vefaas）
// 签名算法精确复刻官方 @volcengine/vcloud-core Signer（crypto-js hmac/sha256 语义，
// 用 node:crypto 等价实现），零第三方依赖。凭据只从环境变量读取，永不回显明文。
import crypto from 'node:crypto';

const unsignableHeaders = ['authorization', 'content-type', 'content-length', 'user-agent', 'presigned-expires', 'expect'];

function hmacBytes(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}
function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}
function uriEscape(str) {
  return encodeURIComponent(String(str))
    .replace(/[^A-Za-z0-9_.~\-%]+/g, (ch) => `%${ch.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}
function queryParamsToString(params) {
  return Object.keys(params)
    .map((key) => {
      const val = params[key];
      if (typeof val === 'undefined' || val === null) return '';
      const escapedKey = uriEscape(key);
      if (Array.isArray(val)) return `${escapedKey}=${val.map(uriEscape).sort().join(`&${escapedKey}=`)}`;
      return `${escapedKey}=${uriEscape(val)}`;
    })
    .filter((v) => v)
    .join('&');
}
function canonicalHeaderValues(v) {
  return String(v).replace(/\s+/g, ' ').replace(/^\s+|\s+$/g, '');
}
function getSigningKey(secretKey, date, region, service) {
  const kDate = hmacBytes(Buffer.from(secretKey, 'utf8'), date);
  const kRegion = hmacBytes(kDate, region);
  const kService = hmacBytes(kRegion, service);
  return hmacBytes(kService, 'request');
}

export function signRequest({ accessKey, secretKey, service, region, method = 'POST', pathname = '/', params = {}, body = null, headers = {}, date = new Date() }) {
  const xDate = date.toISOString().replace(/[-:]|\.\d{3}/g, ''); // yyyyMMddTHHmmssZ
  const h = { ...headers };
  h['X-Date'] = xDate;
  let bodyStr = '';
  if (body) {
    if (typeof body !== 'string') bodyStr = JSON.stringify(body);
    else bodyStr = body;
    h['X-Content-Sha256'] = sha256Hex(bodyStr);
  }
  const sortedParams = Object.fromEntries(Object.keys(params).sort().map((k) => [k, params[k]]));
  const canonicalHeaders = Object.keys(h)
    .sort((a, b) => (a.toLowerCase() < b.toLowerCase() ? -1 : 1))
    .filter((k) => !unsignableHeaders.includes(k.toLowerCase()))
    .map((k) => `${k.toLowerCase()}:${canonicalHeaderValues(h[k])}`)
    .join('\n');
  const signedHeaders = Object.keys(h)
    .map((k) => k.toLowerCase())
    .filter((k) => !unsignableHeaders.includes(k))
    .sort()
    .join(';');
  const bodyHash = h['X-Content-Sha256'] || sha256Hex(body ? queryParamsToString(body) : '');
  const canonicalRequest = [method.toUpperCase(), pathname, queryParamsToString(sortedParams), `${canonicalHeaders}\n`, signedHeaders, bodyHash].join('\n');
  const credentialScope = [xDate.slice(0, 8), region, service, 'request'].join('/');
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const signingKey = getSigningKey(secretKey, xDate.slice(0, 8), region, service);
  const signature = hmacBytes(signingKey, stringToSign).toString('hex');
  const authorization = `HMAC-SHA256 Credential=${accessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { headers: { ...h, Authorization: authorization }, canonicalRequest, xDate, bodyHash, bodyStr };
}

export async function volcRequest({ action, version = '2024-06-06', body = null, region = 'cn-beijing', service = 'vefaas', host = 'open.volcengineapi.com', expectJson = true }) {
  const ak = process.env.VOLC_ACCESS_KEY;
  const sk = process.env.VOLC_SECRET_KEY;
  if (!ak || !sk) throw Error('VOLC_ACCESS_KEY/VOLC_SECRET_KEY required in env');
  const params = { Action: action, Version: version };
  const { headers: sigHeaders, bodyStr } = signRequest({ accessKey: ak, secretKey: sk, service, region, params, body, headers: { 'Content-Type': 'application/json' } });
  const canonicalQuery = Object.keys(params).sort().map((k) => `${uriEscape(k)}=${uriEscape(params[k])}`).join('&');
  const url = `https://${host}/?${canonicalQuery}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: sigHeaders,
    body: bodyStr || undefined,
  });
  const text = await res.text();
  if (!res.ok) {
    throw Error(`volc ${action} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!expectJson) return text;
  try { return JSON.parse(text); } catch { return text; }
}
