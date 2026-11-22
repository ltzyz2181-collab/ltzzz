// 外部定时器 Worker（ops-timer）
//
// 2026-11-21 业主指令：自动链路不再依赖 GitHub 免费档 cron。
// 事实依据：
//   1) GitHub 免费仓库 schedule 实测延迟可达数小时且触发稀疏；
//   2) Cloudflare Workers 免费档每账号只有 5 个 cron 触发器，本账号已用满
//      （wrangler 错误码 10072），不能新增 cron。
// 因此本 Worker 使用 Durable Object 自调度 alarm 作为主时钟：对象只存下一次
// alarm 时间，每次醒来先派发、再给自己定下一个 15 分钟整刻。不占 cron 配额。
//
// 边界：只做「触发」。
//   - 不读邮件正文，不碰资金 / 退款终态 / 签名 / 私钥 / 钱包 / 凭据内容；
//   - 不携带任何模型密钥，不调用任何模型；
//   - 响应与日志只输出计划键与状态，绝不回显 token。

export const REVISION = 'ops-timer-v3';
export const DEFAULT_REPOSITORY = 'ltzyz2181-collab/ltzzz';
export const DISPATCH_REF = 'main';
export const TIMER_MODE = 'durable_object_alarm_every_15m';
export const QUARTER_MS = 15 * 60 * 1000;
// 错开 1 分钟：槽位为 :01/:16/:31/:46，避开 GitHub 自身 cron 的 :00/:15/:30/:45。
// 2026-11-22 实测：同一分钟两路派发会挤进同一 concurrency 组，排队的 run 被取消。
export const SLOT_OFFSET_MS = 60 * 1000;

// 计划表：每个条目只声明「哪个工作流、在哪个整刻触发」。
// 触发时刻与各工作流自身声明的 cron 对齐，避免两套时钟互相打架。
export const PLAN = [
  {
    key: 'task-hub',
    workflow: 'task-hub.yml',
    at: 'every-15m (:01/:16/:31/:46)',
    purpose: 'Task Hub 15 分钟节拍（标签校正 / 租约回收 / 状态快照）',
    when: ({minute}) => minute % 15 === 1,
    inputs: {},
  },
  {
    key: 'dispatch-sentinel',
    workflow: 'dispatch-sentinel.yml',
    at: 'hourly (:01)',
    purpose: '派单哨兵每小时扫描',
    when: ({minute}) => minute === 1,
    inputs: {},
  },
  {
    key: 'deep-daily-card',
    workflow: 'deep-dispatch-daily.yml',
    at: '00:31',
    purpose: '每日 Deep 主办卡生成并派发队列',
    when: ({hour, minute}) => hour === 0 && minute === 31,
    inputs: {date: '', suffix: '1'},
  },
  {
    key: 'deep-daily-evidence',
    workflow: 'deep-superagent-daily.yml',
    at: '00:31',
    purpose: 'Deep 每日证据巡检',
    when: ({hour, minute}) => hour === 0 && minute === 31,
    inputs: {},
  },
  {
    key: 'ops-report',
    workflow: 'daily-ops-report.yml',
    at: '01:16',
    purpose: '每日运营日报兜底（缺证据写 unknown，不假装成功）',
    when: ({hour, minute}) => hour === 1 && minute === 16,
    inputs: {date: '', send: 'if_ready'},
  },
];

// 纯函数：给定时刻返回本轮要派发的工作流。用注入时钟测试，避免依赖真实时间。
export function decideTick(date = new Date()) {
  const hour = date.getUTCHours();
  const minute = date.getUTCMinutes();
  return PLAN.filter((item) => item.when({hour, minute})).map((item) => ({
    key: item.key,
    workflow: item.workflow,
    inputs: item.inputs,
  }));
}

// 下一个槽位（:01/:16/:31/:46，严格大于 now），保证 alarm 不会在同刻自旋。
export function nextSlotMs(nowMs) {
  const shifted = nowMs - SLOT_OFFSET_MS;
  return Math.floor(shifted / QUARTER_MS) * QUARTER_MS + SLOT_OFFSET_MS + QUARTER_MS;
}

// 手动补跑：只允许计划表里已声明的键，防止把任意工作流当作派发目标。
export function planByKeys(keys) {
  const wanted = new Set(Array.isArray(keys) ? keys : []);
  const known = new Set(PLAN.map((item) => item.key));
  const unknown = [...wanted].filter((key) => !known.has(key));
  if (unknown.length) throw new Error(`unknown_plan_keys:${unknown.sort().join(',')}`);
  return PLAN.filter((item) => wanted.has(item.key)).map((item) => ({
    key: item.key,
    workflow: item.workflow,
    inputs: item.inputs,
  }));
}

