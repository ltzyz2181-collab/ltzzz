#!/usr/bin/env node
/**
 * 服务号 JS-SDK 签名服务（固定出口 IP 版）
 *
 * 为什么要单独放在这里：Cloudflare Workers 的出口 IP 每次请求都可能不同
 * （实测同一 worker 连续调用，微信 40164 报出的 IP 是 104.23.251.139 → 104.23.166.6），
 * 而微信 IP 白名单只收单个 IP、不收网段，所以 worker 侧签名永远打不通。
 * 本机（云主机）出口固定为 101.201.47.30，加入白名单一次即可长期生效。
 *
 * 启动方式（secret 不落仓库）：
 *   sudo install -m 600 -o root -g root /dev/null /etc/ltzzz-wechat-sign.env
 *   # 写入两行：WECHAT_APP_ID=...  WECHAT_APP_SECRET=...
 *   node --env-file-if-exists=/etc/ltzzz-wechat-sign.env \
 *        scripts/wechat-jsapi-sign-server.mjs
 *
 * 端点：
 *   GET /jsapi-sign?url=https%3A%2F%2Fltzzz.com%2Fopen%2F   → wx.config 所需签名
 *   GET /health                                              → 无敏感字段就绪状态
 */

import http from 'node:http';
import crypto from 'node:crypto';
import path from 'node:path';
import { execFile } from 'node:child_process';

const APP_ID = process.env.WECHAT_APP_ID || '';
const APP_SECRET = process.env.WECHAT_APP_SECRET || '';
const PORT = Number(process.env.PORT || 8788);
const HOST = process.env.HOST || '127.0.0.1';
const ALLOW_ORIGIN = process.env.ALLOW_ORIGIN || '*';

// 只有作为入口脚本运行时才要求密钥；被测试 import 时只导出纯函数
const IS_MAIN = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);

const cache = {
  token: { value: '', expiresAt: 0 },
  ticket: { value: '', expiresAt: 0 },
};

const TTL_MS = 7000 * 1000; // 微信 token/ticket 有效期 7200s，留 200s 余量

/**
 * 出网必须走平台代理（curl 默认读 https_proxy），原因见下：
 * 本机「直连」出口是轮换的（实测 115.190.116.128 / 180.184.87.220 / 101.126.81.70 /
 * 60.205.199.81 都出现过），微信 IP 白名单只收单 IP，直连永远 40164；
 * 而平台代理（vortex）出口固定为 101.201.47.30，三次请求三次一致。
 * 因此这里用 curl 而不是 node 的 fetch/https：node 的 fetch/https 在本机不读代理
 * 环境变量，会走直连轮换出口；curl 默认读 https_proxy，走的是固定代理出口。
 * 生产部署时务必保留 HTTPS_PROXY 环境变量，否则签名会因为出口漂移而 40164。
 */
function getJson(url) {
  return new Promise((resolve) => {
    execFile('curl', ['-sS', '-m', '15', url], { timeout: 20000, maxBuffer: 1024 * 1024 }, (err, stdout) => {
      if (err) {
        return resolve({ status: 0, body: { error: String(err.message || err).slice(0, 200) } });
      }
      try {
        resolve({ status: 200, body: JSON.parse(stdout) });
      } catch {
        resolve({ status: 200, body: { raw: String(stdout).slice(0, 200) } });
      }
    });
  });
}

async function getAccessToken() {
  const now = Date.now();
  if (cache.token.value && cache.token.expiresAt > now) return cache.token;

  const url = 'https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential'
    + `&appid=${encodeURIComponent(APP_ID)}&secret=${encodeURIComponent(APP_SECRET)}`;
  const { body } = await getJson(url);

  if (!body.access_token) {
    const err = new Error('获取 access_token 失败');
    err.detail = {
      endpoint: 'token',
      errcode: body.errcode,
      errmsg: body.errmsg,
      // 40164 时微信会带上它看到的来源 IP，这是判断白名单是否生效的唯一证据
      whitelist_ip: body.whitelist_ip,
      whitelist_ips: body.whitelist_ips,
    };
    throw err;
  }

  cache.token = { value: body.access_token, expiresAt: now + Math.min(TTL_MS, (body.expires_in || 7200) * 1000 - 200 * 1000) };
  return cache.token;
}

