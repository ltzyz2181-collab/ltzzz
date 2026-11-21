#!/usr/bin/env node
// Task Hub CLI — 让每个 AI 席位用同一条命令领取、回报、回收任务。
//
// 权威：GitHub Issue + 评论协议（[claimed]/[delivered]/[blocked]/[lease-expired]）。
// 通知：Gmail/Linear 只是镜像，见 scripts/task-hub-mail.mjs 与 docs/TASK-HUB-CURRENT.md。
//
// 用法（默认 dry-run 的命令会标注）：
//   node scripts/task-hub.mjs init-labels [--apply]
//   node scripts/task-hub.mjs sync [--apply]            按评论证据把 hub:* 标签校正过来
//   node scripts/task-hub.mjs poll --seat <seat>        列出该席位可领取/进行中的任务
//   node scripts/task-hub.mjs claim --issue <N> --seat <seat> [--branch b] [--lease-hours 24]
//   node scripts/task-hub.mjs submit --issue <N> --commit <sha> --pr <url> [--ci ...] [--tests ...] [--deploy deployed|not_deployed] [--smoke ...]
//   node scripts/task-hub.mjs block --issue <N> --reason "..." [--evidence ...] [--need gpt]
//   node scripts/task-hub.mjs reopen --issue <N> --reason "..." [--evidence ...] [--by seat]
//   node scripts/task-hub.mjs unblock --issue <N> --reason "..." [--evidence ...] [--by seat]
//   node scripts/task-hub.mjs reap [--apply]            租约过期回收
//   node scripts/task-hub.mjs digest --seat <seat>      纯文本摘要（供邮件）
//   node scripts/task-hub.mjs status [--out knowledge/results/task-hub/latest.json]
//   node scripts/task-hub.mjs create --file spec.json [--apply]
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  TASK_HUB_SCHEMA, SEATS, HUB_LABEL, DEFAULT_LEASE_HOURS, DEFAULT_MAX_ATTEMPTS,
  labelNames, issueSeat, normalizeSeat, taskField, derive, expectedHubLabel, reapPlan,
  claimComment, deliveredComment, blockedComment, leaseExpiredComment, reopenedComment, unblockedComment,
  deliveredEvidenceProblems, renderTaskBody, buildDigest,
  reassignPlan, reassignedComment, REASSIGN_AFTER_HOURS,
} from './lib/task-hub.mjs';

export const REPOSITORY = 'ltzyz2181-collab/ltzzz';
const STATE_LABELS = Object.values(HUB_LABEL);

export function githubClient({token, repository = REPOSITORY, fetcher = fetch}) {
  if (!token) throw Error('task_hub_token_required');
  const api = async (route, {method = 'GET', body, allow = []} = {}) => {
    const response = await fetcher(`https://api.github.com/repos/${repository}/${route}`, {
      method, headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'ltzzz-task-hub'},
      ...(body ? {body: JSON.stringify(body)} : {}), redirect: 'error', signal: AbortSignal.timeout(25000),
    });
    if (!response.ok && !allow.includes(response.status)) throw Error(`task_hub_github_http_${response.status}`);
    const text = await response.text();
    return {status: response.status, data: text ? JSON.parse(text) : null};
  };
  return {
    api,
    async listOpenDispatches() {
      const out = [];
      for (let page = 1; page <= 5; page++) {
        const {data} = await api(`issues?state=open&labels=dispatch&per_page=100&page=${page}`);
        if (!Array.isArray(data) || data.length === 0) break;
        out.push(...data.filter(issue => !issue.pull_request));
        if (data.length < 100) break;
      }
      return out;
    },
    async withComments(issue) {
      const {data} = await api(`issues/${issue.number}/comments?per_page=100`);
      return {...issue, comments: Array.isArray(data) ? data : []};
    },
    async comment(number, body) { return api(`issues/${number}/comments`, {method: 'POST', body: {body}}); },
    async addLabels(number, labels) { const add = labels.filter(Boolean); if (!add.length) return null; return api(`issues/${number}/labels`, {method: 'POST', body: {labels: add}}); },
    async removeLabel(number, label) { return api(`issues/${number}/labels/${encodeURIComponent(label)}`, {method: 'DELETE', allow: [404]}); },
  };
}

