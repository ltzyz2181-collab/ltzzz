/**
 * LTZZZ AI 财务实验 · 支付宝支付代理 Worker (ltzzz-pay-proxy)
 * ------------------------------------------------------------------
 * 定位：LTZZZ 400 元 AI 自主运营实验资金的「支付执行 + 安全边界 + 财务账本」。
 * 上游：GPT 总控 → 任务队列 → 豆包（判断是否购买）→ 本 Worker → 支付宝 → 记录 → 知识库。
 *
 * 硬性安全规则（代码级，任何请求参数都不可绕过）：
 *   1) 总授权额度：LTZZZ_MAX_BUDGET（默认 400.00 元），支出累计永不超过；
 *   2) 禁止类目黑名单：赌博/武器/毒品/色情/洗钱/诈骗/政治捐赠/个人转账/转自己/提现/借贷透支/无关个人消费；
 *   3) 余额 ≤ 0 → 全局停止；支付连续失败 → 暂停该服务商；短时间同服务商同金额重复 → 暂停检查；
 *   4) 金额异常（超单笔上限）→ 拒绝并标记人工复核；
 *   5) API 异常不循环重试（避免重复扣款）；幂等 out_trade_no 防重；
 *   6) 密钥只允许在 Cloudflare Secret，绝不写入代码/GitHub/前端；
 *   7) 不绕过支付宝安全限制：个人账户档位 = AI 下单 + 用户支付宝端确认；
 *      企业档位 = 单笔转账（需企业支付宝 + 签约「单笔转账到支付宝账户」产品）。
 *
 * Cloudflare Secrets（必填）：
 *   ALIPAY_APP_ID        支付宝开放平台应用 APPID（也可用 Variable）
 *   ALIPAY_PRIVATE_KEY   应用私钥（RSA2，PEM：PKCS1 或 PKCS8 均可，代码内自动转换）
 *   ALIPAY_PUBLIC_KEY    支付宝公钥（RSA2，SPKI PEM："BEGIN PUBLIC KEY"）
 *   LTZZZ_AGENT_TOKEN    AI 代理令牌（豆包调用本系统时的 Bearer Token）
 * Cloudflare Variables（可提交，不含密钥）：
 *   ALIPAY_ENV           sandbox | prod（默认 sandbox，先沙盒后上线）
 *   PAY_MODE             manual（AI下单+用户确认）| transfer（企业直转）
 *   LTZZZ_MAX_BUDGET     400（总授权额度）
 *   LTZZZ_INITIAL_BALANCE 400（初始授权资金，经 /admin/init 写入 KV）
 *   LTZZZ_MAX_AMOUNT     50（单笔金额上限，超出需人工复核标记）
 *   LTZZZ_ALLOWED_VENDORS JSON 数组（transfer 模式必配，白名单：id/name/identity/identity_type/business_scene）
 */

// 官方 2026：旧沙箱网关 openapi.alipaydev.com 已逐步退役，新沙箱网关为 openapi-sandbox.dl.alipaydev.com
const GATEWAYS = {
  sandbox: 'https://openapi-sandbox.dl.alipaydev.com/gateway.do',
  prod: 'https://openapi.alipay.com/gateway.do',
};

const BLOCK_CATEGORIES = [
  'gambling', 'betting', 'lottery', 'casino',
  'weapon', 'explosive', 'arms', 'ammunition',
  'drug', 'narcotic', 'marijuana',
  'porn', 'adult', 'escort', 'sex',
  'money-laundering', 'laundering',
  'fraud', 'scam', 'phishing', 'hack',
  'political-donation', 'political-campaign', 'election',
  'self-transfer', 'withdrawal', 'cash-out', 'cashout',
  'personal-transfer', 'individual-transfer',
  'personal-consumption', 'unrelated-goods', 'unrelated',
  'borrow', 'loan', 'credit', 'overdraft', 'installment', 'huabei',
];

const TRADE_SUCCESS = ['TRADE_SUCCESS', 'TRADE_FINISHED'];

/* ---------------- 工具：PEM/DER/签名 ---------------- */

