// LTZZZ · 编排 Worker 本地验证脚本（不发起任何外部网络请求）
// 用法: node test-orchestrator.mjs
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

const question = '请设计一个今天可验证的 AI 实验：用 AI 完成一件真实小事，并记录结果。';
const makeReq = () => new Request('https://localhost/orchestrate', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ question })
});

// 用例1：无任何 Key —— 应走内置路由，四个专家席均为接口位保留，零外部请求
const res1 = await worker.fetch(makeReq(), {});
const d1 = await res1.json();
const seats1 = (d1.replies || []).map(r => `${r.agent}=${r.ok ? 'ok' : (r.stub ? 'stub' : 'error')}`);
console.log(`[无Key] status=${res1.status} ok=${d1.ok} plan.source=${d1.plan?.source} seats=[${seats1.join(', ')}] summary.source=${d1.summary?.source}`);
if (res1.status !== 200 || !d1.ok || d1.plan?.source !== 'builtin-router') { console.log('  !!! FAILED'); process.exitCode = 1; }
if (!seats1.every(s => s.endsWith('=stub'))) { console.log('  !!! 期望全部为 stub'); process.exitCode = 1; }

// 用例2：空 Key 字符串 —— 等价于未配置，仍应走内置路由 + 全部 stub
const res2 = await worker.fetch(makeReq(), { OPENAI_API_KEY: '', ANTHROPIC_API_KEY: '', XAI_API_KEY: '' });
const d2 = await res2.json();
const stubSeats2 = (d2.replies || []).filter(r => r.stub).map(r => r.agent);
console.log(`[空Key字符串] status=${res2.status} plan.source=${d2.plan?.source} stubSeats=[${stubSeats2.join(', ')}]`);
if (res2.status !== 200 || stubSeats2.length !== 4) { console.log('  !!! FAILED, body=' + JSON.stringify(d2).slice(0, 300)); process.exitCode = 1; }

// 校验 CORS 预检
const pre = await worker.fetch(new Request('https://localhost/orchestrate', { method: 'OPTIONS' }), {});
console.log(`[OPTIONS 预检] status=${pre.status} allow-origin=${pre.headers.get('Access-Control-Allow-Origin')}`);
if (pre.status !== 204) { console.log('  !!! FAILED'); process.exitCode = 1; }

// 校验非 POST/错误路径
const bad = await worker.fetch(new Request('https://localhost/orchestrate', { method: 'GET' }), {});
console.log(`[GET 拒绝] status=${bad.status}`);
if (bad.status !== 404) { console.log('  !!! FAILED'); process.exitCode = 1; }

console.log('验证完成 ✓');