const argOf = (argv, name, fallback = null) => {
  const values = argv.flatMap((arg, i) => (arg === name && argv[i + 1] ? [argv[i + 1]] : []));
  return values.at(-1) ?? fallback;
};

async function loadIssues(client) {
  const open = await client.listOpenDispatches();
  return Promise.all(open.map(issue => client.withComments(issue)));
}

export async function cmdSync({client, apply = false, now = new Date().toISOString(), maxAttempts = DEFAULT_MAX_ATTEMPTS}) {
  const issues = await loadIssues(client);
  const changes = [];
  for (const issue of issues) {
    const seat = issueSeat(issue);
    const currentSeatLabels = labelNames(issue).filter(name => name.startsWith('seat:'));
    const wantedSeat = seat ? `seat:${seat}` : null;
    if (wantedSeat && (currentSeatLabels.length !== 1 || currentSeatLabels[0] !== wantedSeat)) {
      changes.push({number: issue.number, action: 'set_seat', add: [wantedSeat], remove: currentSeatLabels.filter(l => l !== wantedSeat)});
    }
    if (!seat) changes.push({number: issue.number, action: 'seat_unresolved'});
    const wanted = expectedHubLabel({...issue, labels: issue.labels}, {now, maxAttempts});
    const currentHub = labelNames(issue).filter(name => name.startsWith('hub:'));
    if (!(currentHub.length === 1 && currentHub[0] === wanted)) {
      changes.push({number: issue.number, action: 'set_state', add: [wanted], remove: currentHub.filter(l => l !== wanted)});
    }
  }
  if (apply) {
    for (const change of changes) {
      if (!change.add && !change.remove) continue;
      await client.addLabels(change.number, change.add || []);
      for (const label of change.remove || []) await client.removeLabel(change.number, label);
    }
  }
  return {schema: TASK_HUB_SCHEMA, command: 'sync', applied: apply, issues: issues.length, changes};
}

export async function cmdPoll({client, seat, now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS}) {
  const issues = await loadIssues(client);
  const rows = issues.filter(issue => issueSeat(issue) === seat).map(issue => {
    const d = derive(issue, {now, leaseHours});
    return {number: issue.number, title: issue.title, task_id: taskField(issue.body, 'task_id') || null, state: d.expired ? 'lease_expired' : d.state, lease_until: d.leaseUntil, attempts: d.attempts, url: issue.html_url, claimable: d.state === 'new' || d.expired};
  });
  return {schema: TASK_HUB_SCHEMA, command: 'poll', seat, tasks: rows};
}

export async function cmdClaim({client, number, seat, branch = 'not_specified', now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS}) {
  if (!SEATS.includes(seat)) throw Error('task_hub_unknown_seat');
  const issue = await client.withComments((await client.api(`issues/${number}`)).data);
  const assigned = issueSeat(issue);
  if (assigned !== seat) throw Error(`task_hub_seat_mismatch:${assigned || 'unassigned'}`);
  const d = derive(issue, {now, leaseHours});
  if (d.state === 'delivered' && !d.expired) throw Error('task_hub_already_delivered');
  if (d.active && !d.expired) throw Error(`task_hub_already_claimed_by:${d.lastClaim?.fields?.seat || 'unknown'}`);
  await client.comment(number, claimComment({seat, now, branch, leaseHours}));
  // Re-read to keep the later of two simultaneous claims honest: if a claim from
  // another seat landed first, report the conflict instead of pretending to hold it.
  const after = await client.withComments((await client.api(`issues/${number}`)).data);
  const events = after.comments || [];
  const claims = events.map(c => String(c.body || '').trim()).filter(b => b.startsWith('[claimed]'));
  const mine = claims.at(-1) || '';
  if (!mine.includes(`seat=${seat}`)) return {schema: TASK_HUB_SCHEMA, command: 'claim', number, seat, status: 'claim_lost', latest_claim: mine.slice(0, 120)};
  await client.addLabels(number, [HUB_LABEL.claimed]);
  await client.removeLabel(number, HUB_LABEL.new);
  await client.removeLabel(number, HUB_LABEL.stale);
  return {schema: TASK_HUB_SCHEMA, command: 'claim', number, seat, status: 'claimed', lease_hours: leaseHours};
}

