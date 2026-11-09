// LTZZZ · /orchestrate 访问控制回归（零外部请求）
// 覆盖：#9 匿名 POST 可无鉴权消耗 OPENAI_API_KEY 的缺陷
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

// Worker 为 ESM(.js)，Node 默认按 CJS 解析：复制为临时 .mjs 再导出
const src = readFileSync(new URL('../../agent-orchestrator-worker.js', import.meta.url), 'utf8');
const tmp = join(tmpdir(), `ltzzz-orch-auth-${Date.now()}.mjs`);
writeFileSync(tmp, src, 'utf8');
let worker;
try {
  ({ default: worker } = await import(pathToFileURL(tmp).href));
} finally {
  rmSync(tmp, { force: true });
}

const URL_ = 'https://localhost/orchestrate';
const QUESTION = '鉴权回归用的占位问题';

function req({ method = 'POST', key, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (key !== undefined) h['X-Orchestrator-Key'] = key;
  return new Request(URL_, {
    method,
    headers: h,
    body: method === 'GET' ? undefined : (body !== undefined ? body : JSON.stringify({ question: QUESTION }))
  });
}

// env 一律不给任何模型 Key，确保用例零外部调用
const ENV_WITH_KEY = { ORCHESTRATOR_KEY: 'test-orchestrator-key' };

test('未配置 ORCHESTRATOR_KEY 时 fail-closed 返回 503', async () => {
  const res = await worker.fetch(req(), {});
  assert.equal(res.status, 503);
  const d = await res.json();
  assert.equal(d.error, 'orchestrator_key_not_configured');
});

test('已配置密钥但匿名请求返回 401，且不进入规划', async () => {
  const res = await worker.fetch(req(), ENV_WITH_KEY);
  assert.equal(res.status, 401);
  const d = await res.json();
  assert.equal(d.error, 'unauthorized');
  assert.equal(d.plan, undefined, '匿名请求不得产生 plan');
  assert.equal(d.replies, undefined, '匿名请求不得调用任何专家席');
});

test('错误密钥返回 401', async () => {
  const res = await worker.fetch(req({ key: 'wrong-key' }), ENV_WITH_KEY);
  assert.equal(res.status, 401);
  assert.equal((await res.json()).error, 'unauthorized');
});

test('空密钥头返回 401', async () => {
  const res = await worker.fetch(req({ key: '' }), ENV_WITH_KEY);
  assert.equal(res.status, 401);
});

test('正确密钥通过鉴权后进入参数校验（空 question -> 400）', async () => {
  const res = await worker.fetch(req({ key: 'test-orchestrator-key', body: JSON.stringify({ question: '' }) }), ENV_WITH_KEY);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'question is required');
});

test('正确密钥 + 合法问题在无模型 Key 时返回 200 且四席均为 stub（零外部请求）', async () => {
  const res = await worker.fetch(req({ key: 'test-orchestrator-key' }), ENV_WITH_KEY);
  assert.equal(res.status, 200);
  const d = await res.json();
  assert.equal(d.ok, true);
  assert.equal(d.plan.source, 'builtin-router');
  assert.equal(d.replies.length, 4);
  for (const r of d.replies) {
    assert.equal(r.stub, true, `席位 ${r.agent} 应为 stub`);
    assert.equal(r.ok, false);
  }
});

test('非 POST 或非 /orchestrate 路径返回 404', async () => {
  const res = await worker.fetch(req({ method: 'GET' }), ENV_WITH_KEY);
  assert.equal(res.status, 404);
});

test('body 超限返回 413', async () => {
  const big = 'x'.repeat(70 * 1024);
  const res = await worker.fetch(req({ key: 'test-orchestrator-key', body: JSON.stringify({ question: big }) }), ENV_WITH_KEY);
  assert.equal(res.status, 413);
  assert.equal((await res.json()).error, 'body_too_large');
});

test('question 超长返回 400', async () => {
  const res = await worker.fetch(req({ key: 'test-orchestrator-key', body: JSON.stringify({ question: 'x'.repeat(5000) }) }), ENV_WITH_KEY);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'question_too_long');
});

test('非法 JSON 返回 400', async () => {
  const res = await worker.fetch(req({ key: 'test-orchestrator-key', body: 'not-json' }), ENV_WITH_KEY);
  assert.equal(res.status, 400);
  assert.equal((await res.json()).error, 'invalid_json');
});

test('OPTIONS 预检保持 204 且不要求密钥', async () => {
  const res = await worker.fetch(req({ method: 'OPTIONS' }), {});
  assert.equal(res.status, 204);
});
