// Deep 席位活体探针（只做 liveness，不做业务分流）。
// 目的：豆包/Kimi 曾在同一轮双双 504（90s 上游窗口），而云主机出口无法直连
// workers.dev 复测。本脚本在 CI runner 侧真实调用各代理，记录可核验回执：
// http、实际模型、finish_reason、tokens、耗时与错误码。
// 一次运行最多 3 次模型调用（默认只打豆包/Kimi 两个换档席位），不代表计费证明。
import fs from 'node:fs';
import path from 'node:path';

const TOKEN = process.env.LTZZZ_AGENT_TOKEN || '';
const RUN_ID = process.env.GITHUB_RUN_ID || 'local';
const DATE = new Date().toISOString().slice(0, 10);
const OUT = `knowledge/results/deep-superagent/seat-liveness-${DATE}-${RUN_ID}.json`;

// 只探有换档动作的席位；qianwen/deepseek 近期稳定，不额外花钱。
const SEATS = [
  {seat: 'doubao', url: 'https://ltzzz-doubao-proxy.ltzyz2181.workers.dev/', model: process.env.DOUBAO_SEAT_MODEL || null, thinking: {type: 'disabled'}},
  {seat: 'kimi', url: 'https://ltzzz-kimi-proxy.ltzyz2181.workers.dev/', model: process.env.KIMI_SEAT_MODEL || null, thinking: null},
];

async function probe(spec) {
  const started = Date.now();
  const base = {seat: spec.seat, requested_model: spec.model, thinking_type: spec.thinking?.type || null, started_at_utc: new Date().toISOString()};
  if (!TOKEN) return {...base, status: 'blocked', error: 'agent_token_missing', model_calls: 0};
  try {
    const res = await fetch(spec.url, {
      method: 'POST',
      headers: {'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN},
      signal: AbortSignal.timeout(100000),
      body: JSON.stringify({
        task_id: 'SEAT-LIVENESS-' + DATE,
        messages: [{role: 'user', content: 'Return exactly this token and nothing else: OK'}],
        max_tokens: 64,
        ...(spec.thinking ? {thinking: spec.thinking} : {}),
        ...(spec.model ? {model: spec.model} : {}),
      }),
    });
    const data = await res.json().catch(() => ({}));
    const r = data?.ltzzz_receipt || {};
    const text = data?.choices?.[0]?.message?.content;
    const latency = Date.now() - started;
    const ok = res.ok && typeof text === 'string' && text.trim().length > 0 && r.generation_verified === true;
    return {
      ...base, status: ok ? 'generation_verified' : 'failed', http: res.status, latency_ms: latency,
      actual_model: r.actual_model ?? null, finish_reason: r.finish_reason ?? null,
      tokens_used: r.tokens_used ?? null, output_sha256_source: r.output_sha256 ? 'provider_receipt' : null,
      output_chars: typeof text === 'string' ? text.trim().length : 0,
      error: ok ? null : (data?.error || 'native_generation_evidence_incomplete'), model_calls: 1,
      note: 'liveness_probe_not_a_business_delivery',
    };
  } catch (err) {
    return {...base, status: 'failed', http: null, latency_ms: Date.now() - started,
      error: err?.name === 'TimeoutError' ? 'probe_timeout_100s' : 'transport_error', detail: String(err?.message || err).slice(0, 120), model_calls: 0};
  }
}

const results = [];
for (const spec of SEATS) results.push(await probe(spec));
const record = {
  schema: 'ltzzz.deep.seat-liveness.v1',
  produced_at_utc: new Date().toISOString(),
  run_id: RUN_ID,
  source_commit: process.env.GITHUB_SHA || null,
  ran_on: 'github_actions_runner (edge egress), not the cloud vm',
  model_calls: results.reduce((n, r) => n + (r.model_calls || 0), 0),
  model_calls_definition: 'generation_requests_attempted_not_billing_proof',
  seats: results,
  verdict: results.every((r) => r.status === 'generation_verified') ? 'seats_live' : 'seat_degraded',
  acceptance: false, paid: false, deployed: false,
};
fs.mkdirSync(path.dirname(OUT), {recursive: true});
fs.writeFileSync(OUT, JSON.stringify(record, null, 2) + '\n');
console.log(JSON.stringify(record.seats, null, 2));
console.log('receipt: ' + OUT);
if (record.verdict !== 'seats_live') process.exitCode = 1;