export async function cmdSubmit({client, number, commit, pr, ci, tests, deploy, smoke, now = new Date().toISOString()}) {
  // 先按 Issue 正文判定部署要求，再拒收缺证据的 delivered：
  // 缺 PR / 缺部署证据的交付不得写入终态，也不得只留下一条会误导看板的评论。
  const {data: issue} = await client.api(`issues/${number}`);
  const comment = deliveredComment({commit, pr, ci, tests, deploy, smoke});
  const parsed = {
    kind: 'delivered',
    at: now,
    fields: {commit, pr, ci, tests, deploy, smoke},
    body: comment,
  };
  const problems = deliveredEvidenceProblems(issue || {}, parsed);
  if (problems.length) throw Error(`task_hub_delivered_evidence_incomplete:${problems.join('+')}`);
  await client.comment(number, comment);
  await client.addLabels(number, [HUB_LABEL.delivered]);
  await client.removeLabel(number, HUB_LABEL.claimed);
  await client.removeLabel(number, HUB_LABEL.new);
  return {schema: TASK_HUB_SCHEMA, command: 'submit', number, status: 'delivered', at: now};
}

export async function cmdBlock({client, number, reason, evidence, need}) {
  await client.comment(number, blockedComment({reason, evidence, need}));
  await client.addLabels(number, [HUB_LABEL.blocked]);
  await client.removeLabel(number, HUB_LABEL.claimed);
  return {schema: TASK_HUB_SCHEMA, command: 'block', number, status: 'blocked'};
}

export async function cmdReopen({client, number, reason, evidence, by, now = new Date().toISOString()}) {
  const comment = reopenedComment({reason, evidence, by});
  await client.comment(number, comment);
  for (const label of [HUB_LABEL.delivered, HUB_LABEL.blocked, HUB_LABEL.claimed, HUB_LABEL.stale]) {
    await client.removeLabel(number, label);
  }
  await client.addLabels(number, [HUB_LABEL.new]);
  return {schema: TASK_HUB_SCHEMA, command: 'reopen', number, status: 'new', at: now};
}

export async function cmdUnblock({client, number, reason, evidence, by, now = new Date().toISOString()}) {
  const comment = unblockedComment({reason, evidence, by});
  await client.comment(number, comment);
  for (const label of [HUB_LABEL.blocked, HUB_LABEL.claimed, HUB_LABEL.stale]) {
    await client.removeLabel(number, label);
  }
  await client.addLabels(number, [HUB_LABEL.new]);
  return {schema: TASK_HUB_SCHEMA, command: 'unblock', number, status: 'new', at: now};
}

export async function cmdReap({client, apply = false, now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS, maxAttempts = DEFAULT_MAX_ATTEMPTS}) {
  const issues = await loadIssues(client);
  const plan = reapPlan({issues, now, leaseHours, maxAttempts});
  if (apply) {
    for (const item of plan) {
      await client.comment(item.number, leaseExpiredComment({number: item.number, attempts: item.attempts + 1, leaseUntil: item.lease_until, action: item.action}));
      await client.removeLabel(item.number, HUB_LABEL.claimed);
      await client.addLabels(item.number, [item.action === 'mark_stale' ? HUB_LABEL.stale : HUB_LABEL.new]);
    }
  }
  return {schema: TASK_HUB_SCHEMA, command: 'reap', applied: apply, reaped: plan.length, plan};
}

