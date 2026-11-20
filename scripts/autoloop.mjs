// Daily autoloop: claim -> bounded execute -> PR -> optional merge -> digest.
// Safety design (why this is not a free-form agent):
//   1. An issue is only claimable when a human labelled it `autoloop:exec` AND
//      `ops/autoloop/executors.json` has an executor for that label. Issue text is
//      never executed; it is untrusted input.
//   2. Merge is opt-in per executor (`auto_merge: true`), and only after real GitHub
//      evidence: non-empty check runs (or pull_request workflow runs) that all completed
//      successfully. Executor self-verify never substitutes for CI (2026-11-19 audit).
//   3. Adjudication-class work goes to the relay seat as an advisory note and is
//      never allowed to claim merged/deployed/platform_accepted.
//   4. If AUTOLOOP_ENABLED is not exactly 'true', the run is plan-only.
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {githubClient, cmdClaim, cmdSubmit, cmdBlock, cmdReap} from './task-hub.mjs';
import {derive, taskField, labelNames} from './lib/task-hub.mjs';

export const SCHEMA = 'ltzzz.autoloop.v1';
export const EXECUTOR_FILE = 'ops/autoloop/executors.json';
export const ACTIONS = Object.freeze(['exec', 'adjudicate', 'escalate', 'skip']);
// Owner 2026-11-19: ordinary rulings move to the relay GPT seat; relay Claude writes code
// and reviews in the Deep team. Funds/refunds/signing/keys/wallet/credentials never reach them.
export const RELAY_SEATS = Object.freeze({
  'relay-gpt': {model: 'gpt-6.1-sol', profile: 'adjudication', purpose: 'adjudication'},
  'relay-claude': {model: 'claude-sonnet-4-6', profile: 'code', purpose: 'code'},
});
export const DEFAULT_RELAY = 'relay-gpt';

export function loadExecutors(fsImpl = fs, file = EXECUTOR_FILE) {
  const raw = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  if (raw.schema !== 'ltzzz.autoloop.executors.v1') throw new Error('bad_executor_schema');
  if (!Array.isArray(raw.executors)) throw new Error('executors_must_be_array');
  for (const e of raw.executors) {
    if (!/^[a-z0-9-]{3,40}$/.test(e.id || '')) throw new Error('bad_executor_id');
    if (!e.match?.label || typeof e.match.label !== 'string') throw new Error('bad_executor_label');
    if (!Array.isArray(e.command) || e.command.length === 0 || e.command.some(c => typeof c !== 'string')) throw new Error('bad_executor_command');
    if (!/^(node|python3|python|bash)$/.test(e.command[0])) throw new Error('executor_command_not_allowlisted');
    if (e.verify !== undefined) {
      if (!Array.isArray(e.verify) || e.verify.length === 0 || e.verify.some(c => typeof c !== 'string')) throw new Error('bad_executor_verify');
      if (!/^(node|python3|python|bash)$/.test(e.verify[0])) throw new Error('executor_verify_not_allowlisted');
    }
  }
  return raw.executors;
}

// Owner 2026-11-19: only the items below stay with the GPT decision seat.
// Everything else executes, merges and deploys automatically.
const GPT_RESERVED_TERM = /(\u8d44\u91d1|\u4ed8\u6b3e|\u4ed8\u85aa|\u8f6c\u8d26|\u653e\u6b3e|\u9000\u6b3e|\u7b7e\u540d|\u79c1\u94a5|\u52a9\u8bb0\u8bcd|\u94b1\u5305|\u4e94\u7b7e|Safe|\u51ed\u636e|\u5bc6\u94a5|Secrets?)/i;
const NEGATED = /(\u4e0d\u6d89\u53ca|\u4e0d\u542b|\u4e0d\u78b0|\u65e0\u9700|\u4e0d\u6388\u6743|\u4e0d\u6267\u884c|\u4e0d\u5141\u8bb8|\u4e0d\u5f97|\u4e0d\u80fd|\u7981\u6b62|\u4e25\u7981|\u65e0\u8d44\u91d1|\u6ca1\u6709\u8d44\u91d1|\u4e0d\u8fdb\u884c|\u4e0d\u53d1\u8d77|\u4e0d\u505a|\u4e0d\u6539\u53d8)/;
const CLAUSE_SPLIT = /[\u3002\uff1b;\uff01!\uff1f?\n]|\u4f46\u662f|\u4e0d\u8fc7|\u7136\u800c|\u4f46/;

