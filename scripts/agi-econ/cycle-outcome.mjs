// A cycle used to report success no matter what the workers and auditors did. When every
// provider call failed, run-cycle still wrote four `{status:'error'}` rows, exited 0 and the
// workflow went green — the exact "model failure still passes" shape. Classification lives
// here so the rule can be tested without a provider call, and so "audit ran and rejected"
// (slashed) is never confused with "audit never ran" (blocked/error).
export const AUDITED_STATUSES = Object.freeze(['settled', 'slashed']);
export const SKIPPED_STATUSES = Object.freeze(['already_ran', 'blocked_not_retryable', 'retry_budget_exhausted']);
// A cycle whose every job was skipped for a missing key did not run. It used to look like
// a quiet success; treat it as an unconfigured runner, not as an idle day.
export const UNCONFIGURED_STATUS = 'skipped_no_worker_key';
const AUDITED = new Set(AUDITED_STATUSES);
const SKIPPED = new Set(SKIPPED_STATUSES);

export function classifyCycle(jobs) {
  if (!Array.isArray(jobs)) throw new Error('jobs_must_be_array');
  const counts = {};
  const failures = [];
  for (const job of jobs) {
    const status = typeof job?.status === 'string' && job.status ? job.status : 'unknown';
    counts[status] = (counts[status] || 0) + 1;
    if (status === 'error' || status === 'unknown') {
      failures.push({ title: job?.title ?? null, status, error: job?.error ? String(job.error).slice(0, 200) : null });
    }
  }
  const total = jobs.length;
  const audited = AUDITED_STATUSES.reduce((n, s) => n + (counts[s] || 0), 0);
  const skipped = SKIPPED_STATUSES.reduce((n, s) => n + (counts[s] || 0), 0);
  const errored = failures.length;
  const unconfigured = counts[UNCONFIGURED_STATUS] || 0;
  const blocked = total - audited - skipped - errored - unconfigured;

  let ok = true;
  let reason = 'audited';
  if (total === 0) { ok = false; reason = 'no_jobs'; }
  else if (audited > 0) { ok = true; reason = errored || blocked ? 'partially_audited' : 'audited'; }
  else if (unconfigured > 0) { ok = false; reason = 'worker_keys_missing'; }
  else if (skipped === total) { ok = true; reason = 'nothing_to_do'; }
  else if (errored > 0) { ok = false; reason = blocked > 0 ? 'no_job_reached_audit' : 'all_jobs_failed'; }
  else { ok = false; reason = 'no_job_reached_audit'; }

  return { ok, reason, total, audited, skipped, blocked, errored, unconfigured, counts, failures };
}
