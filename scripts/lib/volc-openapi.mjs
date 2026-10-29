// 火山引擎 OpenAPI V4 签名 + 请求封装（vefaas）
// 凭据只从环境变量读取，永不回显明文。
// 签名实现与官方多语言示例一致：HMAC 链 key 用原始字节；headers 按字母序
// 签 content-type;host;x-content-sha256;x-date。
import crypto from 'node:crypto';

function hmacBytes(key, data) {
  return crypto.createHmac('sha256', key).update(data, 'utf8').digest();
}

function sha256Hex(data) {
  return crypto.createHash('sha256').update(data, 'utf8').digest('hex');
}

function enc(s) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export function volcSign({ ak, sk, method = 'POST', host = 'open.volcengineapi.com', path = '/', query = {}, body = null, region = 'cn-beijing', service = 'vefaas', date = new Date() }) {
  if (!ak || !sk) throw Error('VOLC_ACCESS_KEY/VOLC_SECRET_KEY required in env');
  const xDate = date.toISOString().replace(/[-:]|\.\d{3}/g, ''); // yyyyMMddTHHmmssZ (UTC)
  const shortDate = xDate.slice(0, 8);
  const contentType = 'application/json';
  const payload = body == null ? '' : (typeof body === 'string' ? body : JSON.stringify(body));
  const contentSha = sha256Hex(payload);
  const canonicalQuery = Object.keys(query).sort().map((k) => `${enc(k)}=${enc(String(query[k]))}`).join('&');
  const signedHeaderKeys = ['content-type', 'host', 'x-content-sha256', 'x-date'];
  const canonicalHeaders = signedHeaderKeys.map((k) => {
    const v = k === 'content-type' ? contentType : k === 'host' ? host : k === 'x-content-sha256' ? contentSha : xDate;
    return `${k}:${v}`;
  }).join('\n');
  const signedHeaders = signedHeaderKeys.join(';');
  const canonicalRequest = [method, path, canonicalQuery, `${canonicalHeaders}\n`, signedHeaders, contentSha].join('\n');
  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, sha256Hex(canonicalRequest)].join('\n');
  const kDate = hmacBytes(Buffer.from(sk, 'utf8'), shortDate);
  const kRegion = hmacBytes(kDate, region);
  const kService = hmacBytes(kRegion, service);
  const kSigning = hmacBytes(kService, 'request');
  const signature = hmacBytes(kSigning, stringToSign).toString('hex');
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