function clauseList(text = '') {
  return String(text).split(CLAUSE_SPLIT).map(c => c.trim()).filter(Boolean);
}

// A card that says "this does not touch funds or signing" must not be blocked by the
// words it uses to disclaim them: negated clauses are dropped before the reserved scan.
export function riskClauses(text = '') {
  return clauseList(text).filter(c => GPT_RESERVED_TERM.test(c) && !NEGATED.test(c));
}

export function reservedTopics(text = '') {
  const hits = new Set();
  for (const clause of clauseList(text)) {
    if (NEGATED.test(clause)) continue;
    const scan = new RegExp(GPT_RESERVED_TERM.source, 'gi');
    for (const m of clause.matchAll(scan)) hits.add(m[0].toLowerCase());
  }
  return [...hits];
}

export function classifyIssue(issue, executors = []) {
  const labels = labelNames(issue);
  if (!issue || issue.pull_request) return {action: 'skip', reason: 'not_an_issue'};
  if (issue.state && issue.state !== 'open') return {action: 'skip', reason: 'not_open'};
  if (labels.some(l => /^no-autoloop$/.test(l))) return {action: 'skip', reason: 'explicitly_disabled'};
  const humanOnly = labels.some(l => /(^|:)human-only$/.test(l));
  const exec = executors.find(e => labels.includes(e.match.label));
  const topics = humanOnly ? ['human-only'] : reservedTopics(`${issue.title || ''}\n${issue.body || ''}`);
  if (topics.length && exec) return {action: 'escalate', executor: exec, topics, reason: 'gpt_reserved_topic'};
  if (exec) return {action: 'exec', executor: exec, reason: 'labelled_exec'};
  if (labels.includes('autoloop:adjudicate') || labels.includes('autoloop:adjudicate:claude')) {
    if (topics.length) return {action: 'escalate', topics, reason: 'gpt_reserved_topic'};
    const relay = labels.includes('autoloop:adjudicate:claude') ? 'relay-claude' : DEFAULT_RELAY;
    return {action: 'adjudicate', relay, reason: 'labelled_adjudicate'};
  }
  return {action: 'skip', reason: 'no_autoloop_label'};
}

// task-hub refuses a claim on an unassigned card. A card that carries an explicit
// autoloop executor label is targeted at this seat, so the seat label is added first;
// without that label nothing is claimed and the card stays as it was.
export async function ensureSeatLabel({client, issue, seat}) {
  if (!issue) return false;
  if (derive(issue, {leaseHours: 24}).seat) return false;
  await client.addLabels(issue.number, ['seat:' + seat]);
  return true;
}

// Cards opt in either with the Deep `dispatch` label or with an autoloop label itself.
// GitHub's label filter is AND-only, so fan out one query per label and dedupe by number.
export async function listAutoloopCandidates(client, executors = []) {
  const labels = ['dispatch', 'autoloop:adjudicate', 'autoloop:adjudicate:claude', ...executors.map(e => e.match.label)];
  const seen = new Map();
  for (const label of new Set(labels.filter(Boolean))) {
    const {data} = await client.api(`issues?state=open&labels=${encodeURIComponent(label)}&per_page=100`);
    for (const issue of Array.isArray(data) ? data : []) {
      if (issue.pull_request) continue;
      seen.set(issue.number, issue);
    }
  }
  return [...seen.values()];
}