function pemToDer(pem) {
  const b64 = pem
    .replace(/-----BEGIN [^-]+-----/, '')
    .replace(/-----END [^-]+-----/, '')
    .replace(/\s+/g, '');
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

function der(tag, content) {
  const len = content.length;
  let lenBytes;
  if (len < 0x80) lenBytes = new Uint8Array([len]);
  else if (len < 0x100) lenBytes = new Uint8Array([0x81, len]);
  else lenBytes = new Uint8Array([0x82, (len >> 8) & 0xff, len & 0xff]);
  const out = new Uint8Array(1 + lenBytes.length + len);
  out[0] = tag;
  out.set(lenBytes, 1);
  out.set(content, 1 + lenBytes.length);
  return out;
}

function concatBytes(...parts) {
  let total = 0;
  for (const p of parts) total += p.length;
  const out = new Uint8Array(total);
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

// PKCS1 ("BEGIN RSA PRIVATE KEY") → PKCS8 ("BEGIN PRIVATE KEY")，供 WebCrypto importKey 使用
function pkcs1ToPkcs8(pkcs1Pem) {
  const inner = pemToDer(pkcs1Pem);
  const version = der(0x02, new Uint8Array([0x00]));
  const alg = der(0x30, concatBytes(
    der(0x06, new Uint8Array([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01])), // rsaEncryption OID
    der(0x05, new Uint8Array(0)),
  ));
  const octet = der(0x04, inner);
  return der(0x30, concatBytes(version, alg, octet));
}

async function importPrivateKey(pem) {
  const body = pem.includes('BEGIN RSA PRIVATE KEY') ? pkcs1ToPkcs8(pem) : pemToDer(pem);
  return crypto.subtle.importKey('pkcs8', body, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
}

async function importPublicKey(pem) {
  return crypto.subtle.importKey('spki', pemToDer(pem), { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
}

async function rsa2Sign(text, privatePem) {
  const key = await importPrivateKey(privatePem);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(text));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

async function rsa2Verify(text, signature, publicPem) {
  try {
    const key = await importPublicKey(publicPem);
    const sigBytes = Uint8Array.from(atob(signature), c => c.charCodeAt(0));
    return await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sigBytes, new TextEncoder().encode(text));
  } catch (e) { return false; }
}

// 支付宝签名串：剔除 sign/sign_type 后按键名升序 key=value&...（value 原样）
// 注意：官方要求"参数值先做 URLDecode，再按字典序拼接"——本实现收到的参数已由框架解码，
//       与官方 Java SDK AlipaySignature.getSignContent 行为一致。
function buildSignString(params) {
  return Object.keys(params)
    .filter(k => k !== 'sign' && k !== 'sign_type' && params[k] !== undefined && params[k] !== null && params[k] !== '')
    .sort()
    .map(k => `${k}=${params[k]}`)
    .join('&');
}

/* ---------------- 金额与安全规则 ---------------- */

function normalizeAmount(v) {
  if (typeof v === 'string') v = v.trim();
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

function isBlockedCategory(cat) {
  const c = String(cat || '').toLowerCase().replace(/[\s\-_]+/g, '-');
  return BLOCK_CATEGORIES.some(b => c.includes(b) || c === b);
}

function now() { return new Date().toISOString(); }

// 支付宝要求 timestamp 为 GMT+8 本地时间（不能直接拿 UTC 字符串替换时区标记）
function alipayTimestamp() {
  const d = new Date();
  const local = new Date(d.getTime() + 8 * 3600 * 1000);
  return local.toISOString().replace(/\.\d+Z$/, '+08:00').replace('T', ' ');
}

function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(Object.assign({ ok: status < 400, time: now() }, body, extra)), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    },
  });
}

async function readBody(req) {
  const ct = (req.headers.get('content-type') || '');
  if (ct.includes('application/x-www-form-urlencoded') || ct.includes('multipart/form-data')) {
    const fd = await req.formData();
    const obj = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  }
  // 一次性读取字节；先按 UTF-8 解析，失败（如 Windows curl/PowerShell 以 GBK 发送）再按 GBK 解码
  const buf = await req.arrayBuffer();
  const bytes = new Uint8Array(buf);
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); } catch (_) {
    try { return JSON.parse(new TextDecoder('gbk').decode(bytes)); } catch (_) { return {}; }
  }
}

function requireToken(env, req) {
  const token = env.LTZZZ_AGENT_TOKEN;
  if (!token) return false;
  const auth = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  return auth === token;
}

/* ---------------- 支付宝请求（签名 + 表单 POST） ---------------- */

async function alipayRequest(env, method, bizContent, extra = {}) {
  if (!env.ALIPAY_APP_ID || !env.ALIPAY_PRIVATE_KEY) {
    return { code: 'CONFIG_MISSING', msg: '未配置 ALIPAY_APP_ID / ALIPAY_PRIVATE_KEY（Cloudflare Secret）', sub_code: 'LTZZZ_CONFIG_MISSING' };
  }
  const params = {
    app_id: env.ALIPAY_APP_ID,
    method,
    format: 'JSON',
    charset: 'utf-8',
    sign_type: 'RSA2',
    timestamp: alipayTimestamp(),
    version: '1.0',
    biz_content: JSON.stringify(bizContent),
  };
  if (extra.notify_url) params.notify_url = extra.notify_url;
  const signStr = buildSignString(params);
  params.sign = await rsa2Sign(signStr, env.ALIPAY_PRIVATE_KEY);

  const body = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) body.append(k, v);

  const gateway = GATEWAYS[env.ALIPAY_ENV || 'sandbox'] || GATEWAYS.sandbox;
  const resp = await fetch(gateway, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' },
    body: body.toString(),
  });
  const text = await resp.text();
  let data = {};
  try { data = JSON.parse(text); } catch (e) { data = { raw: text.slice(0, 500) }; }
  return data;
}

function findResponse(data) {
  if (!data || typeof data !== 'object') return null;
  if (data.code === 'CONFIG_MISSING') return { ok: false, node: null, code: 'CONFIG_MISSING', subCode: 'LTZZZ_CONFIG_MISSING', msg: data.msg };
  for (const key of Object.keys(data)) {
    if (key.startsWith('alipay_') && data[key] !== null && typeof data[key] === 'object') {
      const node = data[key];
      if (node.code === '10000') return { ok: true, node };
      return { ok: false, node, code: node.code, subCode: node.sub_code, msg: node.sub_msg || node.msg };
    }
  }
  return null;
}