export async function cmdReassign({client, apply = false, now = new Date().toISOString(), afterHours = REASSIGN_AFTER_HOURS, fallbackSeats, mailTo = null, repository = REPOSITORY}) {
  const issues = await loadIssues(client);
  const plan = reassignPlan(issues, {now, afterHours, fallbackSeats});
  const notices = [];
  if (apply) {
    for (const item of plan) {
      await client.removeLabel(item.number, 'seat:' + item.seat);
      await client.addLabels(item.number, ['seat:' + item.to]);
      await client.comment(item.number, reassignedComment({number: item.number, from: item.seat, to: item.to, ageHours: item.age_hours}));
      if (mailTo) {
        const body = [
          'seat: task-hub',
          'to: ' + mailTo,
          'subject: [LTZZZ] #' + item.number + ' 派单 24h 无人领取，已改派给 ' + item.to,
          '',
          '---',
          '卡：#' + item.number + ' ' + (item.title || ''),
          '原席位：' + item.seat,
          '新席位：' + item.to,
          '已等待：' + item.age_hours + ' 小时',
          '链接：https://github.com/' + repository + '/issues/' + item.number,
          '',
          '新席位请执行 [claimed] 开始执行；原席位无需动作。'
        ].join('\n');
        const created = await client.api('issues', {method: 'POST', body: {title: 'mail: 派单改派 #' + item.number, body, labels: ['mail:send']}});
        notices.push(created?.data?.number ?? null);
      }
    }
  }
  return {schema: TASK_HUB_SCHEMA, command: 'reassign', applied: apply, after_hours: afterHours, reassigned: plan.length, plan, notices};
}

export async function cmdStatus({client, now = new Date().toISOString(), leaseHours = DEFAULT_LEASE_HOURS}) {
  const issues = await loadIssues(client);
  const rows = issues.map(issue => {
    const d = derive(issue, {now, leaseHours});
    return {number: issue.number, task_id: taskField(issue.body, 'task_id') || null, seat: issueSeat(issue), state: d.expired ? 'lease_expired' : d.state, attempts: d.attempts, lease_until: d.leaseUntil, deploy: d.delivered?.fields?.deploy || null, pr: d.delivered?.fields?.pr || null, title: issue.title,
      invalid_delivered: d.invalid_delivered, delivered_evidence_problems: d.delivered_evidence_problems,
      reopened: d.reopened ? {kind: d.reopened.kind, at: d.reopened.at} : null};
  });
  const byState = rows.reduce((acc, row) => (acc[row.state] = (acc[row.state] || 0) + 1, acc), {});
  const bySeat = rows.reduce((acc, row) => (acc[row.seat || 'unassigned'] = (acc[row.seat || 'unassigned'] || 0) + 1, acc), {});
  return {schema: TASK_HUB_SCHEMA, generated_at: now, source: 'github_issues_readback', counts: {open: rows.length, by_state: byState, by_seat: bySeat}, tasks: rows};
}

export async function cmdCreate({client, spec, now = new Date().toISOString()}) {
  const seat = normalizeSeat(spec?.seat);
  if (!seat || !SEATS.includes(seat)) throw Error('task_hub_unknown_seat');
  if (!String(spec?.task_id || '').trim()) throw Error('task_hub_task_id_required');
  if (!String(spec?.goal || '').trim()) throw Error('task_hub_goal_required');
  const existing = (await loadIssues(client)).find(issue => taskField(issue.body, 'task_id') === spec.task_id);
  if (existing) return {schema: TASK_HUB_SCHEMA, command: 'create', status: 'duplicate_task_id', number: existing.number, url: existing.html_url};
  const body = renderTaskBody({...spec, seat});
  const {data} = await client.api('issues', {method: 'POST', body: {title: spec.title || `[TASK] ${spec.task_id}`, body, labels: [`seat:${seat}`, 'dispatch', HUB_LABEL.new]}});
  return {schema: TASK_HUB_SCHEMA, command: 'create', status: 'created', number: data.number, url: data.html_url, at: now};
}

export async function cmdInitLabels({client, apply = false}) {
  const wanted = [
    ...SEATS.map(seat => ({name: `seat:${seat}`, color: '1d76db', description: '任务中心接收席'})),
    ...Object.values(HUB_LABEL).map(name => ({name, color: name === HUB_LABEL.stale ? 'b60205' : '0e8a16', description: 'Task Hub 状态'})),
  ];
  const {data} = await client.api('labels?per_page=100');
  const existing = new Set((data || []).map(label => label.name));
  const missing = wanted.filter(label => !existing.has(label.name));
  if (apply) for (const label of missing) await client.api('labels', {method: 'POST', body: label, allow: [422]});
  return {schema: TASK_HUB_SCHEMA, command: 'init-labels', applied: apply, created: missing.map(label => label.name), existing: [...existing].filter(name => wanted.some(w => w.name === name))};
}