// 调用 GitHub Actions 的 workflow_dispatch。成功状态是 204（无响应体）。
export async function dispatchWorkflow({
  fetcher = fetch,
  token,
  repository = DEFAULT_REPOSITORY,
  workflow,
  ref = DISPATCH_REF,
  inputs = {},
}) {
  if (!token) return {ok: false, workflow, status: null, error: 'github_token_missing'};
  if (!workflow) return {ok: false, workflow, status: null, error: 'workflow_missing'};
  const url = `https://api.github.com/repos/${repository}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`;
  const body = {ref};
  if (inputs && Object.keys(inputs).length) body.inputs = inputs;
  let response;
  try {
    response = await fetcher(url, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'content-type': 'application/json',
        'user-agent': 'ltzzz-ops-timer',
      },
      body: JSON.stringify(body),
    });
  } catch {
    return {ok: false, workflow, status: null, error: 'transport_error'};
  }
  if (response.status === 204) return {ok: true, workflow, status: 204};
  let detail = '';
  try {
    detail = String(await response.text()).slice(0, 160);
  } catch {
    detail = '';
  }
  return {ok: false, workflow, status: response.status, error: detail || `http_${response.status}`};
}

export async function runTick({env, fetcher = fetch, now = new Date(), force = null, repository}) {
  const repo = repository || env.REPO || DEFAULT_REPOSITORY;
  const plan = force ? planByKeys(force) : decideTick(now);
  const results = [];
  for (const item of plan) {
    const outcome = await dispatchWorkflow({
      fetcher,
      token: env.LTZZZ_AGENT_TOKEN,
      repository: repo,
      workflow: item.workflow,
      inputs: item.inputs,
    });
    results.push({key: item.key, ...outcome});
  }
  return {
    revision: REVISION,
    at: now.toISOString(),
    repository: repo,
    planned: plan.length,
    dispatched: results.filter((row) => row.ok).length,
    failed: results.filter((row) => !row.ok).length,
    results,
    secrets_included: false,
  };
}

async function sha256Hex(value) {
  const bytes = new TextEncoder().encode(String(value ?? ''));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

// 定长摘要比较：不因为前缀相同而提前返回。
export async function authorized(request, env) {
  const expected = env.TIMER_TRIGGER_TOKEN;
  if (!expected) return false;
  const header = request.headers.get('authorization') || '';
  const match = /^Bearer\s+(.+)$/i.exec(header);
  if (!match) return false;
  const presented = match[1].trim();
  if (!presented) return false;
  const [left, right] = await Promise.all([sha256Hex(presented), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < left.length; i += 1) diff |= left.charCodeAt(i) ^ right.charCodeAt(i);
  return diff === 0;
}

function json(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store'},
  });
}

// Durable Object：持有「下一次 alarm」与最后一次结果。alarm 自带重试；
// 本类在 alarm 内捕获所有异常并继续排下一次，避免一次失败导致链条停摆。
export class OpsTimer {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async arm(nowMs = Date.now()) {
    const next = nextSlotMs(nowMs);
    await this.state.storage.setAlarm(next);
    return {ok: true, doctype: 'ops-timer', armed: true, next_alarm: new Date(next).toISOString()};
  }

  async status() {
    const alarm = await this.state.storage.getAlarm();
    return {
      ok: true,
      revision: REVISION,
      timer_mode: TIMER_MODE,
      next_alarm: alarm ? new Date(alarm).toISOString() : null,
      last_alarm_at: (await this.state.storage.get('last_alarm_at')) || null,
      last_result: (await this.state.storage.get('last_result')) || null,
    };
  }

  async testAlarm(body = {}) {
    const delay = Math.min(60, Math.max(5, Number(body.delay_seconds) || 8));
    const force = Array.isArray(body.force) ? body.force : null;
    if (force) planByKeys(force); // 计划外键立刻拒绝
    await this.state.storage.put('force', force);
    const at = Date.now() + delay * 1000;
    await this.state.storage.setAlarm(at);
    return {ok: true, test_alarm_armed: true, fire_at: new Date(at).toISOString(), force};
  }

  async runNow(body = {}) {
    const force = Array.isArray(body.force) ? body.force : null;
    const result = await runTick({env: this.env, now: new Date(), force});
    return {ok: result.failed === 0 && result.planned > 0, ...result};
  }

  async fetch(request) {
    const url = new URL(request.url);
    if (request.method === 'POST' && url.pathname === '/arm') {
      return json(await this.arm());
    }
    if (request.method === 'POST' && url.pathname === '/test-alarm') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      try {
        return json(await this.testAlarm(body));
      } catch (error) {
        return json({ok: false, error: String(error?.message || error).slice(0, 120)}, 400);
      }
    }
    if (request.method === 'POST' && url.pathname === '/tick') {
      let body = {};
      try {
        body = await request.json();
      } catch {
        body = {};
      }
      try {
        return json(await this.runNow(body));
      } catch (error) {
        return json({ok: false, error: String(error?.message || error).slice(0, 120)}, 400);
      }
    }
    if (url.pathname === '/status') {
      return json(await this.status());
    }
    return json({ok: false, error: 'not_found'}, 404);
  }

  async alarm() {
    const now = new Date();
    let force = null;
    try {
      force = (await this.state.storage.get('force')) || null;
      if (force) await this.state.storage.delete('force');
    } catch {
      force = null;
    }
    let summary;
    try {
      const result = await runTick({env: this.env, now, force});
      summary = {
        planned: result.planned,
        dispatched: result.dispatched,
        failed: result.failed,
        results: result.results.map((row) => ({key: row.key, ok: row.ok, status: row.status})),
      };
    } catch (error) {
      summary = {planned: 0, dispatched: 0, failed: 1, error: String(error?.message || error).slice(0, 120)};
    }
    const next = nextSlotMs(now.getTime());
    try {
      await this.state.storage.setAlarm(next);
    } catch {
      /* 排下一次失败时交给 Cloudflare alarm 重试；这里不抛出 */
    }
    try {
      await this.state.storage.put('last_alarm_at', now.toISOString());
      await this.state.storage.put('last_result', summary);
    } catch {
      /* 观测字段写入失败不应阻断下一次排程 */
    }
    console.log(JSON.stringify({kind: 'alarm_tick', at: now.toISOString(), next_alarm: new Date(next).toISOString(), ...summary}));
  }
}

