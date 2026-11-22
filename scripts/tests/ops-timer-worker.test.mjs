import test from 'node:test';
import assert from 'node:assert/strict';

import worker, {
  REVISION,
  PLAN,
  decideTick,
  planByKeys,
  dispatchWorkflow,
  runTick,
  authorized,
  handleRequest,
} from '../../workers/ops-timer/index.js';

const SECRET = 'test-trigger-token-value';
const GH = 'test-github-token-value';

function fakeFetch(handler) {
  const calls = [];
  const fetcher = async (url, init = {}) => {
    calls.push({url, init});
    return handler(url, init, calls.length);
  };
  fetcher.calls = calls;
  return fetcher;
}

function reply(status, body = '') {
  return {status, text: async () => body};
}

function request(path, {method = 'GET', token, body} = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`https://ops-timer.test${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

test('decideTick 用注入时钟选择计划（免费档 cron 只按整刻触发）', () => {
  const keys = (iso) => decideTick(new Date(iso)).map((item) => item.key);
  assert.deepEqual(keys('2026-11-21T00:00:00Z'), ['task-hub', 'dispatch-sentinel']);
  assert.deepEqual(keys('2026-11-21T00:15:00Z'), ['task-hub']);
  assert.deepEqual(keys('2026-11-21T00:30:00Z'), ['task-hub', 'deep-daily-card', 'deep-daily-evidence']);
  assert.deepEqual(keys('2026-11-21T00:45:00Z'), ['task-hub']);
  assert.deepEqual(keys('2026-11-21T01:15:00Z'), ['task-hub', 'ops-report']);
  assert.deepEqual(keys('2026-11-21T02:15:00Z'), ['task-hub']);
  // 非整刻不派发：避免同一分钟被 Cloudflare 抖动重复触发。
  assert.deepEqual(keys('2026-11-21T01:07:00Z'), []);
});

test('PLAN 只声明已核实支持 workflow_dispatch 的工作流', () => {
  assert.equal(REVISION, 'ops-timer-v1');
  const byKey = new Map(PLAN.map((item) => [item.key, item]));
  assert.equal(byKey.get('task-hub').workflow, 'task-hub.yml');
  assert.equal(byKey.get('dispatch-sentinel').workflow, 'dispatch-sentinel.yml');
  assert.equal(byKey.get('deep-daily-card').workflow, 'deep-dispatch-daily.yml');
  assert.equal(byKey.get('deep-daily-evidence').workflow, 'deep-superagent-daily.yml');
  assert.equal(byKey.get('ops-report').workflow, 'daily-ops-report.yml');
  assert.deepEqual(byKey.get('ops-report').inputs, {date: '', send: 'if_ready'});
});

test('planByKeys 只接受计划内键，未知键直接拒绝', () => {
  const picked = planByKeys(['ops-report']);
  assert.equal(picked.length, 1);
  assert.equal(picked[0].workflow, 'daily-ops-report.yml');
  assert.throws(() => planByKeys(['ops-report', 'not-a-plan-key']), /unknown_plan_keys:not-a-plan-key/);
});

test('dispatchWorkflow 204 视为成功，并携带 ref 与 inputs', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const result = await dispatchWorkflow({
    fetcher,
    token: GH,
    repository: 'owner/repo',
    workflow: 'task-hub.yml',
    inputs: {},
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, 204);
  assert.equal(fetcher.calls.length, 1);
  const [call] = fetcher.calls;
  assert.equal(call.init.method, 'POST');
  assert.equal(
    call.url,
    'https://api.github.com/repos/owner/repo/actions/workflows/task-hub.yml/dispatches',
  );
  assert.equal(call.init.headers.authorization, `Bearer ${GH}`);
  assert.deepEqual(JSON.parse(call.init.body), {ref: 'main'});
});

test('dispatchWorkflow 把非 204 原样记为失败，不假装成功', async () => {
  const fetcher = fakeFetch(() => reply(403, '{"message":"Resource not accessible by integration"}'));
  const result = await dispatchWorkflow({fetcher, token: GH, workflow: 'task-hub.yml'});
  assert.equal(result.ok, false);
  assert.equal(result.status, 403);
  assert.match(result.error, /Resource not accessible/);
});

test('dispatchWorkflow 无 token 时不发请求', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const result = await dispatchWorkflow({fetcher, token: '', workflow: 'task-hub.yml'});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'github_token_missing');
  assert.equal(fetcher.calls.length, 0);
});

test('dispatchWorkflow 传输异常记为 transport_error', async () => {
  const fetcher = async () => {
    throw new Error('network down');
  };
  const result = await dispatchWorkflow({fetcher, token: GH, workflow: 'task-hub.yml'});
  assert.equal(result.ok, false);
  assert.equal(result.error, 'transport_error');
});

test('runTick 强制补跑按计划派发，且输出不含 token', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const result = await runTick({
    env: {LTZZZ_AGENT_TOKEN: GH, REPO: 'owner/repo'},
    fetcher,
    now: new Date('2026-11-21T03:07:00Z'),
    force: ['task-hub', 'ops-report'],
  });
  assert.equal(result.planned, 2);
  assert.equal(result.dispatched, 2);
  assert.equal(result.failed, 0);
  assert.equal(fetcher.calls.length, 2);
  assert.deepEqual(
    fetcher.calls.map((call) => new URL(call.url).pathname),
    [
      '/repos/owner/repo/actions/workflows/task-hub.yml/dispatches',
      '/repos/owner/repo/actions/workflows/daily-ops-report.yml/dispatches',
    ],
  );
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes(GH), false);
  assert.equal(serialized.includes(SECRET), false);
  assert.equal(result.secrets_included, false);
});

test('runTick 无 force 时按注入时钟派发，整点同时触发 task-hub 与哨兵', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const result = await runTick({
    env: {LTZZZ_AGENT_TOKEN: GH},
    fetcher,
    now: new Date('2026-11-21T04:00:00Z'),
  });
  assert.equal(result.repository, 'ltzyz2181-collab/ltzzz');
  assert.deepEqual(result.results.map((row) => row.key), ['task-hub', 'dispatch-sentinel']);
});

test('authorized 只认正确口令：匿名/错误/缺失配置全部拒绝', async () => {
  const env = {TIMER_TRIGGER_TOKEN: SECRET};
  assert.equal(await authorized(request('/tick', {token: SECRET}), env), true);
  assert.equal(await authorized(request('/tick', {token: `${SECRET}-wrong`}), env), false);
  assert.equal(await authorized(request('/tick'), env), false);
  assert.equal(await authorized(request('/tick', {token: SECRET}), {}), false);
});

test('/health 回读修订与配置状态，不回显任何 token', async () => {
  const response = await handleRequest(request('/health'), {
    LTZZZ_AGENT_TOKEN: GH,
    TIMER_TRIGGER_TOKEN: SECRET,
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.revision, 'ops-timer-v1');
  assert.equal(body.cron, '*/15 * * * *');
  assert.equal(body.credential_configured, true);
  assert.equal(body.trigger_configured, true);
  assert.equal(body.token_echo, false);
  const text = JSON.stringify(body);
  assert.equal(text.includes(GH), false);
  assert.equal(text.includes(SECRET), false);
});

test('/auth/check 三态：匿名 401、错误 401、有效 200', async () => {
  const env = {TIMER_TRIGGER_TOKEN: SECRET};
  const anonymous = await handleRequest(request('/auth/check'), env);
  assert.equal(anonymous.status, 401);
  const wrong = await handleRequest(request('/auth/check', {token: 'wrong'}), env);
  assert.equal(wrong.status, 401);
  const valid = await handleRequest(request('/auth/check', {token: SECRET}), env);
  assert.equal(valid.status, 200);
  assert.equal((await valid.json()).authenticated, true);
});

test('/tick 未授权 401 且不派发', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const response = await handleRequest(
    request('/tick', {method: 'POST', body: {force: ['task-hub']}}),
    {LTZZZ_AGENT_TOKEN: GH, TIMER_TRIGGER_TOKEN: SECRET},
    {},
    {fetcher},
  );
  assert.equal(response.status, 401);
  assert.equal(fetcher.calls.length, 0);
});

test('/tick 授权后真实派发计划内工作流', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const response = await handleRequest(
    request('/tick', {method: 'POST', token: SECRET, body: {force: ['task-hub']}}),
    {LTZZZ_AGENT_TOKEN: GH, TIMER_TRIGGER_TOKEN: SECRET},
    {},
    {fetcher},
  );
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.equal(body.dispatched, 1);
  assert.equal(fetcher.calls.length, 1);
  assert.match(fetcher.calls[0].url, /task-hub\.yml\/dispatches$/);
});

test('/tick 拒绝计划外键，绝不派发任意工作流', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const response = await handleRequest(
    request('/tick', {method: 'POST', token: SECRET, body: {force: ['some-other.yml']}}),
    {LTZZZ_AGENT_TOKEN: GH, TIMER_TRIGGER_TOKEN: SECRET},
    {},
    {fetcher},
  );
  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /unknown_plan_keys/);
  assert.equal(fetcher.calls.length, 0);
});

test('GET /tick 返回 405', async () => {
  const response = await handleRequest(request('/tick'), {
    LTZZZ_AGENT_TOKEN: GH,
    TIMER_TRIGGER_TOKEN: SECRET,
  });
  assert.equal(response.status, 405);
});

test('scheduled 用注入时钟触发，并通过 waitUntil 注册任务', async () => {
  const fetcher = fakeFetch(() => reply(204));
  const original = globalThis.fetch;
  globalThis.fetch = fetcher;
  let pending = null;
  try {
    await worker.scheduled(
      {scheduledTime: Date.parse('2026-11-21T00:15:00Z')},
      {LTZZZ_AGENT_TOKEN: GH, TIMER_TRIGGER_TOKEN: SECRET, REPO: 'owner/repo'},
      {waitUntil: (promise) => { pending = promise; }},
    );
    assert.ok(pending, 'scheduled 必须注册 waitUntil');
    const result = await pending;
    assert.equal(result.planned, 1);
    assert.equal(fetcher.calls.length, 1);
    assert.match(fetcher.calls[0].url, /task-hub\.yml\/dispatches$/);
  } finally {
    globalThis.fetch = original;
  }
});
