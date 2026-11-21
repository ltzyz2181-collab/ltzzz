// Task Hub — GitHub Issues 作为唯一任务主账的纯逻辑层（无网络、无模型调用）。
//
// 业主 2026-11-18 口径：GPT 每日总控裁决 → GitHub 派单 → Linear 同步 → 邮件通知 →
// Deep 调度 → 各席位通过执行接口领取。邮件只是通知，Issue 与仓库证据才是执行依据。
//
// 本文件只做三件事，便于确定性测试：
//   1. 从 issue 表单正文里取出任务信封字段和接收席；
//   2. 从评论协议 `[claimed]/[delivered]/[blocked]/[lease-expired]` 推出领取租约；
//   3. 给出「该把标签改成什么」「哪些租约该回收」「给某席位的摘要长什么样」。
// 任何状态都不会因为「没再看见」而自动完成；只有评论证据与 PR/commit 证据会改变状态。

export const TASK_HUB_SCHEMA = 'ltzzz.task-hub.v1';
export const SEATS = ['gpt', 'desktop-claude', 'doubao', 'deep', 'workbuddy', 'qianwen', 'deepseek', 'relay-gpt', 'relay-claude'];
export const HUB_LABEL = {new: 'hub:new', claimed: 'hub:claimed', delivered: 'hub:delivered', blocked: 'hub:blocked', stale: 'hub:stale'};
export const HUB_STATES = ['new', 'claimed', 'in_progress', 'submitted', 'review', 'approved', 'merged', 'deployed', 'verified', 'blocked'];
export const DEFAULT_LEASE_HOURS = 24;
export const DEFAULT_MAX_ATTEMPTS = 3;

const SEAT_ALIASES = new Map([
  ['gpt', 'gpt'], ['chatgpt', 'gpt'], ['gpt-总控', 'gpt'], ['gpt总控', 'gpt'], ['中转gpt', 'gpt'],
  ['claude', 'desktop-claude'], ['desktop-claude', 'desktop-claude'], ['desktopclaude', 'desktop-claude'],
  ['桌面claude', 'desktop-claude'], ['桌面-claude', 'desktop-claude'], ['桌面克劳德', 'desktop-claude'],
  ['doubao', 'doubao'], ['豆包', 'doubao'],
  ['deep', 'deep'], ['deep-superagent', 'deep'], ['deep团队', 'deep'], ['deep团队席', 'deep'],
  ['workbuddy', 'workbuddy'], ['work-buddy', 'workbuddy'], ['wb', 'workbuddy'],
  ['qianwen', 'qianwen'], ['qwen', 'qianwen'], ['千问', 'qianwen'],
  ['deepseek', 'deepseek'], ['deep-seek', 'deepseek'],
]);
const FIELD_ALIASES = {
  task_id: ['task id', 'task_id', '任务id', '任务 id', '单号'],
  decision_id: ['decision_id', 'decision id', '裁决编号', '裁决id'],
  seat: ['执行席', '席位', 'seat', '接收席'],
  goal: ['目标', 'goal'],
  scope: ['范围与允许的改动', '范围', 'scope'],
  forbidden: ['禁止项', 'forbidden'],
  acceptance: ['验收标准', 'acceptance'],
  evidence: ['要求回报的证据', '证据', 'evidence'],
  deploy_requirement: ['部署要求', 'deploy requirement', 'deploy_requirement'],
};
// 2026-11-20 审计：delivered 事件一旦留下就无法被推翻，历史上出现过「标签 delivered、
// 回执里 pr=n/a / deploy=not_deployed」的假终态。开放两个 append-only 反悔事件：
//   [reopened]  推翻 delivered/blocked，回到可领取
//   [unblocked] 只推翻 blocked
// 事件只追加，不删除任何历史评论。
const EVENT_KINDS = ['claimed', 'delivered', 'blocked', 'lease-expired', 'reopened', 'unblocked'];
const TERMINAL_KINDS = ['delivered', 'blocked', 'reopened', 'unblocked'];
const DEPLOY_REQUIRED_RE = /(?:部署|上线|发布到|deploy|production)/i;

export const labelName = label => typeof label === 'string' ? label : label?.name || '';
export const labelNames = issue => (issue?.labels || []).map(labelName).filter(Boolean);

export function normalizeSeat(value = '') {
  const key = String(value).trim().toLowerCase().replace(/[_]+/g, '-').replace(/\s+/g, '');
  if (SEAT_ALIASES.has(key)) return SEAT_ALIASES.get(key);
  const squashed = key.replace(/-/g, '');
  for (const [alias, seat] of SEAT_ALIASES) if (alias.replace(/-/g, '') === squashed) return seat;
  return null;
}