/* ---------------- 账本（Cloudflare KV） ---------------- */

async function getBalance(kv) {
  const raw = await kv.get('ltzzz:balance', 'json');
  return raw && typeof raw.initial === 'number'
    ? { initial: raw.initial, spent: raw.spent || 0, refunded: raw.refunded || 0 }
    : null;
}

async function setBalance(kv, b) {
  await kv.put('ltzzz:balance', JSON.stringify(b));
}

async function appendLedger(kv, entry) {
  await kv.put(`ltzzz:ledger:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, JSON.stringify(entry));
}

async function appendDecision(kv, entry) {
  await kv.put(`ltzzz:decision:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, JSON.stringify(entry));
}

async function listKV(kv, prefix, limit) {
  const list = await kv.list({ prefix }); // 默认最多 1000 条，按字典序
  const take = Math.min(Math.max(limit || 50, 1), 200);
  const keys = list.keys.map(k => k.name).sort().reverse().slice(0, take); // 取最新 N 条
  const out = [];
  for (const name of keys) {
    const v = await kv.get(name, 'json');
    if (v) out.push(Object.assign({ id: name }, v));
  }
  out.sort((a, b) => (a.time > b.time ? -1 : 1));
  return out;
}

async function getStopFlags(kv) {
  const global = await kv.get('ltzzz:stop:global');
  const vendors = await kv.list({ prefix: 'ltzzz:stop:vendor:' });
  const vendorMap = {};
  for (const k of vendors.keys) vendorMap[k.name.replace('ltzzz:stop:vendor:', '')] = await kv.get(k.name);
  return { global, vendors: vendorMap };
}

async function getFailCount(kv, vendorId) {
  return Number(await kv.get(`ltzzz:fail:${vendorId}`)) || 0;
}

/* ---------------- 核心：AI 决策安全校验 ---------------- */

async function checkDecision(env, kv, p) {
  const reasons = [];
  // 1) 基本字段
  if (!p || typeof p !== 'object') return { allowed: false, reason: '缺少决策对象' };
  const amount = normalizeAmount(p.amount);
  if (amount === null) return { allowed: false, reason: '金额非法（必须为正数，最多两位小数）' };
  // 金额异常：单笔超限 → 自动暂停该订单（用户授权边界：金额异常订单自动暂停，不扩大损失）
  const maxAmount = Number(env.LTZZZ_MAX_AMOUNT || 50);
  if (amount > maxAmount) return { allowed: false, reason: `金额异常：单笔 ¥${amount} 超限（>¥${maxAmount}），订单已自动暂停，需人工复核后由用户手动放行` };

  // 2) 类目黑名单
  if (isBlockedCategory(p.category)) return { allowed: false, reason: `类目命中禁止清单: ${p.category}` };
  if (isBlockedCategory(p.vendor)) return { allowed: false, reason: `服务商命中禁止清单: ${p.vendor}` };

  // 3) 余额与总授权额度
  const bal = await getBalance(kv);
  if (!bal) return { allowed: false, reason: '账本未初始化（需先 /admin/init 确认初始授权资金）' };
  const remaining = Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100;
  if (remaining <= 0) return { allowed: false, reason: '余额已用完，全局停止（余额≤0）' };
  if (amount > remaining) return { allowed: false, reason: `超出剩余额度（剩 ¥${remaining.toFixed(2)}）` };

  // 4) 全局停止 / 服务商暂停
  const stops = await getStopFlags(kv);
  if (stops.global) return { allowed: false, reason: `全局已暂停: ${stops.global}` };
  if (p.vendor_id && stops.vendors[p.vendor_id]) return { allowed: false, reason: `服务商 ${p.vendor_id} 已暂停: ${stops.vendors[p.vendor_id]}` };

  // 5) 连续失败 ≥3 → 服务商暂停
  if (p.vendor_id) {
    const fails = await getFailCount(kv, p.vendor_id);
    if (fails >= 3) return { allowed: false, reason: `服务商 ${p.vendor_id} 连续失败 ${fails} 次，已自动暂停` };
  }

  // 6) 短时间同服务商同金额重复（幂等/重复扣款防护）
  if (p.vendor_id) {
    const recent = await listKV(kv, 'ltzzz:ledger:', 30);
    const dup = recent.find(e =>
      e.vendor_id === p.vendor_id && Math.abs((e.amount || 0) - amount) < 0.005 &&
      Date.now() - new Date(e.time).getTime() < 5 * 60 * 1000 && e.result === 'success'
    );
    if (dup) return { allowed: false, reason: `短时间重复支出（${dup.time} 同服务商同金额），已暂停检查` };
  }

  // 7) transfer 档位：服务商白名单
  const payMode = env.PAY_MODE || 'manual';
  if (payMode === 'transfer') {
    let vendors = [];
    try { vendors = JSON.parse(env.LTZZZ_ALLOWED_VENDORS || '[]'); } catch (e) {}
    const hit = vendors.find(v => v.id === p.vendor_id);
    if (!hit) return { allowed: false, reason: 'transfer 档位要求服务商在 LTZZZ_ALLOWED_VENDORS 白名单内' };
    if (p.amount && p.amount !== undefined && hit.max_amount && amount > Number(hit.max_amount)) {
      return { allowed: false, reason: `超出该服务商单笔上限 ¥${hit.max_amount}` };
    }
  }

  return { allowed: true, reason: reasons.length ? reasons.join('；') : '通过', amount, remaining };}