export function planWork({issues = [], seat, executors = [], now = new Date().toISOString(), leaseHours = 24}) {
  const claimable = [], adjudicable = [], escalations = [], skipped = [];
  for (const issue of issues) {
    const d = derive(issue, {now, leaseHours});
    if (d.seat && d.seat !== seat) { skipped.push({number: issue.number, reason: 'other_seat', seat: d.seat}); continue; }
    if (d.settled) { skipped.push({number: issue.number, reason: `settled_${d.settled.kind}`}); continue; }
    if (d.active && !d.expired) { skipped.push({number: issue.number, reason: 'leased_by_someone_else'}); continue; }
    const c = classifyIssue(issue, executors);
    const task_id = taskField(issue.body, 'task_id');
    if (c.action === 'exec') claimable.push({number: issue.number, task_id, executor: c.executor});
    else if (c.action === 'adjudicate') adjudicable.push({number: issue.number, task_id, relay: c.relay || DEFAULT_RELAY});
    else if (c.action === 'escalate') escalations.push({number: issue.number, task_id, topics: c.topics || ['human-only']});
    else skipped.push({number: issue.number, reason: c.reason});
  }
  return {claimable, adjudicable, escalations, skipped};
}
export function buildEmailDigest({done = [], needsGpt = [], nextActions = [], mail = null, run = {}}) {
  const bullet = (rows, empty) => (rows.length ? rows.map(r => `- ${r}`).join('\n') : `- ${empty}`);
  const subject = `【LTZZZ】自动循环 ${run.day || ''}：完成 ${done.length} / 待裁决 ${needsGpt.length}`;
  const body = [
    `# LTZZZ 自动循环汇总 ${run.day || ''}`.trim(),
    '',
    `- run_id：${run.run_id || 'local'}`,
    `- 席位：${run.seat || 'unspecified'}`,
    `- 模式：${run.mode || 'plan_only'}`,
    `- 邮箱：读 ${mail?.read?.status || 'not_attempted'} / 发 ${mail?.send?.status || '见回执（本邮件即本次发送）'}`,
    '',
    '## 今天做了什么',
    bullet(done, '无自动完成项'),
    '',
    '## 需要 GPT 裁决',
    bullet(needsGpt, '无'),
    '',
    '## 下一步',
    bullet(nextActions, '按既有看板继续'),
    '',
    '本邮件为 L1 信息通知；不含凭据、密钥、客户资料。自动合并仅限仓库内低风险路径，资金/签名/生产部署仍人工。',
  ].join('\n');
  return {subject, body};
}



