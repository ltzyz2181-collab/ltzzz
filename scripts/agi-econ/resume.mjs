// Resume a blocked AI-hires-AI task instead of re-posting it. Ledger only.
// A blocked task is refunded but not dead: with a pinned context it can re-enter the market and
// run the exact same worker -> deliver -> audit -> settle gate. Without a context it cannot be
// replayed at all, and this script says so instead of pretending to fix it.
import path from 'node:path';
import { Subnet } from './subnet.mjs';
import { driveTask } from './hire.mjs';
import { callAgent as deepseek } from '../call-deepseek.mjs';
import { callAgent as doubao } from '../call-doubao.mjs';
import { kimiCN } from './kimi-cn.mjs';

const E = process.env;
// Worker seat -> the model name the gate/receipt expect. Kimi-CN is the domestic seat, not `kimi`.
const SEAT = {
  'did:ltzzz:deepseek': { model: 'deepseek', fn: deepseek, key: E.DEEPSEEK_API_KEY },
  'did:ltzzz:kimi': { model: 'kimi-cn', fn: kimiCN, key: E.MOONSHOT_API_KEY_CN },
  'did:ltzzz:doubao': { model: 'doubao', fn: doubao, key: E.DOUBAO_API_KEY },
};
export const AUDITORS = [
  { model: 'deepseek', did: 'did:ltzzz:deepseek', fn: deepseek, key: E.DEEPSEEK_API_KEY, maxTokens: 8192 },
  { model: 'doubao', did: 'did:ltzzz:doubao', fn: doubao, key: E.DOUBAO_API_KEY, maxTokens: 8192 },
  { model: 'kimi-cn', did: 'did:ltzzz:kimi', fn: kimiCN, key: E.MOONSHOT_API_KEY_CN, maxTokens: 16384 },
];

/** Every blocked task, with the one fact that decides whether it can come back. */
export function scanResumable(state) {
  const out = [];
  for (const t of Object.values(state.tasks || {})) {
    if (t.status !== 'blocked') continue;
    const ctx = t.context;
    const hasContext = !!(ctx && ctx.prompt);
    out.push({
      id: t.id, employer: t.employer, worker: t.worker || null,
      block_reason: t.block_reason ?? null, budget_usd: t.budget_usd,
      bids: (t.bids || []).length, attempt: t.attempt ?? 1, resume_count: t.resume_count || 0,
      resumable: hasContext, reason: hasContext ? null : 'context_missing',
    });
  }
  return out;
}

/**
 * Reopen one blocked task and drive it through the normal gate.
 * The market is re-run so a resumed task cannot skip bidding/awarding, and every model call
 * still has to pass audit + settle. Returns the same shape as hire().
 */
export async function resumeTask(s, id, { workerCall, workerKey, workerModel, auditors = [], reason = 'resume_blocked' } = {}) {
  const t = s.state.tasks[id];
  if (!t) throw new Error('unknown_task:' + id);
  const prevWorker = t.worker || (t.bids?.[0]?.worker ?? null);
  const prevAsk = Number(t.bids?.[0]?.ask_usd ?? t.budget_usd ?? 0);
  if (!prevWorker) throw new Error('resume_without_worker');
  if (typeof workerCall !== 'function') throw new Error('worker_call_required:' + String(workerModel || prevWorker));

  s.reopen(id, { reason });
  const ctx = t.context;
  let stage = 'bid';
  try {
    s.bid(id, prevWorker, prevAsk);
    stage = 'award';
    s.award(id);
  } catch (e) {
    const error = String(e?.message || e).replace(/0x[a-fA-F0-9]{40,}/g, '0x[已脱敏]').slice(0, 200);
    if (!['settled', 'slashed', 'blocked'].includes(t.status)) {
      s.block(id, 'execution_exception', { error, stage, retryable: true, resumed: true, award_diagnostics: stage === 'award' && Array.isArray(e?.diagnostics) ? e.diagnostics : null });
    }
    s.save();
    return { task: id, worker: prevWorker, status: t.status === 'blocked' ? 'blocked_refunded' : t.status, reason: 'execution_exception', stage, error };
  }
  return driveTask(s, t, {
    worker: t.worker, workerModel, workerCall, workerKey,
    prompt: ctx.prompt, spec: t.spec, mark: ctx.mark, source: ctx.source_excerpt, auditors,
    rcExtra: { resumed: true, source_truncated: ctx.source_truncated === true },
  });
}

export function summary(rows) {
  const byReason = {};
  for (const r of rows) if (r.reason) byReason[r.reason] = (byReason[r.reason] || 0) + 1;
  return {
    blocked: rows.length,
    resumable: rows.filter((r) => r.resumable).length,
    blocked_by_reason: byReason,
    model_calls: 0, real_funds_moved: false, paid: false, tx_hash: null,
  };
}

if (path.basename(process.argv[1] || '') === 'resume.mjs') {
  const root = E.LTZZZ_ROOT || process.cwd();
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const idIdx = argv.indexOf('--id');
  const id = idIdx >= 0 ? argv[idIdx + 1] : null;
  const s = new Subnet(root);
  const rows = scanResumable(s.state);
  const out = { at: new Date().toISOString(), readonly: !apply, ...summary(rows), tasks: rows };
  if (!apply) {
    console.log(JSON.stringify(out, null, 1));
  } else {
    if (!id) { console.error('resume: --apply requires --id <AET-id>'); process.exit(2); }
    const t = s.state.tasks[id];
    if (!t) { console.error('resume: unknown task ' + id); process.exit(2); }
    const seat = SEAT[t.worker || (t.bids?.[0]?.worker ?? '')];
    const audits = AUDITORS.filter((a) => a.key);
    if (!seat?.key) { console.error(`resume: no worker key for ${id} (${t.worker || 'unknown'})`); process.exit(2); }
    const r = await resumeTask(s, id, { workerCall: seat.fn, workerKey: seat.key, workerModel: seat.model, auditors: audits });
    console.log(JSON.stringify({ ...r, readonly: false }, null, 1));
  }
}