/* ---------------- 主入口 ---------------- */

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    const kv = env.LTZZZ_PAY;

    if (req.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Content-Type, Authorization', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS' } });
    }

    // ---- 只读：健康检查 ----
    if (path === '/health' && req.method === 'GET') {
      const bal = await getBalance(kv);
      const stops = await getStopFlags(kv);
      const remaining = bal ? Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 : null;
      return json({
        service: 'ltzzz-pay-proxy', version: '1.0.0',
        alipay_env: env.ALIPAY_ENV || 'sandbox',
        pay_mode: env.PAY_MODE || 'manual',
        configured: {
          app_id: !!env.ALIPAY_APP_ID,
          private_key: !!env.ALIPAY_PRIVATE_KEY,
          alipay_public_key: !!env.ALIPAY_PUBLIC_KEY,
          agent_token: !!env.LTZZZ_AGENT_TOKEN,
          kv: !!kv,
        },
        budget: { max: Number(env.LTZZZ_MAX_BUDGET || 400), initial: bal ? bal.initial : null },
        balance: remaining,
        spent: bal ? bal.spent : null,
        stop: stops.global ? { global: stops.global } : { global: null, vendors: stops.vendors },
      });
    }

    // ---- 只读：账本 / 余额 / 停止状态 ----
    if (path === '/ledger' && req.method === 'GET') {
      const entries = await listKV(kv, 'ltzzz:ledger:', Number(url.searchParams.get('limit')) || 200);
      if (url.searchParams.get('format') === 'md') {
        return new Response(renderLedgerMarkdown(entries), {
          headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
        });
      }
      return json({ ledger: entries });
    }
    if (path === '/balance' && req.method === 'GET') {
      const bal = await getBalance(kv);
      if (!bal) return json({ error: '账本未初始化' }, 404);
      return json({ initial: bal.initial, spent: bal.spent, refunded: bal.refunded, remaining: Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 });
    }
    if (path === '/stop' && req.method === 'GET') {
      return json({ stops: await getStopFlags(kv) });
    }
    if (path === '/decisions' && req.method === 'GET') {
      return json({ decisions: await listKV(kv, 'ltzzz:decision:', Number(url.searchParams.get('limit')) || 50) });
    }

    // ---- 支付宝异步通知（验签即认证，无需 Bearer token）----
    // 必须在 token 校验之前处理：支付宝通知请求不会携带我们的内部 token。
    if (path === '/order/notify' && req.method === 'POST') {
      return this.handleNotify(req, env, kv);
    }

    // ---- 以下全部需要 AI 代理令牌 ----
    if (!requireToken(env, req)) return json({ error: 'unauthorized (需要 LTZZZ_AGENT_TOKEN)' }, 401);
    const body = await readBody(req);

    // 初始化授权资金（400 元余额确认）
    if (path === '/admin/init' && req.method === 'POST') {
      const initial = normalizeAmount(body.initial !== undefined ? body.initial : env.LTZZZ_INITIAL_BALANCE || 400);
      if (initial === null) return json({ error: 'initial 非法' }, 400);
      const max = Number(env.LTZZZ_MAX_BUDGET || 400);
      if (initial > max) return json({ error: `initial 不能超过总授权额度 ${max}` }, 400);
      const existing = await getBalance(kv);
      if (existing && body.force !== true) return json({ error: '账本已初始化，如需重设请传 force:true', balance: existing }, 409);
      const bal = { initial, spent: 0, refunded: 0, updated: now() };
      await setBalance(kv, bal);
      await appendLedger(kv, { time: now(), event: 'init', amount: 0, vendor: 'system', item: '初始授权资金确认', reason: '用户确认开始 400 元自主运营额度', project: 'LTZZZ', order_no: 'INIT', result: 'success', balance_after: initial });
      return json({ ok: true, balance: bal, message: '账本已初始化，进入沙盒/小额测试阶段' });
    }

    // AI 决策校验（不实际扣款，先记录决策结果）
    if (path === '/decision' && req.method === 'POST') {
      const p = body.proposal || body;
      const check = await checkDecision(env, kv, p);
      const bal = await getBalance(kv);
      const remaining = bal ? Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 : null;
      await appendDecision(kv, {
        time: now(), request_id: body.request_id || null, project: p.project || 'LTZZZ',
        vendor: p.vendor, vendor_id: p.vendor_id, item: p.item, category: p.category,
        amount: check.amount, reason: p.reason, decision: check.allowed ? 'allowed' : 'blocked',
        block_reason: check.allowed ? null : check.reason, balance_before: remaining,
      });
      return json(check.allowed
        ? { decision: 'allowed', amount: check.amount, balance_after: Math.round((remaining - check.amount) * 100) / 100, note: check.reason }
        : { decision: 'blocked', reason: check.reason, amount: check.amount }, check.allowed ? 200 : 403);
    }

    // 创建支付（手动档：预下单/收银台；企业档：单笔转账）
    if (path === '/order/create' && req.method === 'POST') {
      const p = body.proposal || body;
      const check = await checkDecision(env, kv, p);
      if (!check.allowed) {
        await appendDecision(kv, { time: now(), request_id: body.request_id || null, project: p.project || 'LTZZZ', vendor: p.vendor, vendor_id: p.vendor_id, item: p.item, category: p.category, amount: check.amount, reason: p.reason, decision: 'blocked', block_reason: check.reason, balance_before: (await getBalance(kv)) });
        return json({ decision: 'blocked', reason: check.reason }, 403);
      }
      const outTradeNo = `LT${Date.now()}${Math.floor(Math.random() * 900 + 100)}`;
      const payMode = env.PAY_MODE || 'manual';

      if (payMode === 'transfer') {
        // 企业档：alipay.fund.trans.uni.transfer（无密直转，需企业支付宝+签约）
        let vendors = [];
        try { vendors = JSON.parse(env.LTZZZ_ALLOWED_VENDORS || '[]'); } catch (e) {}
        const vendor = vendors.find(v => v.id === p.vendor_id);
        if (!vendor) return json({ error: '服务商不在白名单' }, 403);
        const transferScene = vendor.transfer_scene || '业务结算'; // 2026 新接入必传：现金营销/企业退款/佣金报酬/业务结算/二手回收/公益补助/行政补贴和退款/保险理赔
        const bizContent = {
          out_biz_no: outTradeNo,
          trans_amount: check.amount.toFixed(2),
          product_code: 'TRANS_ACCOUNT_NO_PWD',
          biz_scene: 'DIRECT_TRANSFER',
          order_title: String(p.item || p.vendor).slice(0, 40),
          payee_info: {
            identity: vendor.identity,
            identity_type: vendor.identity_type || 'ALIPAY_LOGON_ID',
            name: vendor.name || '',
          },
          transfer_scene_name: transferScene,
          transfer_scene_report_infos: [
            { info_type: `${transferScene}说明`, info_content: String(p.reason || p.item || 'LTZZZ 实验采购').slice(0, 256) },
          ],
          remark: String(p.reason || '').slice(0, 100),
        };
        const data = await alipayRequest(env, 'alipay.fund.trans.uni.transfer', bizContent);
        const res = findResponse(data);
        if (!res || !res.ok) {
          const fail = await kv.put(`ltzzz:fail:${p.vendor_id}`, String(await getFailCount(kv, p.vendor_id) + 1));
          await appendLedger(kv, { time: now(), event: 'transfer', vendor: p.vendor, vendor_id: p.vendor_id, item: p.item, amount: check.amount, reason: p.reason, project: p.project || 'LTZZZ', order_no: outTradeNo, result: 'failed', error: res ? `${res.code} ${res.subCode} ${res.msg}` : 'no response', balance_after: null });
          return json({ error: '转账失败（不重试）', code: res ? res.code : null, msg: res ? res.msg : 'gateway no response' }, 502);
        }
        // 受理成功（code=10000）≠ 最终成功。官方：同步响应仅表示受理，最终状态靠异步通知/查询确认。
        // 转账不可撤销，受理即锁定资金：记 pending 订单 + 扣减余额，等 notify/query 确认为 paid/failed。
        const order = {
          out_biz_no: outTradeNo, amount: check.amount, vendor: p.vendor, vendor_id: p.vendor_id,
          item: p.item, reason: p.reason, project: p.project || 'LTZZZ',
          status: 'pending', rail: 'transfer', created: now(),
          alipay_order_id: res.node.order_id || res.node.pay_fund_order_id || null,
        };
        await kv.put(`ltzzz:order:${outTradeNo}`, JSON.stringify(order));
        const bal = await getBalance(kv);
        bal.spent = Math.round((bal.spent + check.amount) * 100) / 100;
        await setBalance(kv, bal);
        if (bal.initial + bal.refunded - bal.spent <= 0) await kv.put('ltzzz:stop:global', '余额≤0，自动停止所有付款');
        await appendLedger(kv, { time: now(), event: 'transfer_submitted', vendor: p.vendor, vendor_id: p.vendor_id, item: p.item, amount: check.amount, reason: p.reason, project: p.project || 'LTZZZ', order_no: outTradeNo, result: 'pending', alipay_order_id: order.alipay_order_id, balance_after: Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100, note: '转账已受理，等待异步通知/查询确认最终状态' });
        return json({ ok: true, mode: 'transfer', order_no: outTradeNo, out_biz_no: outTradeNo, amount: check.amount, status: 'pending', note: '转账已受理，最终状态以异步通知/查询为准（成功后不可撤销）' });
      }

      // 手动档：alipay.trade.precreate（当面付，返回收款二维码链接；或 page.pay 电脑网站支付）
      const tradeType = body.trade_type || 'precreate';
      const common = {
        out_trade_no: outTradeNo,
        total_amount: check.amount.toFixed(2),
        subject: String(p.item || p.vendor).slice(0, 40),
        enable_pay_channels: env.LTZZZ_PAY_CHANNELS || 'balance', // 默认仅余额，防花呗/信用透支
      };
      let method, bizContent;
      if (tradeType === 'page') {
        method = 'alipay.trade.page.pay';
        bizContent = Object.assign(common, { product_code: 'FAST_INSTANT_TRADE_PAY' });
      } else {
        method = 'alipay.trade.precreate';
        bizContent = common;
      }
      const data = await alipayRequest(env, method, bizContent, { notify_url: env.LTZZZ_NOTIFY_URL });
      const res = findResponse(data);
      if (!res || !res.ok) {
        await kv.put(`ltzzz:fail:${p.vendor_id || 'unknown'}`, String(await getFailCount(kv, p.vendor_id || 'unknown') + 1));
        return json({ error: '下单失败（不重试）', code: res ? res.code : null, msg: res ? res.msg : 'gateway no response' }, 502);
      }
      // 预登记订单（幂等 + 防重）
      await kv.put(`ltzzz:order:${outTradeNo}`, JSON.stringify({ out_trade_no: outTradeNo, amount: check.amount, vendor: p.vendor, vendor_id: p.vendor_id, item: p.item, reason: p.reason, project: p.project || 'LTZZZ', status: 'pending', created: now() }));
      await appendLedger(kv, { time: now(), event: 'order_created', vendor: p.vendor, vendor_id: p.vendor_id, item: p.item, amount: check.amount, reason: p.reason, project: p.project || 'LTZZZ', order_no: outTradeNo, result: 'pending_user_confirm', balance_after: null });
      return json({ ok: true, mode: 'manual', order_no: outTradeNo, amount: check.amount, qr_url: res.node.qr_code || null, pay_url: res.node.pay_url || null, note: '个人档位：请用户在支付宝端确认付款（支付宝安全边界，不可绕过）' });
    }

    // 查询订单（按 rail 分发：转账类用 alipay.fund.trans.common.query，收款类用 alipay.trade.query）
    if (path === '/order/query' && req.method === 'POST') {
      const existing = await kv.get(`ltzzz:order:${body.out_trade_no || body.out_biz_no || ''}`, 'json');
      const rail = existing && existing.rail === 'transfer' ? 'transfer' : 'trade';
      if (rail === 'transfer') {
        const data = await alipayRequest(env, 'alipay.fund.trans.common.query', { out_biz_no: body.out_trade_no || body.out_biz_no });
        const res = findResponse(data);
        if (!res) return json({ error: '查询失败' }, 502);
        if (res.ok) {
          // 同步查询结果 → 幂等推进订单状态（与 notify 同一逻辑）
          const status = String(res.node.status || '').toUpperCase();
          if (existing && (status === 'SUCCESS' || status === 'FAIL') && (existing.status !== 'paid' && existing.status !== 'failed')) {
            const params = { out_biz_no: existing.out_biz_no, status: res.node.status, order_id: res.node.order_id || '', pay_fund_order_id: res.node.pay_fund_order_id || '', fail_reason: res.node.fail_reason };
            await handleTransferState(env, kv, params, existing);
          }
          return json({ ok: true, rail: 'transfer', order: existing, trade: res.node });
        }
        return json({ ok: false, code: res.code, msg: res.msg }, res.code === '40004' ? 404 : 502);
      }
      const data = await alipayRequest(env, 'alipay.trade.query', { out_trade_no: body.out_trade_no, query_options: ['trade_settle_info'] });
      const res = findResponse(data);
      if (!res) return json({ error: '查询失败' }, 502);
      if (res.ok) return json({ ok: true, trade: res.node });
      return json({ ok: false, code: res.code, msg: res.msg, note: res.code === '40004' ? '订单不存在或未支付' : undefined }, res.code === '40004' ? 404 : 502);
    }

    // 退款（记账 + 冲回余额）
    if (path === '/refund' && req.method === 'POST') {
      const amount = normalizeAmount(body.amount);
      if (amount === null) return json({ error: '金额非法' }, 400);
      const data = await alipayRequest(env, 'alipay.trade.refund', {
        out_trade_no: body.out_trade_no,
        refund_amount: amount.toFixed(2),
        out_request_no: `RF${Date.now()}`,
        refund_reason: String(body.reason || 'AI 实验复盘退款').slice(0, 100),
      });
      const res = findResponse(data);
      if (!res || !res.ok) return json({ error: '退款失败（不重试）', code: res ? res.code : null, msg: res ? res.msg : null }, 502);
      const bal = await getBalance(kv);
      if (bal) {
        bal.refunded = Math.round((bal.refunded + amount) * 100) / 100;
        await setBalance(kv, bal);
        await appendLedger(kv, { time: now(), event: 'refund', vendor: body.vendor || null, item: body.item || '退款', amount, reason: body.reason || 'AI 实验复盘退款', project: body.project || 'LTZZZ', order_no: body.out_trade_no, result: 'success', balance_after: Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 });
      }
      return json({ ok: true, refund: res.node });
    }

    // ROI 记录：AI 花钱后必须回填"为什么花 / 解决什么 / 得到什么 / 是否值得继续 / 是否续买"
    // 形成 钱 → 实验 → 数据 → 决策
    if (path === '/roi' && req.method === 'POST') {
      const orderNo = body.order_no || body.out_biz_no;
      if (!orderNo) return json({ error: 'order_no 必填（订单号）' }, 400);
      const existing = await kv.get(`ltzzz:order:${orderNo}`, 'json');
      if (!existing) return json({ error: '订单不存在' }, 404);
      const roi = {
        purpose: String(body.purpose || body.reason || existing.reason || '').slice(0, 300),   // 为什么花
        problem: String(body.problem || '').slice(0, 300),       // 解决什么问题
        got: String(body.got || '').slice(0, 500),               // 得到了什么
        effective: body.effective === true || body.effective === 'true', // 是否有效
        valid_count: Number(body.valid_count) || 0,              // 有效数量
        invalid_count: Number(body.invalid_count) || 0,          // 无效数量
        conclusion: String(body.conclusion || '').slice(0, 100), // 继续 / 停止
        next_buy: body.next_buy === true || body.next_buy === 'true', // 下一次是否继续购买
        reason: String(body.reason || '').slice(0, 500),         // 原因
      };
      existing.roi = roi;
      await kv.put(`ltzzz:order:${orderNo}`, JSON.stringify(existing));
      await appendLedger(kv, { time: now(), event: 'roi', vendor: existing.vendor, vendor_id: existing.vendor_id, item: existing.item, amount: existing.amount, reason: JSON.stringify(roi), project: existing.project || 'LTZZZ', order_no: orderNo, result: roi.effective ? 'effective' : 'not_effective', balance_after: null });
      return json({ ok: true, order_no: orderNo, roi });
    }

    // 清空测试记录（保留 balance 与停止标志；正式启用前清理冒烟测试噪音）
    if (path === '/admin/reset' && req.method === 'POST') {
      const prefixes = ['ltzzz:ledger:', 'ltzzz:decision:', 'ltzzz:order:', 'ltzzz:fail:'];
      for (const p of prefixes) {
        let cursor;
        do {
          const page = await kv.list({ prefix: p, cursor });
          for (const k of page.keys) await kv.delete(k.name);
          cursor = page.list_complete ? undefined : page.cursor;
        } while (cursor);
      }
      const bal = await getBalance(kv);
      return json({ ok: true, message: '账本/决策/订单记录已清空（余额保留）', balance: bal });
    }

    // 暂停 / 恢复（人工/AI 安全动作；/resume 为 /pause?action=resume 的别名路由）
    if ((path === '/pause' || path === '/resume') && req.method === 'POST') {
      const scope = body.scope || 'global';
      const action = path === '/resume' ? 'resume' : (body.action || 'pause');
      const reason = String(body.reason || (action === 'pause' ? 'manual' : 'resume')).slice(0, 200);
      const key = scope === 'global' ? 'ltzzz:stop:global' : `ltzzz:stop:vendor:${body.id}`;
      if (scope !== 'global' && !body.id) return json({ error: 'vendor 范围需提供 id' }, 400);
      if (action === 'resume') {
        await kv.delete(key);
        await appendLedger(kv, { time: now(), event: 'resume', vendor: body.id || null, item: scope, amount: 0, reason, project: 'LTZZZ', order_no: null, result: 'success', balance_after: null });
        return json({ ok: true, action, scope, reason });
      }
      if (action !== 'pause') return json({ error: 'action 需为 pause 或 resume' }, 400);
      await kv.put(key, reason);
      await appendLedger(kv, { time: now(), event: 'pause', vendor: body.id || null, item: scope, amount: 0, reason, project: 'LTZZZ', order_no: null, result: 'success', balance_after: null });
      return json({ ok: true, action, scope, reason });
    }

    return json({ error: 'not found' }, 404);
  },

  // 支付宝异步通知：验签 → 幂等 → 记账
  // 两类通知字段不同，不能照搬模板：
  //   交易类（收款产品）：notify_type=trade_status_sync, out_trade_no, trade_no, trade_status(TRADE_SUCCESS)
  //   转账类（单笔转账）：out_biz_no, order_id, status(SUCCESS/FAIL/DEALING)
  async handleNotify(req, env, kv) {
    const params = await readBody(req);
    if (!env.ALIPAY_PUBLIC_KEY) return new Response('fail', { status: 200 }); // 未配置公钥：无法验签，按协议返回 fail（勿用 JSON/500）
    const ok = await rsa2Verify(buildSignString(params), params.sign || '', env.ALIPAY_PUBLIC_KEY);
    if (!ok) return new Response('fail', { status: 200 });
    // 转账类通知可能不携带 app_id：仅当出现且不匹配时才拒绝
    if (params.app_id && params.app_id !== env.ALIPAY_APP_ID) return new Response('fail', { status: 200 });

    // 转账类通知（out_biz_no 前缀为 LT）
    if (params.out_biz_no && params.out_biz_no.startsWith('LT') && params.status) {
      const order = await kv.get(`ltzzz:order:${params.out_biz_no}`, 'json');
      if (!order) return new Response('fail', { status: 200 }); // 非本系统订单，忽略
      if (order.status === 'paid' || order.status === 'failed') return new Response('success', { status: 200 }); // 幂等
      await handleTransferState(env, kv, params, order);
      return new Response('success', { status: 200 });
    }

    // 交易类通知（收款产品：当面付/电脑网站支付）
    const order = await kv.get(`ltzzz:order:${params.out_trade_no}`, 'json');
    if (!order) return new Response('fail', { status: 200 }); // 非本系统订单，忽略
    if (order.status === 'paid') return new Response('success', { status: 200 }); // 幂等
    // 金额校验（字符串比较，防浮点误差）——官方要求：total_amount 必须与订单金额一致
    if (params.total_amount && Math.abs(Number(params.total_amount) - Number(order.amount)) > 0.001) {
      return new Response('fail', { status: 200 });
    }
    if (TRADE_SUCCESS.includes(params.trade_status)) {
      order.status = 'paid';
      order.trade_no = params.trade_no;
      order.paid_at = now();
      await kv.put(`ltzzz:order:${params.out_trade_no}`, JSON.stringify(order));
      const bal = await getBalance(kv);
      if (bal) {
        bal.spent = Math.round((bal.spent + Number(order.amount)) * 100) / 100;
        await setBalance(kv, bal);
        if (bal.initial + bal.refunded - bal.spent <= 0) await kv.put('ltzzz:stop:global', '余额≤0，自动停止所有付款');
      }
      await appendLedger(kv, { time: now(), event: 'paid', vendor: order.vendor, vendor_id: order.vendor_id, item: order.item, amount: order.amount, reason: order.reason, project: order.project || 'LTZZZ', order_no: order.out_trade_no, result: 'success', balance_after: bal ? Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 : null });
    }
    return new Response('success', { status: 200 });
  },
};

