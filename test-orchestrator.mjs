// LTZZZ · 编排 Worker 本地验证脚本（不发起任何外部网络请求）
// 用法: node test-orchestrator.mjs
// 说明：/orchestrate 自 #9 修复起要求 X-Orchestrator-Key；本脚本同步覆盖鉴权分支。
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

// Worker 是 ESM(.js)，Node 默认按 CJS 解析，先复制为临时 .mjs 再导入
const src = readFileSync(new URL('./agent-orchestrator-worker.js', import.meta.url), 'utf8');
const tmp = join(tmpdir(), `ltzzz-orch-${Date.now()}.mjs`);
writeFileSync(tmp, src, 'utf8');
let worker;
try {
  ({ default: worker } = await import(pathToFileURL(tmp).href));
} finally {
  rmSync(tmp, { force: true });
}

const QUESTION = '请设计一个今天可验证的 AI 实验：用 AI 完成一件真实小事，并记录结果。';
const SECRET = 'local-orchestrator-key';
const makeReq = (key) => {
  const headers = { 'Content-Type': 'application/json' };
  if (key !== undefined) headers['X-Orchestrator-Key'] = key;
  return new Request('https://localhost/orchestrate', {
    method: 'POST',
    headers,
    body: JSON.stringify({ question: QUESTION })
  });
};

// 用例1：未配置 ORCHESTRATOR_KEY —— fail-closed，503，不进规划
const res0 = await worker.fetch(makeReq(), {});
const d0 = await res0.json();
console.log(`[未配密钥] status=${res0.status} error=${d0.error}`);
if (res0.status !== 503 || d0.error !== 'orchestrator_key_not_configured') { console.log('  !!! FAILED'); process.exitCode = 1; }

// 用例2：已配密钥但匿名请求 —— 401，且不得产生 plan/replies
const res2a = await worker.fetch(makeReq(), { ORCHESTRATOR_KEY: SECRET });
const d2a = await res2a.json();
console.log(`[匿名请求] status=${res2a.status} error=${d2a.error} plan=${d2a.plan === undefined ? 'none' : 'LEAKED'}`);
if (res2a.status !== 401 || d2a.error !== 'unauthorized' || d2a.plan !== undefined) { console.log('  !!! FAILED'); process.exitCode = 1; }

// 用例3：错误密钥 —— 401
const res2b = await worker.fetch(makeReq('wrong-secret'), { ORCHESTRATOR_KEY: SECRET });
console.log(`[错误密钥] status=${res2b.status}`);
if (res2b.status !== 401) { console.log('  !!! FAILED'); process.exitCode = 1; }

// 用例4：正确密钥 + 无任何模型 Key —— 应走内置路由，四个专家席均为接口位保留，零外部请求
const res1 = await worker.fetch(makeReq(SECRET), { ORCHESTRATOR_KEY: SECRET });
const d1 = await res1.json();
const seats1 = (d1.replies || []).map(r => `${r.agent}=${r.ok ? 'ok' : (r.stub ? 'stub' : 'error')}`);
console.log(`[正确密钥/无模型Key] status=${res1.status} ok=${d1.ok} plan.source=${d1.plan?.source} seats=[${seats1.join(', ')}] summary.source=${d1.summary?.source}`);
if (res1.status !== 200 || !d1.ok || d1.plan?.source !== 'builtin-router') { console.log('  !!! FAILED'); process.exitCode = 1; }
if (!seats1.every(s => s.endsWith('=stub'))) { console.log('  !!! 期望全部为 stub'); process.exitCode = 1; }

// 用例5：模型 Key 为空字符串 —— 等价于未配置，仍应全部 stub
const res2 = await worker.fetch(makeReq(SECRET), { ORCHESTRATOR_KEY: SECRET, OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', XAI_API_KEY: '' });
const d2 = await res2.json();
const stubSeats2 = (d2.replies || []).filter(r => r.stub).map(r => r.agent);
console.log(`[空模型Key字符串] status=${res2.status} plan.source=${d2.plan?.source} stubSeats=[${stubSeats2.join(', ')}]`);
if (res2.status !== 200 || stubSeats2.length !== 4) { console.log('  !!! FAILED, body=' + JSON.stringify(d2).slice(0, 300)); process.exitCode = 1; }

// 校验 CORS 预检（不需要密钥）
const pre = await worker.fetch(new Request('https://localhost/orchestrate', { method: 'OPTIONS' }), {});
console.log(`[OPTIONS 预检] status=${pre.status} allow-origin=${pre.headers.get('Access-Control-Allow-Origin')}`);
if (pre.status !== 204) { console.log('  !!! FAILED'); process.exitCode = 1; }

// 校验非 POST/错误路径
const bad = await worker.fetch(new Request('https://localhost/orchestrate', { method: 'GET' }), {});
console.log(`[GET 拒绝] status=${bad.status}`);
if (bad.status !== 404) { console.log('  !!! FAILED'); process.exitCode = 1; }

// 校验部署探针：只报配置有无，不泄露 Key 值
const health = await worker.fetch(new Request('https://localhost/health', { method: 'GET' }), {});
const dh = await health.json();
console.log(`[GET /health] status=${health.status} doubao.route=${dh.doubao?.route} orchestrator_key=${dh.orchestrator_key_configured}`);
if (health.status !== 200 || dh.ok !== true || dh.doubao?.route !== 'unconfigured') { console.log('  !!! FAILED'); process.exitCode = 1; }
const body2 = JSON.stringify(dh);
if (/ark-|sk-/.test(body2)) { console.log('  !!! FAILED: health 泄露疑似 Key 片段'); process.exitCode = 1; }

// 校验豆包双路由选择：只有普通方舟 Key 时应选 ark_v3，且不被当作 Agent Plan
const h2 = await worker.fetch(new Request('https://localhost/health', { method: 'GET' }), { ARK_API_KEY: 'test-ark-key' });
const dh2 = await h2.json();
console.log(`[health 方舟 Key] route=${dh2.doubao?.route} model=${dh2.doubao?.model}`);
if (dh2.doubao?.route !== 'ark_v3') { console.log('  !!! FAILED'); process.exitCode = 1; }

console.log('验证完成 ✓');