export async function main(argv = process.argv.slice(2), {env = process.env, root = '.'} = {}) {
  const command = argv[0];
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const client = () => githubClient({token});
  const now = argOf(argv, '--now') || new Date().toISOString();
  const leaseHours = Number(argOf(argv, '--lease-hours', DEFAULT_LEASE_HOURS));
  const maxAttempts = Number(argOf(argv, '--max-attempts', DEFAULT_MAX_ATTEMPTS));
  const apply = argv.includes('--apply');
  const print = value => console.log(JSON.stringify(value, null, 2));
  switch (command) {
    case 'init-labels': return print(await cmdInitLabels({client: client(), apply}));
    case 'sync': return print(await cmdSync({client: client(), apply, now, maxAttempts}));
    case 'poll': return print(await cmdPoll({client: client(), seat: normalizeSeat(argOf(argv, '--seat')) || argOf(argv, '--seat'), now, leaseHours}));
    case 'claim': return print(await cmdClaim({client: client(), number: Number(argOf(argv, '--issue')), seat: normalizeSeat(argOf(argv, '--seat')) || argOf(argv, '--seat'), branch: argOf(argv, '--branch', 'not_specified'), now, leaseHours}));
    case 'submit': return print(await cmdSubmit({client: client(), number: Number(argOf(argv, '--issue')), commit: argOf(argv, '--commit'), pr: argOf(argv, '--pr'), ci: argOf(argv, '--ci', 'not_run'), tests: argOf(argv, '--tests', 'not_run'), deploy: argOf(argv, '--deploy', 'not_deployed'), smoke: argOf(argv, '--smoke', 'not_applicable'), now}));
    case 'block': return print(await cmdBlock({client: client(), number: Number(argOf(argv, '--issue')), reason: argOf(argv, '--reason'), evidence: argOf(argv, '--evidence', 'not_applicable'), need: argOf(argv, '--need', 'gpt')}));
    case 'reopen': return print(await cmdReopen({client: client(), number: Number(argOf(argv, '--issue')), reason: argOf(argv, '--reason'), evidence: argOf(argv, '--evidence', 'not_applicable'), by: argOf(argv, '--by', 'not_specified'), now}));
    case 'unblock': return print(await cmdUnblock({client: client(), number: Number(argOf(argv, '--issue')), reason: argOf(argv, '--reason'), evidence: argOf(argv, '--evidence', 'not_applicable'), by: argOf(argv, '--by', 'not_specified'), now}));
    case 'reap': return print(await cmdReap({client: client(), apply, now, leaseHours, maxAttempts}));
    case 'reassign': return print(await cmdReassign({client: client(), apply, now, afterHours: Number(argOf(argv, '--after-hours', REASSIGN_AFTER_HOURS)), mailTo: argOf(argv, '--mail-to')}));
    case 'digest': {
      const seat = normalizeSeat(argOf(argv, '--seat')) || argOf(argv, '--seat');
      const issues = await loadIssues(client());
      return console.log(buildDigest({seat, issues, now, leaseHours}));
    }
    case 'status': {
      const status = await cmdStatus({client: client(), now, leaseHours});
      const out = argOf(argv, '--out');
      if (out) { fs.mkdirSync(path.dirname(path.join(root, out)), {recursive: true}); fs.writeFileSync(path.join(root, out), JSON.stringify(status, null, 2) + '\n'); }
      return print(out ? {schema: status.schema, generated_at: status.generated_at, counts: status.counts, out} : status);
    }
    case 'create': {
      const file = argOf(argv, '--file');
      if (!file) throw Error('task_hub_spec_file_required');
      const spec = JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
      if (!apply) return print({schema: TASK_HUB_SCHEMA, command: 'create', mode: 'dry_run', spec});
      return print(await cmdCreate({client: client(), spec, now}));
    }
    default:
      console.error('用法：init-labels|sync|poll|claim|submit|block|reopen|unblock|reap|reassign|digest|status|create（见文件头注释）');
      return 2;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().then(code => { if (typeof code === 'number' && code !== 0) process.exitCode = code; })
    .catch(error => { console.error(JSON.stringify({error: error.message})); process.exitCode = 1; });
}