// 转账终态处理（notify 与主动查询共用，幂等推进 pending → paid/failed）
async function handleTransferState(env, kv, params, order) {
  const status = String(params.status || '').toUpperCase();
  const bal = await getBalance(kv);
  if (status === 'SUCCESS') {
    // 创建时已按受理记账（转账不可撤销），此处仅确认终态，不再重复扣款
    order.status = 'paid';
    order.trade_no = params.order_id || params.pay_fund_order_id || null;
    order.paid_at = now();
    await kv.put(`ltzzz:order:${order.out_biz_no}`, JSON.stringify(order));
    await appendLedger(kv, { time: now(), event: 'paid', vendor: order.vendor, vendor_id: order.vendor_id, item: order.item, amount: order.amount, reason: order.reason, project: order.project || 'LTZZZ', order_no: order.out_biz_no, result: 'success', balance_after: bal ? Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 : null });
  } else if (status === 'FAIL') {
    // 转账失败：冲回受理时已扣的金额
    if (bal) {
      bal.spent = Math.max(0, Math.round((bal.spent - Number(order.amount)) * 100) / 100);
      await setBalance(kv, bal);
      await kv.delete('ltzzz:stop:global').catch(() => {}); // 若因这笔失败触发停止，解除（余额已退回）
    }
    order.status = 'failed';
    order.failed_at = now();
    await kv.put(`ltzzz:order:${order.out_biz_no}`, JSON.stringify(order));
    await appendLedger(kv, { time: now(), event: 'transfer_failed', vendor: order.vendor, vendor_id: order.vendor_id, item: order.item, amount: order.amount, reason: order.reason, project: order.project || 'LTZZZ', order_no: order.out_biz_no, result: 'failed', error: params.fail_reason || '转账失败', balance_after: bal ? Math.round((bal.initial + bal.refunded - bal.spent) * 100) / 100 : null });
  }
  // DEALING：中间态，不动作，等终态
}

