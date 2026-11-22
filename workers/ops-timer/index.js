// 外部定时器 Worker（ops-timer）
//
// 2026-11-21 业主指令：自动链路不再依赖 GitHub 免费档 cron。
// 事实依据：GitHub 对免费仓库的 schedule 触发实测延迟可达数小时且触发稀疏，
// 不能作为「每 15 分钟必须醒一次」的主触发器。
//
// 本 Worker 由 Cloudflare Cron Trigger 驱动，用自己的时钟调用 GitHub
// workflow_dispatch，只做「触发」这一件事：
//   - 不读邮件正文，不碰资金 / 退款终态 / 签名 / 私钥 / 钱包 / 凭据内容；
//   - 不携带任何模型密钥，不调用任何模型；
//   - 响应与日志只输出状态与计划键，绝不回显 token。
//
// GitHub 侧原有 schedule 保留为 best-effort 兜底，但不再是主路径。

export const REVISION = 'ops-timer-v1';
export const DEFAULT_REPOSITORY = 'ltzyz2181-collab/ltzzz';
export const DISPATCH_REF = 'main';
export const CRON_EXPRESSION = '*/15 * * * *';

// 计划表：每个条目只声明「哪个工作流、在哪个整刻触发」。
// 触发时刻与各工作流自身声明的 cron 对齐，避免两套时钟互相打架。
export const PLAN = [
  {
    key: 'task-hub',
    workflow: 'task-hub.yml',
    at: 'every-15m',
    purpose: 'Task Hub 15 分钟节拍（标签校正 / 租约回收 / 状态快照）',
    when: ({minute}) => minute % 15 === 0,
    inputs: {},
  },
  {
    key: 'dispatch-sentinel',
    workflow: 'dispatch-sentinel.yml',
    at: 'hourly',
    purpose: '派单哨兵每小时扫描',
    when: ({minute}) => minute === 0,
    inputs: {},
  },
  {
    key: 'deep-daily-card',
    workflow: 'deep-dispatch-daily.yml',
    at: '00:30',
    purpose: '每日 Deep 主办卡生成并派发队列',
    when: ({hour, minute}) => hour === 0 && minute === 30,
    inputs: {date: '', suffix: '1'},
  },
  {
    key: 'deep-daily-evidence',
    workflow: 'deep-superagent-daily.yml',
    at: '00:30',
    purpose: 'Deep 每日证据巡检',
    when: ({hour, minute}) => hour === 0 && minute === 30,
    inputs: {},
  },
  {
    key: 'ops-report',
    workflow: 'daily-ops-report.yml',
    at: '01:15',
    purpose: '每日运营日报兜底（缺证据写 unknown，不假装成功）',
    when: ({hour, minute}) => hour === 1 && minute === 15,
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

export async function handleRequest(request, env, ctx, {now = new Date(), fetcher = fetch} = {}) {
  const url = new URL(request.url);

  if (url.pathname === '/health') {
    if (request.method !== 'GET') return json({ok: false, error: 'method_not_allowed'}, 405);
    return json({
      ok: true,
      revision: REVISION,
      repository: env.REPO || DEFAULT_REPOSITORY,
      cron: CRON_EXPRESSION,
      dispatch_ref: DISPATCH_REF,
      plan: PLAN.map((item) => ({key: item.key, workflow: item.workflow, at: item.at})),
      credential_configured: Boolean(env.LTZZZ_AGENT_TOKEN),
      trigger_configured: Boolean(env.TIMER_TRIGGER_TOKEN),
      token_echo: false,
    });
  }

  if (url.pathname === '/auth/check') {
    const passed = await authorized(request, env);
    return json({ok: passed, authenticated: passed, revision: REVISION}, passed ? 200 : 401);
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
