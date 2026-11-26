#!/usr/bin/env node
// Meta-hosted Workers AI 401/403 验收脚本（只读探测；从 env 读凭据，绝不打印/落盘/外发 token）
// 用法（在能连通 *.workers.dev 的席位执行）：
//   META_WORKER_URL=https://ltzzz-meta-hosted.<sub>.workers.dev \
//   META_WORKER_TOKEN=<从平台 Secret 注入> \
//   node verify-meta-hosted-200.mjs
// 输出：结构化 JSON 到 stdout；退出码 0=全部通过，1=未达验收，2=前置缺失。
// 不修改任何状态；不属于资金/退款/签名/私钥/钱包五类动作。

const URL_BASE = (process.env.META_WORKER_URL || '').replace(/\/+$/, '');
const TOKEN = process.env.META_WORKER_TOKEN || '';
const TIMEOUT_MS = Number(process.env.VERIFY_TIMEOUT_MS || 30000);

function maskHeaders() {
  return { 'Content-Type': 'application/json' };
}
async function call(path, { method = 'GET', auth = false, body } = {}) {
  const headers = maskHeaders();
  if (auth) headers.Authorization = `Bearer ${TOKEN}`; // 仅内存使用，不打印
  const started = Date.now();
  let res, text;
  try {
    res = await fetch(URL_BASE + path, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    text = await res.text();
  } catch (e) {
    return { http: 0, ms: Date.now() - started, error: String(e && e.message || e) };
  }
  let parsed = null;
  try { parsed = JSON.parse(text); } catch { /* keep raw */ }
  return {
    http: res.status,
    ms: Date.now() - started,
    json: parsed,
    raw_preview: parsed ? undefined : String(text).slice(0, 240),
  };
}

(async () => {
  const out = {
    checked_at_utc: new Date().toISOString(),
    worker_url_present: Boolean(URL_BASE),
    token_present: Boolean(TOKEN), // 布尔值，不含明文
    source: 'workbuddy-readonly-verify',
    checks: {},
  };
  if (!URL_BASE) { out.verdict = 'PRECONDITION_MISSING_META_WORKER_URL'; console.log(JSON.stringify(out, null, 2)); process.exit(2); }

  out.checks.health = await call('/health');
  out.checks.anonymous_task = await call('/task', { method: 'POST', body: {} }); // 期望 401

  if (TOKEN) {
    const prompt = '用中文一句话说明本次连通性验收；不得声称已完成雇佣或付款，150 字内。';
    out.checks.authorized_task = await call('/task', {
      method: 'POST', auth: true,
      body: { task_id: `verify-${Date.now()}`, kind: 'hire', prompt },
    }); // 期望 200 且 output 非空
  } else {
    out.checks.authorized_task = { http: 0, skipped: true, reason: 'META_WORKER_TOKEN not provided' };
  }

  const anonOk = out.checks.anonymous_task.http === 401;
  const authOk = out.checks.authorized_task.http === 200 &&
    Boolean(out.checks.authorized_task.json && (out.checks.authorized_task.json.output || out.checks.authorized_task.json.result));
  const unreachable = [out.checks.health, out.checks.anonymous_task, out.checks.authorized_task]
    .some(c => c.http === 0);

  out.verdict = (anonOk && authOk) ? 'PASS_200_AND_401'
    : unreachable ? 'BLOCKED_ENDPOINT_UNREACHABLE'
    : 'NOT_CONFIRMED';
  // 注意：BLOCKED_ENDPOINT_UNREACHABLE 只代表本机网络不通，不代表线上推理失败；
  // 须以 CI 侧 verify-meta-hosted.mjs 落盘的 knowledge/results/meta/<run_id>.json 为准。
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.verdict === 'PASS_200_AND_401' ? 0 : 1);
})();