export function runMail(args, {env = process.env, cwd = process.cwd(), python = env.AUTOLOOP_PYTHON || 'python3'} = {}) {
  const r = spawnSync(python, ['scripts/autoloop-mail.py', ...args], {cwd, encoding: 'utf8', timeout: 90000});
  const last = String(r.stdout || '').trim().split('\n').filter(Boolean).at(-1);
  try { return JSON.parse(last); } catch { return {status: 'failed_unparseable', code: r.status}; }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
async function gh(token, method, route, body) {
  const res = await fetch('https://api.github.com/repos/ltzyz2181-collab/ltzzz/' + route, {
    method,
    headers: {authorization: 'Bearer ' + token, accept: 'application/vnd.github+json', 'content-type': 'application/json', 'user-agent': 'ltzzz-autoloop'},
    ...(body ? {body: JSON.stringify(body)} : {}),
    redirect: 'error',
  });
  const text = await res.text();
  if (!res.ok) throw new Error('autoloop_github_' + res.status + ':' + method + ' ' + path);
  return text ? JSON.parse(text) : null;
}

// Publish only the files the executor actually changed, on a fresh branch. Nothing is
// force-pushed and no local branch is rewritten, so a failed run cannot clobber main.
export async function publishChanges({token, cwd = process.cwd(), paths, branch, message}) {
  if (!paths || paths.length === 0) return {published: false, reason: 'no_changes'};
  const ref = await gh(token, 'GET', 'git/ref/heads/main');
  const head = ref.object.sha;
  const headCommit = await gh(token, 'GET', 'git/commits/' + head);
  const entries = [];
  for (const p of paths) {
    const abs = path.join(cwd, p);
    if (!fs.existsSync(abs)) { entries.push({path: p, mode: '100644', type: 'blob', sha: null}); continue; }
    const blob = await gh(token, 'POST', 'git/blobs', {content: fs.readFileSync(abs).toString('base64'), encoding: 'base64'});
    entries.push({path: p, mode: '100644', type: 'blob', sha: blob.sha});
  }
  const tree = await gh(token, 'POST', 'git/trees', {base_tree: headCommit.tree.sha, tree: entries});
  const commit = await gh(token, 'POST', 'git/commits', {message, tree: tree.sha, parents: [head]});
  await gh(token, 'POST', 'git/refs', {ref: 'refs/heads/' + branch, sha: commit.sha});
  const pr = await gh(token, 'POST', 'pulls', {title: message.split('\n')[0], head: branch, base: 'main', body: message});
  return {published: true, commit: commit.sha, pr: pr.number, pr_url: pr.html_url, base: head};
}

// Merge requires REAL GitHub evidence. Local executor verify is only an extra check and
// never stands in for CI (2026-11-19 audit: PR #446/#449 merged with zero check-runs while
// their pull_request workflow runs had actually failed). Two GitHub sources count:
// check-runs, or pull_request-triggered workflow runs on the same head SHA. Silence from
// both is 'none_or_pending' and must block the merge.
export async function waitForChecks({token, sha, attempts = 18, pauseMs = 30000, fetcher = gh, sleepFn = sleep}) {
  let empty = 0;
  for (let i = 0; i < attempts; i++) {
    const runs = await fetcher(token, 'GET', 'commits/' + sha + '/check-runs');
    const list = runs?.check_runs || [];
    if (list.length > 0) {
      empty = 0;
      if (list.some(r => ['failure', 'timed_out', 'cancelled', 'action_required', 'stale'].includes(r.conclusion))) return 'failed';
      const done = list.filter(r => r.status === 'completed');
      if (done.length === list.length && done.every(r => ['success', 'neutral', 'skipped'].includes(r.conclusion))) return 'success';
    } else {
      // GitHub can report zero check-runs for a head SHA while real pull_request workflow
      // runs exist (observed on PR #446/#449). Read those before concluding "no checks".
      const actions = await fetcher(token, 'GET', 'actions/runs?head_sha=' + sha + '&per_page=100');
      const prRuns = (actions?.workflow_runs || []).filter(r => r.event === 'pull_request');
      if (prRuns.length > 0) {
        empty = 0;
        if (prRuns.some(r => r.conclusion && !['success', 'neutral', 'skipped'].includes(r.conclusion))) return 'failed';
        if (prRuns.every(r => r.status === 'completed')) return 'success';
      } else {
        empty += 1;
        // Nothing is ever attached on some branches; do not burn the whole window on silence.
        if (empty >= 2) return 'none_or_pending';
      }
    }
    if (i < attempts - 1) await sleepFn(pauseMs);
  }
  return 'none_or_pending';
}

const runCmd = (cmd, opts = {}) => spawnSync(cmd[0], cmd.slice(1), {encoding: 'utf8', timeout: opts.timeout || 600000, ...opts});

export function executeExecutor(executor, {cwd = process.cwd(), env = null} = {}) {
  const r = runCmd(executor.command, env ? {cwd, env} : {cwd});
  return {
    ok: r.status === 0,
    http_code: r.status,
    stdout_tail: String(r.stdout || '').slice(-2000),
    stderr_tail: String(r.stderr || '').slice(-2000),
  };
}

// Executor-local verification. PR check-runs are not reliable here (workflows on a
// token-created branch can sit in action_required), so an executor may declare its own
// verify command. It never replaces a failing check; it only stands in for silence.
// Once the executor output is committed to its branch, the local worktree must go back
// to HEAD; otherwise the receipt push later cannot rebase onto the advanced main.
export function discardChanges({cwd = process.cwd(), paths = []} = {}) {
  const restored = [];
  for (const rel of paths) {
    const tracked = spawnSync('git', ['ls-files', '--error-unmatch', '--', rel], {cwd, encoding: 'utf8'});
    if (tracked.status === 0) {
      spawnSync('git', ['restore', '--source=HEAD', '--staged', '--worktree', '--', rel], {cwd, encoding: 'utf8'});
    } else {
      try { fs.rmSync(path.join(cwd, rel), {force: true}); } catch {}
    }
    restored.push(rel);
  }
  return restored;
}

// Auto-deploy is a consequence of merging to main: the repo's deploy-*.yml workflows are
// already wired to push events. This reads back what actually got queued for the merge
// commit, so a receipt never claims a deployment it did not observe.
export async function recordDeployRuns({token, sha, fetcher = gh}) {
  if (!sha) return {status: 'no_merge_commit', runs: []};
  let data;
  try {
    data = await fetcher(token, 'GET', 'actions/runs?head_sha=' + sha + '&per_page=100');
  } catch (error) {
    return {status: 'readback_failed', detail: String(error?.message || error).slice(0, 120), runs: []};
  }
  const runs = (data?.workflow_runs || [])
    .filter(r => /deploy/i.test(r.path || r.name || ''))
    .map(r => ({workflow: r.name, run_id: r.id, status: r.status, conclusion: r.conclusion, url: r.html_url}));
  if (runs.length === 0) return {status: 'no_deploy_workflow_matched', runs: []};
  const failed = runs.filter(r => r.conclusion === 'failure');
  return {status: failed.length ? 'deploy_run_failed' : 'deploy_queued', runs};
}

// Deploy workflows are triggered by the merge itself, so the loop waits a bounded time for
// them to finish instead of claiming a deployment it has not observed.
export async function waitForDeploy({token, sha, attempts = 8, pauseMs = 30000, fetcher = gh, sleepFn = sleep} = {}) {
  let last = {status: 'no_merge_commit', runs: []};
  for (let i = 0; i < attempts; i++) {
    last = await recordDeployRuns({token, sha, fetcher});
    if (last.status === 'deploy_run_failed' || last.status === 'no_deploy_workflow_matched' || last.status === 'no_merge_commit') return last;
    const settled = last.runs.every(r => r.status === 'completed');
    if (settled) return {status: 'deployed', runs: last.runs};
    if (i < attempts - 1) await sleepFn(pauseMs);
  }
  return {status: 'deploy_pending', runs: last.runs};
}

export function runVerification(executor, {cwd = process.cwd(), env = null} = {}) {
  if (!Array.isArray(executor?.verify) || executor.verify.length === 0) return {ran: false, ok: false};
  const r = runCmd(executor.verify, env ? {cwd, env, timeout: 900000} : {cwd, timeout: 900000});
  return {ran: true, ok: r.status === 0, code: r.status, stdout_tail: String(r.stdout || '').slice(-1500), stderr_tail: String(r.stderr || '').slice(-1500)};
}

export function changedPaths(cwd = process.cwd()) {
  const r = runCmd(['git', 'status', '--porcelain'], {cwd});
  return String(r.stdout || '').split('\n').filter(Boolean).map(l => l.slice(3).trim());
}

export function adjudicationPrompt(issue, relay = DEFAULT_RELAY) {
  return [
    `你是 ${relay} 中转裁决席。资金、付款、放款、转账、退款终态、签名、私钥、助记词、钱包、五签 Safe、凭据与密钥不会送到你这里；这些之外的裁决由你直接作出。`,
    '不得声称已合并/已部署/已被平台接受——你只决定“做不做、按什么范围做”，执行结果以仓库回执为准。',
    '只能输出 JSON：{"verdict":"approve|reject|needs_more_evidence","reason":"<=200字","risks":["..."],"next_action":"<=120字"}',
    '',
    `标题：${issue.title || ''}`,
    '正文：',
    String(issue.body || '').slice(0, 4000),
  ].join('\n');
}

export function runAdjudication(issue, {relay = DEFAULT_RELAY, cwd = process.cwd(), promptFile = '.tmp-autoloop-prompt.txt'} = {}) {
  const seat = RELAY_SEATS[relay] || RELAY_SEATS[DEFAULT_RELAY];
  fs.writeFileSync(path.join(cwd, promptFile), adjudicationPrompt(issue, relay), 'utf8');
  const r = runCmd(['node', 'scripts/relay-seat.mjs', '--call', '--purpose', seat.purpose, '--profile', seat.profile, '--model', seat.model, '--requested-agent', relay, '--prompt-file', promptFile], {cwd});
  return {ok: r.status === 0, stdout: String(r.stdout || '').slice(-8000), stderr: String(r.stderr || '').slice(-2000)};
}

export async function main(argv = process.argv.slice(2), {env = process.env, cwd = process.cwd()} = {}) {
  const apply = argv.includes('--apply');
  const enabled = String(env.AUTOLOOP_ENABLED || '').toLowerCase() === 'true';
  const seat = argv.includes('--seat') ? argv[argv.indexOf('--seat') + 1] : (env.AUTOLOOP_SEAT || 'desktop-claude');
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const now = new Date().toISOString();
  const executors = loadExecutors(fs, path.join(cwd, EXECUTOR_FILE));

  if (!token) {
    console.log(JSON.stringify({schema: SCHEMA, mode: 'plan_only', reason: 'no_token', seat, claimable: [], adjudicable: [], skipped: []}, null, 2));
    return 0;
  }
  const client = githubClient({token});
  const issues = await Promise.all((await listAutoloopCandidates(client, executors)).map(i => client.withComments(i)));
  const plan = planWork({issues, seat, executors, now, leaseHours: 24});

  if (!apply || !enabled) {
    console.log(JSON.stringify({schema: SCHEMA, mode: 'plan_only', seat, enabled, ...plan}, null, 2));
    return 0;
  }

  const result = {schema: SCHEMA, mode: 'apply', seat, run_id: env.GITHUB_RUN_ID || 'local', at: now, claimed: [], done: [], escalated: [], needsGpt: [], nextActions: [], errors: []};
  const reaped = await cmdReap({client, apply: true, now, leaseHours: 24});
  result.reaped = reaped.reaped || [];

  // Reserved-topic cards are not executed here; they are handed to the GPT decision seat
  // once, tracked by the `gpt:decide` label so a daily re-run does not spam the thread.
  for (const item of plan.escalations || []) {
    try {
      const issue = issues.find(i => i.number === item.number);
      const already = labelNames(issue || {}).includes('gpt:decide');
      if (!already) {
        await client.comment(item.number, `[gpt-decision-request] topics=${item.topics.join(',')} reason=gpt_reserved_topic\n\n本卡涉及仍归 GPT 决策席的事项，自动循环不执行、不合并、不部署。请 GPT 席给出 decision_id 与允许范围后重新打标。`);
        await client.addLabels(item.number, ['gpt:decide']);
      }
      result.escalated.push(`#${item.number} ${item.task_id || ''} → GPT（${item.topics.join(',')}）`);
      result.needsGpt.push(`#${item.number} ${item.task_id || ''} 涉及 ${item.topics.join(',')}，待 GPT 裁决`);
    } catch (error) {
      result.errors.push({number: item.number, error: String(error?.message || error).slice(0, 200)});
    }
  }
  for (const item of plan.claimable) {
    try {
      await ensureSeatLabel({client, issue: issues.find(i => i.number === item.number), seat});
      await cmdClaim({client, number: item.number, seat, branch: `autoloop/${item.number}`, now, leaseHours: 24});
      result.claimed.push(item.number);
      const issueEnv = {...process.env, ...env, AUTOLOOP_ISSUE: String(item.number)};
      const outcome = executeExecutor(item.executor, {cwd, env: issueEnv});
      if (!outcome.ok) {
        const tail = String(outcome.stdout_tail || '').replace(/\s+/g, ' ').slice(-600);
        await cmdBlock({client, number: item.number, reason: 'executor_failed', evidence: `exit=${outcome.http_code} ${tail}`.trim(), need: 'gpt'});
        result.needsGpt.push(`#${item.number} ${item.task_id || ''} 执行器失败 exit=${outcome.http_code}`);
        continue;
      }
      const verify = runVerification(item.executor, {cwd, env: issueEnv});
      if (verify.ran && !verify.ok) {
        await cmdBlock({client, number: item.number, reason: 'verify_failed', evidence: `exit=${verify.code}`, need: 'gpt'});
        result.needsGpt.push(`#${item.number} ${item.task_id || ''} 执行器自检失败 exit=${verify.code}`);
        continue;
      }
      const changed = changedPaths(cwd);
      if (changed.length === 0) {
        await client.comment(item.number, `[note] seat=${seat} executor_ok=true changed_files=0 未产生改动，保持开启待人工确认`);
        result.done.push(`#${item.number} ${item.task_id || ''} 执行器通过，无文件改动`);
        continue;
      }
      const branch = `autoloop/${item.number}-${(env.GITHUB_RUN_ID || 'local')}`;
      const published = await publishChanges({token, cwd, paths: changed, branch, message: `chore(autoloop): ${item.task_id || '#' + item.number}\n\n${item.executor.id}`});
      discardChanges({cwd, paths: changed});
      let mergeState = 'not_merged';
      let deploy = {status: 'not_attempted', runs: []};
      // No path allowlist any more: the owner opened repo-internal changes on 2026-11-19.
      // But a merge needs non-empty, all-green GitHub evidence; local verify alone blocks.
      if (item.executor.auto_merge === true) {
        const checks = await waitForChecks({token, sha: published.commit});
        if (checks === 'success') {
          const merged = await gh(token, 'PUT', `pulls/${published.pr}/merge`, {merge_method: 'squash'});
          mergeState = 'merged';
          deploy = await waitForDeploy({token, sha: merged?.sha});
        } else {
          mergeState = 'not_merged_' + checks;
          result.needsGpt.push(`#${item.number} 自动合并被拒：CI 状态 ${checks}`);
          await client.comment(item.number, `[ci-blocked] commit=${published.commit} check_state=${checks} 本地自检不能替代 GitHub CI，PR 保持开启`);
        }
      }
      await cmdSubmit({client, number: item.number, commit: published.commit, pr: published.pr_url, ci: mergeState.startsWith('merged') ? 'success' : 'not_run', tests: verify.ran ? (verify.ok ? 'verify_passed' : 'verify_failed') : 'executor_ok_only', deploy: deploy.status === 'deployed' ? 'deployed' : 'not_deployed', deploy_detail: deploy.runs.map(r => r.workflow + ':' + r.status + '/' + r.conclusion)});
      const deployNote = deploy.status === 'not_attempted' ? '' : `；部署回读 ${deploy.status}${deploy.runs.length ? '(' + deploy.runs.map(r => r.workflow + ':' + r.conclusion).join(',') + ')' : ''}`;
      result.done.push(`#${item.number} ${item.task_id || ''} 改动 ${changed.length} 个文件，PR #${published.pr}（${mergeState}${deployNote}）`);
    } catch (error) {
      result.errors.push({number: item.number, error: String(error?.message || error).slice(0, 200)});
    }
  }
  for (const item of plan.adjudicable) {
    try {
      await ensureSeatLabel({client, issue: issues.find(i => i.number === item.number), seat});
      await cmdClaim({client, number: item.number, seat, branch: 'adjudication_only', now, leaseHours: 12});
      const relay = item.relay || DEFAULT_RELAY;
      const verdict = runAdjudication(issues.find(i => i.number === item.number), {relay, cwd});
      await client.comment(item.number, `[relay-decision] seat=${relay} scope=non_reserved binding=true ok=${verdict.ok}\n\n${verdict.stdout.slice(0, 4000)}`);
      result.done.push(`#${item.number} ${item.task_id || ''} ${relay} 已裁决（ok=${verdict.ok}）`);
    } catch (error) {
      result.errors.push({number: item.number, error: String(error?.message || error).slice(0, 200)});
    }
  }
  result.nextActions.push('GPT 席可按需抽查中转裁决，但不再作为放行前置条件');
  result.nextActions.push('新增 autoloop:exec 任务时先在 executors.json 登记执行器');
  const out = path.join(cwd, 'knowledge/results/autoloop');
  fs.mkdirSync(out, {recursive: true});

  // Mail is a report, never a gate: a mail outage is recorded and the loop continues.
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const mailRead = runMail(['read', '--days', '2', '--out', path.join(out, 'mail-headers.json')], {env, cwd});
  const digestInput = {
    done: result.done, needsGpt: result.needsGpt, nextActions: result.nextActions,
    mail: {read: mailRead}, run: {day, run_id: result.run_id, seat, mode: 'apply'},
  };
  const digest = buildEmailDigest(digestInput);
  const bodyFile = path.join(out, 'digest.txt');
  fs.writeFileSync(bodyFile, digest.body, 'utf8');
  let mailSend = {status: 'skipped_disabled'};
  if (String(env.AUTOLOOP_SEND_MAIL || '').toLowerCase() === 'true') {
    mailSend = runMail(['send', '--subject', digest.subject, '--body-file', bodyFile, '--to', env.AUTOLOOP_MAIL_TO || 'ltzyz2181@gmail.com'], {env, cwd});
  }
  // The email cannot contain its own delivery result, so the on-disk copy is re-rendered
  // with the real statuses; the receipt stays the authoritative record either way.
  fs.writeFileSync(bodyFile, buildEmailDigest({...digestInput, mail: {read: mailRead, send: mailSend}}).body, 'utf8');
  result.digest = {subject: digest.subject, body_file: bodyFile};
  result.mail = {read: mailRead.status, send: mailSend.status, read_detail: mailRead, send_detail: mailSend};
  fs.writeFileSync(path.join(out, `run-${result.run_id}.json`), JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(JSON.stringify(result, null, 2));
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) {
  main().then(code => { if (code) process.exitCode = code; }).catch(e => { console.error(JSON.stringify({error: String(e?.message || e)})); process.exitCode = 1; });
}