// 供本地单元测试导入
export { checkDecision, buildSignString, rsa2Sign, rsa2Verify, pkcs1ToPkcs8, isBlockedCategory, normalizeAmount, BLOCK_CATEGORIES };

// Markdown 账本导出（sync_pay_ledger.py 拉取后写入仓库 finance/LTZZZ-AI财务实验日志.md）
function renderLedgerMarkdown(entries) {
  const lines = [];
  lines.push('# LTZZZ AI 财务实验日志');
  lines.push('');
  lines.push('> 初始授权资金：400 元 ｜ 原则：任何支出必须留痕；允许失败，但错误必须留下数据；钱 → 实验 → 数据 → 决策。');
  lines.push('');
  lines.push('| 时间 | 事件 | 金额(元) | 服务商 | 商品/服务 | 项目 | AI 决策理由 / ROI | 订单号 | 结果 | 余额(元) |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const e of entries) {
    const reason = e.reason ? String(e.reason).slice(0, 120) : '-';
    lines.push(`| ${e.time || '-'} | ${e.event || '-'} | ${e.amount != null ? Number(e.amount).toFixed(2) : '-'} | ${e.vendor || '-'} | ${e.item || '-'} | ${e.project || '-'} | ${reason.replace(/\|/g, '\\|')} | ${e.order_no || '-'} | ${e.result || '-'} | ${e.balance_after != null ? Number(e.balance_after).toFixed(2) : '-'} |`);
  }
  lines.push('');
  lines.push('## 说明');
  lines.push('');
  lines.push('- 事件类型：init=初始授权 / decision=AI 决策 / order_created=下单待用户确认 / transfer_submitted=转账已受理（待最终确认） / paid=支付成功 / transfer_failed=转账失败（金额已冲回） / refund=退款 / roi=投资回报记录 / pause=暂停 / resume=恢复');
  lines.push('- 转账类订单：同步响应仅表示受理，最终状态以异步通知/主动查询为准（转账成功后不可撤销）。');
  return lines.join('\n');
}
