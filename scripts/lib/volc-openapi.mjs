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

export function validateIamCredentials(env=process.env) {
  const ak=env.VOLC_ACCESS_KEY,sk=env.VOLC_SECRET_KEY;
  if(typeof ak!=='string'||!/^AKLT[a-zA-Z0-9_-]+$/.test(ak)||ak.length>=256)throw Error('iam_access_key_format_invalid');
  if(typeof sk!=='string'||!sk||sk.length>1024||/\s/.test(sk))throw Error('iam_secret_key_format_invalid');
  return {accessKey:ak,secretKey:sk};
}
export class VolcApiError extends Error {
  constructor({action,status,code,requestId}) {
    super('volc_api_failed:'+action+':'+status+':'+code);
    this.code=code;this.request_id=requestId;this.http_status=status;
  }
}
async function readBoundedJson(response) {
  const reader=response.body?.getReader();if(!reader)throw Error('volc_response_body_missing');
  const chunks=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;if(size>1000000)throw Error('volc_response_size_bound');chunks.push(value);}}
  catch(e){await reader.cancel().catch(()=>{});throw e;}
  finally{reader.releaseLock();}
  const bytes=Buffer.concat(chunks.map(x=>Buffer.from(x)));
  try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw Error('volc_response_invalid_json');}
}
export async function volcRequest({action,version='2024-06-06',body=null,region='cn-beijing',service='vefaas',host='open.volcengineapi.com',fetchImpl=fetch,env=process.env}={}) {
  const {accessKey,secretKey}=validateIamCredentials(env);
  if(service!=='vefaas'||host!=='open.volcengineapi.com'||region!=='cn-beijing'||version!=='2024-06-06'||!['ListFunctions','GetFunction','CreateFunction','UpdateFunction'].includes(action))throw Error('fixed_vefaas_request_required');
  const params={Action:action,Version:version};
  const {headers,bodyStr}=signRequest({accessKey,secretKey,service,region,params,body,headers:{Host:host,'Content-Type':'application/json'}});
  const query=Object.keys(params).sort().map(k=>uriEscape(k)+'='+uriEscape(params[k])).join('&');
  let response;
  try{response=await fetchImpl('https://'+host+'/?'+query,{method:'POST',headers,body:bodyStr||undefined,redirect:'error',signal:AbortSignal.timeout(15000)});}catch{throw Error('volc_transport_failed_no_retry');}
  const result=await readBoundedJson(response);
  const metadata=result?.ResponseMetadata;
  if(!response.ok||metadata?.Error){
    const safe=(v,pattern,fallback)=>typeof v==='string'&&pattern.test(v)&&!v.includes(accessKey)&&!v.includes(secretKey)?v:fallback;
    throw new VolcApiError({action,status:response.status,code:safe(metadata?.Error?.Code,/^[A-Za-z][A-Za-z0-9_.-]{0,79}$/,'provider_error'),requestId:safe(metadata?.RequestId,/^[a-zA-Z0-9_-]{1,120}$/,null)});
  }
  if(!result||typeof result!=='object'||Array.isArray(result)||!result.Result||typeof result.Result!=='object')throw Error('volc_response_result_missing');
  return result;
}