async function getJsapiTicket() {
  const now = Date.now();
  if (cache.ticket.value && cache.ticket.expiresAt > now) return cache.ticket;

  const token = await getAccessToken();
  const url = 'https://api.weixin.qq.com/cgi-bin/ticket/getticket'
    + `?access_token=${encodeURIComponent(token.value)}&type=jsapi`;
  const { body } = await getJson(url);

  if (body.errcode !== 0 || !body.ticket) {
    const err = new Error('获取 jsapi_ticket 失败');
    err.detail = { endpoint: 'ticket', errcode: body.errcode, errmsg: body.errmsg };
    throw err;
  }

  cache.ticket = { value: body.ticket, expiresAt: now + Math.min(TTL_MS, (body.expires_in || 7200) * 1000 - 200 * 1000) };
  return cache.ticket;
}

/** 微信 JS-SDK 签名：sha1(jsapi_ticket=..&noncestr=..&timestamp=..&url=..)，字段顺序固定 */
export function signJsapi({ ticket, noncestr, timestamp, url }) {
  const canonical = `jsapi_ticket=${ticket}&noncestr=${noncestr}&timestamp=${timestamp}&url=${url}`;
  return crypto.createHash('sha1').update(canonical, 'utf8').digest('hex');
}

export function normalizeUrl(raw) {
  if (!raw) throw new Error('缺少 url 参数');
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    throw new Error('url 不是合法绝对地址');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('url 必须是 http(s)');
  if (raw.includes('#')) throw new Error('url 不能带 # 片段（微信要求去掉 hash 部分）');
  return parsed.toString().replace(/\/$/, '') === parsed.origin + parsed.pathname.replace(/\/$/, '')
    ? parsed.origin + parsed.pathname
    : parsed.toString();
}

function send(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': ALLOW_ORIGIN,
    'cache-control': 'no-store',
  });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const appIdSuffix = APP_ID.slice(-6);

  if (u.pathname === '/health') {
    return send(res, 200, {
      ok: true,
      service: 'ltzzz-wechat-jsapi-sign',
      app_id_suffix: appIdSuffix,
      has_secret: Boolean(APP_SECRET),
      token_cached: Boolean(cache.token.value && cache.token.expiresAt > Date.now()),
      ticket_cached: Boolean(cache.ticket.value && cache.ticket.expiresAt > Date.now()),
    });
  }

  if (u.pathname !== '/jsapi-sign') {
    return send(res, 404, { ok: false, error: 'not_found' });
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204, { 'access-control-allow-origin': ALLOW_ORIGIN, 'access-control-allow-methods': 'GET,OPTIONS' });
    return res.end();
  }

  try {
    const targetUrl = normalizeUrl(u.searchParams.get('url'));
    const ticket = await getJsapiTicket();
    const timestamp = Math.floor(Date.now() / 1000);
    const noncestr = crypto.randomBytes(8).toString('hex');
    const signature = signJsapi({ ticket: ticket.value, noncestr, timestamp, url: targetUrl });

    return send(res, 200, {
      ok: true,
      app_id: APP_ID,
      app_id_suffix: appIdSuffix,
      timestamp,
      noncestr,
      signature,
      url: targetUrl,
    });
  } catch (err) {
    return send(res, 502, { ok: false, error: err.detail || { message: String(err.message || err) } });
  }
});

if (IS_MAIN) {
  if (!APP_ID || !APP_SECRET) {
    console.error('缺少 WECHAT_APP_ID / WECHAT_APP_SECRET，拒绝启动（不打印任何密钥内容）');
    process.exit(2);
  }
  server.listen(PORT, HOST, () => {
    console.log(`[jsapi-sign] listening on ${HOST}:${PORT} (app_id ...${APP_ID.slice(-6)})`);
  });
}

export { server };
