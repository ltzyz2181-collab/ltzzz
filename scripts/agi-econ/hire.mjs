// One AI-hires-AI job, end to end, with the settlement gate. Ledger only.
import fs from 'node:fs';
import { gate, modelAudit } from './gate.mjs';
const redact = (t) => String(t || '').replace(/0x[a-fA-F0-9]{40,}/g, '0x[已脱敏]');
export async function hire(s, { employer = 'did:ltzzz:gpt', worker, workerModel, workerCall, workerKey, title, spec, mark, prompt, source, auditors, budget = 0.05, ask = 0.03 }) {
  const previous = Object.values(s.state.tasks).filter((t) => t.title === title);
  if (previous.some((t) => ['settled', 'slashed'].includes(t.status))) return { title, status: 'already_ran' };
  // Recover a persisted interrupted attempt before another attempt is considered.
  for (const old of previous) if (!['blocked', 'settled', 'slashed'].includes(old.status)) {
    s.block(old.id, 'interrupted_attempt', { retryable: true });
    s.save();
  }
  const runId = process.env.GITHUB_RUN_ID || 'local';
  const transient = new Set(['worker_model_failed', 'audit_unavailable', 'interrupted_attempt', 'execution_exception']);
  if (previous.some((t) => t.status === 'blocked' && !transient.has(t.block_reason))) return { title, status: 'blocked_not_retryable' };
  if (previous.length >= 2 || previous.some((t) => t.run_id === runId)) return { title, status: 'retry_budget_exhausted' };
  if (!workerKey) return { title, worker, status: 'skipped_no_worker_key' };
  const emp = s.state.agents[employer];
  if (emp.credit_usd < budget) s.simFund(employer, 5, 'ledger simulation top-up (not real capital)');
  const t = s.postTask({ employer, title, spec, budget_usd: budget, acceptance: [mark] });
  t.run_id = runId; t.attempt = previous.length + 1; s.save();
  try {
  t.bid_mode = 'program_rule'; // honest: bid set by code, not by the model
  s.bid(t.id, worker, ask); s.award(t.id);
  const w = await workerCall({ apiKey: workerKey, prompt, maxTokens: 3000 });
  const wm = { model: workerModel, executed_by: w.model || workerModel, status: w.status, finish_reason: w.finish_reason ?? null, tokens_used: w.tokens_used || 0 };
  const body = w.ok && w.output ? redact(w.output) : '';
  if (!body) { const r = s.block(t.id, w.ok ? 'worker_output_empty' : 'worker_model_failed', { worker_model: { ...wm, error: String(w.error || '').slice(0, 200) } }); return { task: t.id, worker, status: r.status, reason: r.reason }; }
  s.deliver(t.id, worker, body);
  const usable = auditors.filter((a) => a.did !== worker && a.did !== employer);
  const verdict = await modelAudit({ auditors: usable, prompt: `你是独立审计AI。任务要求：${spec}\n判断交付物是否满足要求、事实是否都能在「依据材料」中找到、是否夸大或声称资金已执行。只输出 JSON：{"accepted":true|false,"score":0-100,"issues":["..."]}\n\n=== 依据材料 ===\n${String(source).slice(0, 12000)}\n\n=== 交付物 ===\n${body.slice(0, 6000)}` });
  const g = gate({ worker: { ...w, output: body }, verdict, workerDid: worker, auditorDid: verdict.did });
  if (!g.settle) { const r = s.block(t.id, g.reason, { worker_model: wm, auditor_model: verdict }); return { task: t.id, worker, status: r.status, reason: g.reason, auditor: verdict.did || null }; }
  s.audit(t.id, verdict.did, (b) => b.includes(mark) && verdict.accepted, verdict);
  const rc = s.settle(t.id);
  rc.worker_model = wm; rc.auditor_model = { model: verdict.model, did: verdict.did, executed_by: verdict.executed_by, accepted: verdict.accepted, score: verdict.score };
  fs.writeFileSync(`${s.root}/${s.state.tasks[t.id].receipt}`, JSON.stringify(rc, null, 2) + '\n');
  return { task: t.id, worker, status: s.state.tasks[t.id].status, accepted: rc.accepted, auditor: verdict.did, score: verdict.score };
  } catch (e) {
    const error = redact(String(e?.message || e)).slice(0, 200);
    if (!['settled', 'slashed', 'blocked'].includes(t.status)) {
      s.block(t.id, 'execution_exception', { error, retryable: true });
    }
    return { task: t.id, worker, status: t.status === 'blocked' ? 'blocked_refunded' : t.status, reason: 'execution_exception', error };
  } finally { s.save(); }
}

