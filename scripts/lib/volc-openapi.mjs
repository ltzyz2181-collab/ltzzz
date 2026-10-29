// 火山引擎 OpenAPI V4 签名 + 请求封装（vefaas）
// 凭据只从环境变量读取，永不回显明文。
import crypto from 'node:crypto';

function hmacHex(keyUtf8, data) {
  return crypto.createHmac('sha256', Buffer.from(keyUtf8, 'utf8')).update(data, 'utf8').digest('hex');
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function enc(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

// 严格按火山签名文档：HMAC 链的 key 为上一步的 hex 字符串（UTF-8 字节）
export function volcSign({ ak, sk, method = 'POST', host = 'open.volcengineapi.com', path = '/', query = {}, body = null, region = 'cn-beijing', service = 'vefaas', date = new Date() }) {
  if (!ak || !sk) throw Error('VOLC_ACCESS_KEY/VOLC_SECRET_KEY required in env');
  const xDate = date.toISOString().replace(/[-:]|\.\d{3}/g, '').replace('T', 'T').slice(0, 15) + 'Z'; // yyyyMMddTHHmmssZ
  const shortDate = xDate.slice(0, 8);
  const payload = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const contentSha = sha256Hex(payload);
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(String(query[k]))}`).join('&');
  const signedHeaders = 'host;x-date;x-content-sha256';
  const canonicalHeaders = `host:${host}\nx-date:${xDate}\nx-content-sha256:${contentSha}\n`;
  const canonicalRequest = [method, path, canonicalQuery, canonicalHeaders, signedHeaders, contentSha].join('\n');
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmacHex(sk, shortDate);
  const kRegion = hmacHex(kDate, region);
  const kService = hmacHex(kRegion, service);
  const kSigning = hmacHex(kService, 'request');
  const signature = hmacHex(kSigning, stringToSign);
  const authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;
  return { authorization, xDate, contentSha, canonicalRequest, stringToSign };
}

export async function volcRequest({ action, version = '2024-06-06', body = null, region = 'cn-beijing', service = 'vefaas', host = 'open.volcengineapi.com', expectJson = true }) {
  const ak = process.env.VOLC_ACCESS_KEY;
  const sk = process.env.VOLC_SECRET_KEY;
  if (!ak || !sk) throw Error('VOLC_ACCESS_KEY/VOLC_SECRET_KEY required in env');
  const query = { Action: action, Version: version };
  const sig = volcSign({ ak, sk, host, query, body, region, service });
  const url = `https://${host}/?` + Object.keys(query).map((k) => `${enc(k)}=${enc(String(query[k]))}`).join('&');
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Host': host,
      'X-Date': sig.xDate,
      'X-Content-Sha256': sig.contentSha,
      'Authorization': sig.authorization,
    },
    body: body == null ? undefined : (typeof body === 'string' ? body : JSON.stringify(body)),
  });
  const text = await res.text();
  if (!res.ok) {
    throw Error(`volc ${action} HTTP ${res.status}: ${text.slice(0, 500)}`);
  }
  if (!expectJson) return text;
  try { return JSON.parse(text); } catch { return text; }
}