function stubFor(env) {
  if (!env.OPS_TIMER) return null;
  const id = env.OPS_TIMER.idFromName('singleton');
  return env.OPS_TIMER.get(id);
}

async function viaStub(stub, path, {method = 'POST', body} = {}) {
  const response = await stub.fetch(`https://ops-timer.internal${path}`, {
    method,
    headers: body === undefined ? {} : {'content-type': 'application/json'},
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  return {status: response.status, payload};
}

export async function handleRequest(request, env, ctx, {now = new Date(), fetcher = fetch} = {}) {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    if (request.method !== 'GET') return json({ok: false, error: 'method_not_allowed'}, 405);
    return json({
      ok: true,
      revision: REVISION,
      repository: env.REPO || DEFAULT_REPOSITORY,
      timer_mode: TIMER_MODE,
      dispatch_ref: DISPATCH_REF,
      plan: PLAN.map((item) => ({key: item.key, workflow: item.workflow, at: item.at})),
      credential_configured: Boolean(env.LTZZZ_AGENT_TOKEN),
      trigger_configured: Boolean(env.TIMER_TRIGGER_TOKEN),
      durable_object_configured: Boolean(env.OPS_TIMER),
      token_echo: false,
    });
  }

  if (url.pathname === '/auth/check') {
    const passed = await authorized(request, env);
    return json({ok: passed, authenticated: passed, revision: REVISION}, passed ? 200 : 401);
  }

  if (url.pathname === '/start') {
    if (request.method !== 'POST') return json({ok: false, error: 'method_not_allowed'}, 405);
    if (!(await authorized(request, env))) return json({ok: false, error: 'unauthorized'}, 401);
    const stub = stubFor(env);
    if (!stub) return json({ok: false, error: 'durable_object_binding_missing'}, 503);
    const {status, payload} = await viaStub(stub, '/arm');
    return json({ok: payload?.ok === true, ...(payload || {})}, status);
  }

  if (url.pathname === '/status') {
    if (!(await authorized(request, env))) return json({ok: false, error: 'unauthorized'}, 401);
    const stub = stubFor(env);
    if (!stub) return json({ok: false, error: 'durable_object_binding_missing'}, 503);
    const {status, payload} = await viaStub(stub, '/status', {method: 'GET'});
    return json(payload || {ok: false}, status);
  }

  if (url.pathname === '/test-alarm') {
    if (request.method !== 'POST') return json({ok: false, error: 'method_not_allowed'}, 405);
    if (!(await authorized(request, env))) return json({ok: false, error: 'unauthorized'}, 401);
    const stub = stubFor(env);
    if (!stub) return json({ok: false, error: 'durable_object_binding_missing'}, 503);
    let body = {};
    try {
      body = await request.json();
    } catch {
      body = {};
    }
    const {status, payload} = await viaStub(stub, '/test-alarm', {body});
    return json(payload || {ok: false}, status);
  }

  if (url.pathname === '/tick') {
    if (request.method !== 'POST') return json({ok: false, error: 'method_not_allowed'}, 405);
    if (!(await authorized(request, env))) return json({ok: false, error: 'unauthorized'}, 401);
    let force = null;
    try {
      const body = await request.json();
      if (body && Array.isArray(body.force)) force = body.force;
    } catch {
      force = null;
    }
    try {
      const result = await runTick({env, fetcher, now, force});
      return json({ok: result.failed === 0 && result.planned > 0, ...result}, 200);
    } catch (error) {
      return json({ok: false, error: String(error?.message || error).slice(0, 120)}, 400);
    }
  }

  return json({ok: false, error: 'not_found'}, 404);
}

export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env, ctx);
  },
  // 保留 scheduled 入口：若以后账号升级到 Workers Paid 并加回 cron，可直接复用。
  async scheduled(event, env, ctx) {
    const now = new Date(event?.scheduledTime || Date.now());
    const work = runTick({env, now}).then((result) => {
      console.log(JSON.stringify({
        kind: 'cron_tick',
        revision: result.revision,
        at: result.at,
        planned: result.planned,
        dispatched: result.dispatched,
        failed: result.failed,
        results: result.results.map((row) => ({key: row.key, ok: row.ok, status: row.status})),
      }));
      return result;
    });
    ctx.waitUntil(work);
  },
};