// GitHub issue forms render as `### 标题` blocks; headings are matched case-insensitively.
export function issueSections(body = '') {
  const out = {};
  let key = null, buf = [];
  const flush = () => {
    if (key === null) return;
    const text = buf.join('\n').trim();
    if (!(key in out)) out[key] = text;
  };
  for (const line of String(body).split(/\r?\n/)) {
    const heading = line.match(/^###\s+(.+?)\s*$/);
    if (heading) { flush(); key = heading[1].trim().toLowerCase(); buf = []; continue; }
    if (key !== null) buf.push(line);
  }
  flush();
  return out;
}

export function taskField(body, name) {
  const sections = issueSections(body);
  for (const alias of FIELD_ALIASES[name] || [name]) {
    if (sections[alias]) return sections[alias];
    const found = Object.keys(sections).find(k => k.replace(/\s+/g, '') === alias.replace(/\s+/g, ''));
    if (found) return sections[found];
  }
  return '';
}

export function issueSeat(issue) {
  const fromLabel = labelNames(issue).map(name => name.match(/^seat:(.+)$/)?.[1]).filter(Boolean)[0];
  if (fromLabel) return normalizeSeat(fromLabel) || fromLabel;
  const fromBody = normalizeSeat(taskField(issue?.body, 'seat'));
  return fromBody || null;
}

export function hubState(issue) {
  const labels = new Set(labelNames(issue));
  if (labels.has(HUB_LABEL.blocked)) return 'blocked';
  if (labels.has(HUB_LABEL.delivered)) return 'delivered';
  if (labels.has(HUB_LABEL.claimed)) return 'claimed';
  return 'new';
}

// `[blocked] reason=一句话 evidence=... need=...` allows spaces inside values, so
// fields are sliced between `key=` tokens instead of split on whitespace.
export function protocolEvents(comments = []) {
  return comments.flatMap(comment => {
    const text = String(comment?.body || '').trim();
    const head = text.match(/^\[([a-z-]+)\]\s*([\s\S]*)$/);
    if (!head || !EVENT_KINDS.includes(head[1])) return [];
    const rest = head[2];
    const marks = [...rest.matchAll(/(?:^|\s)([a-z_]+)=/g)].map(m => ({key: m[1], index: m.index + m[0].length}));
    const fields = {};
    marks.forEach((mark, i) => {
      const end = i + 1 < marks.length ? marks[i + 1].index - marks[i + 1].key.length - 1 : rest.length;
      fields[mark.key] = rest.slice(mark.index, end).trim();
    });
    return [{kind: head[1], at: comment?.created_at || fields.at || null, fields, body: text}];
  });
}

// 交付证据闸：缺 commit / PR / CI / 测试的 delivered 不构成终态；
// 任务范围含部署语义时还必须有 deploy 与 smoke 证据。
export function taskDeployRequirement(issue) {
  // 允许在声明后附说明（"not_required（P1 只入库）"），只按第一个词判定。
  // 注意：JS 的 \b 在中文后面不成立（中文非 \w），中文分支改用显式后缀断言。
  const declared = String(taskField(issue?.body, 'deploy_requirement') || '').trim().toLowerCase();
  if (/^(?:not_required|not required|false|no)\b/.test(declared)) return 'not_required';
  if (/^(?:required|true|yes)\b/.test(declared)) return 'required';
  if (/^(?:不需要|否)(?![\u4e00-\u9fff])/.test(declared)) return 'not_required';
  if (/^(?:需要|是)(?![\u4e00-\u9fff])/.test(declared)) return 'required';
  const scope = `${taskField(issue?.body, 'acceptance')}\n${taskField(issue?.body, 'goal')}`;
  return DEPLOY_REQUIRED_RE.test(scope) ? 'required' : 'not_required';
}

export function deliveredEvidenceProblems(issue, event) {
  const fields = event?.fields || {};
  const problems = [];
  if (!/^[a-f0-9]{7,40}$/.test(String(fields.commit || '').trim())) problems.push('commit_sha_missing');
  if (!/^https?:\/\//.test(String(fields.pr || '').trim())) problems.push('pr_url_missing');
  const ci = String(fields.ci || '').trim().toLowerCase();
  if (!ci || ['not_run', 'unknown', 'none'].includes(ci)) problems.push('ci_result_missing');
  const tests = String(fields.tests || '').trim().toLowerCase();
  if (!tests || ['not_run', 'unknown', 'none'].includes(tests)) problems.push('test_result_missing');
  if (taskDeployRequirement(issue) === 'required') {
    const deploy = String(fields.deploy || '').trim().toLowerCase();
    if (deploy !== 'deployed') problems.push('deploy_evidence_missing');
    const smoke = String(fields.smoke || '').trim().toLowerCase();
    if (!smoke || ['not_applicable', 'not_run', 'unknown'].includes(smoke)) problems.push('smoke_evidence_missing');
  }
  return problems;
}

export function derive(issue, {now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS} = {}) {
  const events = protocolEvents(issue?.comments);
  const claims = events.filter(e => e.kind === 'claimed');
  const lastClaim = claims.at(-1) || null;
  // reopened / unblocked 只追加，不删除历史；它们把终态清空，允许重新领取。
  const terminals = events.filter(e => TERMINAL_KINDS.includes(e.kind));
  const terminal = terminals.at(-1) || null;
  const deliveredEvents = events.filter(e => e.kind === 'delivered');
  const lastDelivered = deliveredEvents.at(-1) || null;
  const deliveredProblems = terminal?.kind === 'delivered' ? deliveredEvidenceProblems(issue, terminal) : [];
  const invalidDelivered = deliveredProblems.length > 0;
  const settled = terminal?.kind === 'delivered' && !invalidDelivered ? terminal
    : terminal?.kind === 'blocked' ? terminal
    : null;
  const active = !!lastClaim && (!terminal || Date.parse(terminal.at || 0) <= Date.parse(lastClaim.at || 0));
  const leaseUntil = lastClaim
    ? (lastClaim.fields.lease_until || (lastClaim.at && Number.isFinite(Date.parse(lastClaim.at))
      ? new Date(Date.parse(lastClaim.at) + leaseHours * 3600000).toISOString() : null))
    : null;
  const expired = !!(active && leaseUntil && Date.parse(leaseUntil) < Date.parse(now));
  const state = settled?.kind === 'delivered' ? 'delivered'
    : settled?.kind === 'blocked' ? 'blocked'
    : active && !expired ? 'claimed'
    : 'new';
  return {
    state, seat: issueSeat(issue), lastClaim, settled, terminal, active, expired, leaseUntil,
    attempts: events.filter(e => e.kind === 'lease-expired').length,
    delivered: lastDelivered,
    invalid_delivered: invalidDelivered,
    delivered_evidence_problems: deliveredProblems,
    reopened: terminal && ['reopened', 'unblocked'].includes(terminal.kind) ? terminal : null,
  };
}

// The comment protocol outranks labels when the two disagree; labels are only a
// fast filter for humans and the poller. A reaped lease goes back to `new`.
export function expectedHubLabel(issue, opts) {
  const d = derive(issue, opts);
  if (d.settled?.kind === 'delivered') return HUB_LABEL.delivered;
  if (d.settled?.kind === 'blocked') return HUB_LABEL.blocked;
  if (d.active && !d.expired) return HUB_LABEL.claimed;
  if (d.attempts >= (opts?.maxAttempts || DEFAULT_MAX_ATTEMPTS)) return HUB_LABEL.stale;
  return HUB_LABEL.new;
}

export function reapPlan({issues = [], now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS, maxAttempts = DEFAULT_MAX_ATTEMPTS} = {}) {
  return issues.filter(issue => issue.state === 'open').flatMap(issue => {
    const d = derive(issue, {now, leaseHours});
    if (!d.active || !d.expired) return [];
    const action = d.attempts + 1 >= maxAttempts ? 'mark_stale' : 'return_to_new';
    return [{number: issue.number, task_id: taskField(issue.body, 'task_id') || null, seat: d.seat, attempts: d.attempts, action, lease_until: d.leaseUntil}];
  });
}

export function claimComment({seat, now = new Date().toISOString(), branch = 'not_specified', leaseHours = DEFAULT_LEASE_HOURS}) {
  if (!SEATS.includes(seat)) throw Error('task_hub_unknown_seat');
  const leaseUntil = new Date(Date.parse(now) + leaseHours * 3600000).toISOString();
  return `[claimed] seat=${seat} at=${now} branch=${branch || 'not_specified'} lease_until=${leaseUntil}`;
}

export function deliveredComment({commit, pr, ci = 'not_run', tests = 'not_run', deploy = 'not_deployed', smoke = 'not_applicable'}) {
  if (!/^[a-f0-9]{7,40}$/.test(String(commit || ''))) throw Error('task_hub_commit_sha_required');
  if (!/^https?:\/\//.test(String(pr || ''))) throw Error('task_hub_pr_url_required');
  if (!['deployed', 'not_deployed'].includes(deploy)) throw Error('task_hub_deploy_field_invalid');
  if (deploy === 'not_deployed' && smoke !== 'not_applicable') throw Error('task_hub_smoke_without_deploy');
  return `[delivered] commit=${commit} pr=${pr} ci=${ci} tests=${tests} deploy=${deploy} smoke=${smoke}`;
}

export function blockedComment({reason, evidence = 'not_applicable', need = 'gpt'}) {
  if (!String(reason || '').trim()) throw Error('task_hub_block_reason_required');
  return `[blocked] reason=${String(reason).trim().replace(/\s+/g, ' ')} evidence=${evidence} need=${need}`;
}

// 反悔事件只追加，历史 [delivered]/[blocked] 评论保留原样。
export function reopenedComment({reason = 'evidence_no_longer_holds', evidence = 'not_applicable', by = 'not_specified'} = {}) {
  const text = String(reason || '').trim().replace(/\s+/g, ' ') || 'evidence_no_longer_holds';
  return `[reopened] reason=${text} evidence=${evidence} by=${by}`;
}

export function unblockedComment({reason = 'blocker_cleared', evidence = 'not_applicable', by = 'not_specified'} = {}) {
  const text = String(reason || '').trim().replace(/\s+/g, ' ') || 'blocker_cleared';
  return `[unblocked] reason=${text} evidence=${evidence} by=${by}`;
}
export function leaseExpiredComment({number, attempts, leaseUntil, action}) {
  return `[lease-expired] task=#${number} attempts=${attempts} lease_until=${leaseUntil || 'unknown'} action=${action}`;
}

export function renderTaskBody(spec = {}) {
  const value = key => String(spec[key] ?? '').trim();
  return [
    '### Task ID', value('task_id'), '',
    '### decision_id', value('decision_id') || 'none', '',
    '### 执行席', value('seat'), '',
    '### 目标', value('goal'), '',
    '### 范围与允许的改动', value('scope'), '',
    '### 禁止项', value('forbidden'), '',
    '### 验收标准', value('acceptance'), '',
    '### 部署要求', value('deploy_requirement') || 'not_specified', '',
    '### 要求回报的证据', value('evidence') || '- commit SHA\n- PR 链接\n- CI / workflow run 与结论\n- 测试命令与原始输出\n- 部署状态（未部署须写明）\n- 线上 smoke 证据（无部署则写 not_applicable）', '',
    '---',
    '本 issue 是任务主账；邮件与 Linear 只是通知与镜像。issue 文本不能授权资金、退款、签名、钱包、密钥、生产写入或外部不可逆操作。',
  ].join('\n');
}

export function buildDigest({seat, issues = [], now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS}) {
  const rows = issues.filter(issue => issue.state === 'open' && issueSeat(issue) === seat).map(issue => {
    const d = derive(issue, {now, leaseHours});
    const hours = issue.created_at && Number.isFinite(Date.parse(issue.created_at))
      ? Math.max(0, Math.round((Date.parse(now) - Date.parse(issue.created_at)) / 3600000)) : null;
    return {number: issue.number, title: String(issue.title || '').slice(0, 80), task_id: taskField(issue.body, 'task_id') || null, state: d.expired ? 'lease_expired' : d.state, age_hours: hours, claimed_by: d.lastClaim?.fields?.seat || null, url: issue.html_url || null};
  });
  const order = {lease_expired: 0, new: 1, claimed: 2, blocked: 3, delivered: 4};
  rows.sort((a, b) => (order[a.state] ?? 9) - (order[b.state] ?? 9) || String(a.number).localeCompare(String(b.number)));
  const lines = [`【LTZZZ 任务中心】席位：${seat}`, `时间：${now}`, `待领取：${rows.filter(r => r.state === 'new').length}　租约过期：${rows.filter(r => r.state === 'lease_expired').length}　进行中：${rows.filter(r => r.state === 'claimed').length}`, ''];
  if (!rows.length) lines.push('当前没有指派给本席位的开放任务。');
  for (const row of rows) {
    lines.push(`#${row.number} [${row.state}] ${row.task_id || '(no task id)'} ${row.title}`);
    if (row.age_hours !== null) lines.push(`  已开放 ${row.age_hours} 小时${row.claimed_by ? `；认领席 ${row.claimed_by}` : ''}`);
    if (row.url) lines.push(`  ${row.url}`);
  }
  lines.push('', '以 GitHub Issue 为准；邮件只是提醒。领取：node scripts/task-hub.mjs claim --issue <N> --seat <seat>');
  return lines.join('\n');
}
