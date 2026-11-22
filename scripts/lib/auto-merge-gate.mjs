/**
 * 自动合并闸门 —— 纯判定逻辑，不触网、不读环境。
 * 任何一条不满足即 fail-closed，返回 refuse 与逐条原因。
 * 资金 / 退款 / 签名 / 私钥 / 钱包含五签 Safe / 凭据 一律不进自动合并。
 */

export const GATE_VERSION = '2026-11-21.1';

/** 只有这些目录下的改动允许被自动合并。 */
export const ALLOWED_PREFIXES = [
  'scripts/',
  'docs/',
  'knowledge/',
  'ops/',
  'config/',
];

/** 命中任一标签即拒绝。 */
export const DANGER_LABELS = [
  'hold',
  'do-not-merge',
  'blocked',
  'hub:blocked',
  'wip',
  'gpt:decide',
  'funds',
];

/** 路径命中即拒绝：资金、签名、凭据、部署闸、以及本闸门自身。 */
export const DENY_PATH_PATTERNS = [
  {re: /^contracts\//i, why: 'contracts'},
  {re: /\.sol$/i, why: 'solidity'},
  {re: /^workers\/wep3\//i, why: 'wep3-worker'},
  {re: /wrangler\.wep3/i, why: 'wep3-config'},
  {re: /^scripts\/(run-treasury-aave|preflight-signer|fulfill-market-orders|anchor-market-snapshot)\.mjs$/i, why: 'funds-script'},
  {re: /^scripts\/lib\/(signer-readiness|wallet|wallets|payout|refund|treasury|payment)[^/]*\.mjs$/i, why: 'funds-lib'},
  {re: /^\.github\/workflows\/(deploy-|autonomous-funded-orders|funded-invest|finish-fixed-aave|aave-owner-funding|escrow-)/i, why: 'deploy-or-funds-workflow'},
  {re: /^\.github\/workflows\/auto-merge-gate\.yml$/i, why: 'gate-self-modify'},
];

/** 这些结论视为失败。 */
export const TERMINAL_FAILURE_CONCLUSIONS = [
  'failure',
  'cancelled',
  'timed_out',
  'action_required',
  'stale',
  'startup_failure',
];

/** PR 正文必须带 Task ID，保留原任务号。 */
const TASK_ID_RE = /task\s*id\b\s*[:：|\-]?\s*([A-Za-z0-9][A-Za-z0-9._-]{4,})/i;

export function extractTaskId(body) {
  const m = TASK_ID_RE.exec(String(body || ''));
  return m ? m[1].trim() : null;
}

export function matchDenyPath(path) {
  const p = String(path || '');
  for (const {re, why} of DENY_PATH_PATTERNS) if (re.test(p)) return why;
  return null;
}

export function labelNames(pr) {
  return (pr?.labels || [])
    .map((l) => (typeof l === 'string' ? l : l?.name || ''))
    .filter(Boolean)
    .map((s) => s.toLowerCase());
}

export function evaluateAutoMerge({pr, files, checkRuns}) {
  const reasons = [];
  const stats = {files: 0, checks: 0, success: 0, pending: 0, failed: 0};
  const refuse = (code) => {
    if (!reasons.includes(code)) reasons.push(code);
  };

  if (!pr) return {decision: 'refuse', reasons: ['no_pull_request'], taskId: null, stats};

  const fileList = Array.isArray(files) ? files : [];
  const runs = Array.isArray(checkRuns) ? checkRuns : [];
  stats.files = fileList.length;
  stats.checks = runs.length;

  if (pr.state !== 'open') refuse('not_open');
  if (pr.draft) refuse('draft');
  if ((pr.base?.ref || '') !== 'main') refuse('base_not_main');

  const headRepo = pr.head?.repo?.full_name || '';
  const baseRepo = pr.base?.repo?.full_name || '';
  if (!headRepo || headRepo !== baseRepo) refuse('not_same_repo');

  for (const bad of DANGER_LABELS) if (labelNames(pr).includes(bad)) refuse('label:' + bad);

  const taskId = extractTaskId(pr.body || '');
  if (!taskId) refuse('missing_task_id');

  if (fileList.length === 0) refuse('no_files');
  if (fileList.length > 60) refuse('too_many_files');

  for (const f of fileList) {
    const p = String(f?.filename || '');
    if (!p) {
      refuse('empty_filename');
      continue;
    }
    if (!ALLOWED_PREFIXES.some((x) => p.startsWith(x))) {
      refuse('outside_allowlist:' + p);
    }
    const hit = matchDenyPath(p);
    if (hit) refuse('deny_path:' + hit + ':' + p);
  }

  for (const c of runs) {
    const name = c?.name || c?.app?.name || 'check';
    if (c?.status !== 'completed') {
      stats.pending += 1;
      continue;
    }
    if (TERMINAL_FAILURE_CONCLUSIONS.includes(c?.conclusion)) {
      stats.failed += 1;
      refuse('check_failed:' + name);
    } else {
      stats.success += 1;
    }
  }
  if (stats.pending > 0) refuse('checks_pending');
  if (stats.failed > 0) refuse('checks_failed');
  if (stats.success < 1) refuse('no_successful_check');

  if (pr.mergeable === false) refuse('not_mergeable');
  if (pr.mergeable_state === 'dirty') refuse('merge_conflict');

  return {
    decision: reasons.length ? 'refuse' : 'merge',
    reasons,
    taskId,
    stats,
  };
}

/** 给 PR 写一条可审计的判定评论。 */
export function renderDecisionComment({prNumber, decision, reasons, taskId, stats, merged, mergeSha}) {
  const head = merged
    ? '### [auto-merge] 已自动合并（squash）'
    : '### [auto-merge] 未合并，保持人工';
  const lines = [
    head,
    '',
    '- gate: `' + GATE_VERSION + '`',
    '- pr: #' + prNumber,
    '- task_id: `' + (taskId || 'none') + '`',
    '- files: ' + stats.files,
    '- checks: ' + stats.checks + '（success ' + stats.success + ' / pending ' + stats.pending + ' / failed ' + stats.failed + '）',
  ];
  if (mergeSha) lines.push('- merge_sha: `' + mergeSha + '`');
  if (reasons.length) {
    lines.push('', '未通过项：');
    for (const r of reasons) lines.push('- `' + r + '`');
  }
  lines.push('', '<!-- auto-merge-gate:' + GATE_VERSION + ' -->');
  return lines.join('\n');
}
