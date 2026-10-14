// Settlement gate (GPT总控 review 2026-10-11): settle only if the worker produced a real, non-empty, non-truncated
// model output AND an independent model audit succeeded and accepted. Anything else → block (refund, no settle).
export const AUDITOR_MODEL_DID = { xai: 'did:ltzzz:grok', 'kimi-cn': 'did:ltzzz:kimi', deepseek: 'did:ltzzz:deepseek', doubao: 'did:ltzzz:doubao' };
export function gate({ worker, verdict, workerDid, auditorDid }) {
  if (!worker || !worker.ok) return { settle: false, reason: 'worker_model_failed' };
  if (!worker.output || !worker.output.trim()) return { settle: false, reason: 'worker_output_empty' };
  if (worker.finish_reason === 'length') return { settle: false, reason: 'worker_output_truncated' };
  if (!verdict || verdict.status !== 'success') return { settle: false, reason: 'audit_unavailable' };
  if (auditorDid === workerDid) return { settle: false, reason: 'auditor_not_independent' };
  if (AUDITOR_MODEL_DID[verdict.model] !== auditorDid) return { settle: false, reason: 'auditor_identity_mismatch' };
  if (!verdict.accepted) return { settle: true, accepted: false, reason: 'audit_rejected' }; // real rejection → slash path
  return { settle: true, accepted: true };
}
export async function modelAudit({ auditors, prompt }) {
  // auditors: [{model, did, fn, key}] tried in order; executed_by recorded truthfully
  let last = null;
  for (const a of auditors) {
    if (!a.key) continue;
    const out = await a.fn({ apiKey: a.key, prompt, maxTokens: a.maxTokens || 6000 });
    if (!out.ok || !out.output || !['stop','end_turn'].includes(out.finish_reason)) { last = { model: a.model, did: a.did, status: out.status || 'empty_output', error: String(out.error || '').slice(0, 200) }; continue; }
    const m = out.output.match(/\{[\s\S]*\}/); let j = null; try { j = JSON.parse(m[0]); } catch {}
    if (!j || typeof j.accepted !== 'boolean') { last = { model: a.model, did: a.did, status: 'unparseable' }; continue; }
    return { model: a.model, did: a.did, executed_by: out.model || a.model, status: 'success', accepted: j.accepted, score: j.score ?? null, issues: j.issues ?? [], tokens_used: out.tokens_used || 0 };
  }
  return last || { status: 'no_auditor_key' };
}
