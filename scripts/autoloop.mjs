// Daily autoloop: claim -> bounded execute -> PR -> optional merge -> digest.
// Safety design (why this is not a free-form agent):
//   1. An issue is only claimable when a human labelled it `autoloop:exec` AND
//      `ops/autoloop/executors.json` has an executor for that label. Issue text is
//      never executed; it is untrusted input.
//   2. Merge is opt-in per executor (`auto_merge: true`) and re-checks the changed
//      paths against an allowlist. Anything else stays an open PR.
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
export const MERGE_ALLOWLIST = [/^docs\//, /^ops\//, /^knowledge\/results\//, /^scripts\/tests\//];
export const ACTIONS = Object.freeze(['exec', 'adjudicate', 'skip']);

export function loadExecutors(fsImpl = fs, file = EXECUTOR_FILE) {
  const raw = JSON.parse(fsImpl.readFileSync(file, 'utf8'));
  if (raw.schema !== 'ltzzz.autoloop.executors.v1') throw new Error('bad_executor_schema');
  if (!Array.isArray(raw.executors)) throw new Error('executors_must_be_array');
  for (const e of raw.executors) {
    if (!/^[a-z0-9-]{3,40}$/.test(e.id || '')) throw new Error('bad_executor_id');
    if (!e.match?.label || typeof e.match.label !== 'string') throw new Error('bad_executor_label');
    if (!Array.isArray(e.command) || e.command.length === 0 || e.command.some(c => typeof c !== 'string')) throw new Error('bad_executor_command');
    if (!/^(node|python3|python|bash)$/.test(e.command[0])) throw new Error('executor_command_not_allowlisted');
  }
  return raw.executors;
}

export function classifyIssue(issue, executors = []) {
  const labels = labelNames(issue);
  if (!issue || issue.pull_request) return {action: 'skip', reason: 'not_an_issue'};
  if (issue.state && issue.state !== 'open') return {action: 'skip', reason: 'not_open'};
  if (labels.some(l => /(^|:)human-only$|^no-autoloop$/.test(l)) || /(资金|退款|签名|私钥|五签|生产部署|Secrets?|凭据)/i.test(`${issue.title || ''}${issue.body || ''}`)) {
    return {action: 'skip', reason: 'human_only'};
  }
  const exec = executors.find(e => labels.includes(e.match.label));
  if (exec) return {action: 'exec', executor: exec, reason: 'labelled_exec'};
  if (labels.includes('autoloop:adjudicate')) return {action: 'adjudicate', reason: 'labelled_adjudicate'};
  return {action: 'skip', reason: 'no_autoloop_label'};
}

export function planWork({issues = [], seat, executors = [], now = new Date().toISOString(), leaseHours = 24}) {
  const claimable = [], adjudicable = [], skipped = [];
  for (const issue of issues) {
    const d = derive(issue, {now, leaseHours});
    if (d.seat && d.seat !== seat) { skipped.push({number: issue.number, reason: 'other_seat', seat: d.seat}); continue; }
    if (d.settled) { skipped.push({number: issue.number, reason: `settled_${d.settled.kind}`}); continue; }
    if (d.active && !d.expired) { skipped.push({number: issue.number, reason: 'leased_by_someone_else'}); continue; }
    const c = classifyIssue(issue, executors);
    if (c.action === 'exec') claimable.push({number: issue.number, task_id: taskField(issue.body, 'task_id'), executor: c.executor});
    else if (c.action === 'adjudicate') adjudicable.push({number: issue.number, task_id: taskField(issue.body, 'task_id')});
    else skipped.push({number: issue.number, reason: c.reason});
  }
  return {claimable, adjudicable, skipped};
}

export function pathsAllowed(paths = []) {
  return paths.length > 0 && paths.every(p => MERGE_ALLOWLIST.some(re => re.test(p)));
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
    `- 邮箱：读 ${mail?.read?.status || 'not_attempted'} / 发 ${mail?.send?.status || 'not_attempted'}`,
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
  if (!res.ok) throw new Error('autoloop_github_' + res.status);
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

// Merge requires BOTH a path allowlist and an actually successful check run. A PR with
// no checks is left open on purpose: silence is not evidence of health.
export async function waitForChecks({token, sha, attempts = 10, pauseMs = 30000}) {
  for (let i = 0; i < attempts; i++) {
    const runs = await gh(token, 'GET', 'commits/' + sha + '/check-runs');
    const list = runs.check_runs || [];
    if (list.some(r => r.conclusion === 'failure' || r.conclusion === 'timed_out')) return 'failed';
    const done = list.filter(r => r.status === 'completed');
    if (list.length > 0 && done.length === list.length && done.every(r => ['success', 'neutral', 'skipped'].includes(r.conclusion))) return 'success';
    if (i < attempts - 1) await sleep(pauseMs);
  }
  return 'none_or_pending';
}

const runCmd = (cmd, opts = {}) => spawnSync(cmd[0], cmd.slice(1), {encoding: 'utf8', timeout: opts.timeout || 600000, ...opts});

export function executeExecutor(executor, {cwd = process.cwd()} = {}) {
  const r = runCmd(executor.command, {cwd});
  return {
    ok: r.status === 0,
    http_code: r.status,
    stdout_tail: String(r.stdout || '').slice(-2000),
    stderr_tail: String(r.stderr || '').slice(-2000),
  };
}

export function changedPaths(cwd = process.cwd()) {
  const r = runCmd(['git', 'status', '--porcelain'], {cwd});
  return String(r.stdout || '').split('\n').filter(Boolean).map(l => l.slice(3).trim());
}

export function adjudicationPrompt(issue) {
  return [
    '你是受限中转裁决席：只读、只给建议，不得声称已合并/已部署/已被平台接受。',
    '只能输出 JSON：{"verdict":"approve|reject|needs_more_evidence","reason":"<=200字","risks":["..."],"next_action":"<=120字"}',
    '',
    `标题：${issue.title || ''}`,
    '正文：',
    String(issue.body || '').slice(0, 4000),
  ].join('\n');
}

export function runAdjudication(issue, {cwd = process.cwd(), promptFile = '.tmp-autoloop-prompt.txt'} = {}) {
  fs.writeFileSync(path.join(cwd, promptFile), adjudicationPrompt(issue), 'utf8');
  const r = runCmd(['node', 'scripts/relay-seat.mjs', '--call', '--prompt-file', promptFile], {cwd});
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
  const issues = await Promise.all((await client.listOpenDispatches()).map(i => client.withComments(i)));
  const plan = planWork({issues, seat, executors, now, leaseHours: 24});

  if (!apply || !enabled) {
    console.log(JSON.stringify({schema: SCHEMA, mode: 'plan_only', seat, enabled, ...plan}, null, 2));
    return 0;
  }

  const result = {schema: SCHEMA, mode: 'apply', seat, run_id: env.GITHUB_RUN_ID || 'local', at: now, claimed: [], done: [], needsGpt: [], nextActions: [], errors: []};
  const reaped = await cmdReap({client, apply: true, now, leaseHours: 24});
  result.reaped = reaped.reaped || [];
  for (const item of plan.claimable) {
    try {
      await cmdClaim({client, number: item.number, seat, branch: `autoloop/${item.number}`, now, leaseHours: 24});
      result.claimed.push(item.number);
      const outcome = executeExecutor(item.executor, {cwd});
      if (!outcome.ok) {
        await cmdBlock({client, number: item.number, reason: 'executor_failed', evidence: `exit=${outcome.http_code}`, need: 'gpt'});
        result.needsGpt.push(`#${item.number} ${item.task_id || ''} 执行器失败 exit=${outcome.http_code}`);
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
      let mergeState = 'not_merged';
      if (item.executor.auto_merge === true && pathsAllowed(changed)) {
        const checks = await waitForChecks({token, sha: published.commit});
        if (checks === 'success') {
          await gh(token, 'PUT', `pulls/${published.pr}/merge`, {merge_method: 'squash'});
          mergeState = 'merged';
        } else {
          mergeState = 'not_merged_' + checks;
          result.needsGpt.push(`#${item.number} 自动合并被拒：CI 状态 ${checks}`);
        }
      } else if (item.executor.auto_merge === true) {
        mergeState = 'not_merged_paths_outside_allowlist';
        result.needsGpt.push(`#${item.number} 改动了白名单外路径，保留 PR 待人工`);
      }
      await cmdSubmit({client, number: item.number, commit: published.commit, pr: published.pr_url, ci: mergeState === 'merged' ? 'success' : 'not_run', tests: 'executor_ok', deploy: 'not_deployed'});
      result.done.push(`#${item.number} ${item.task_id || ''} 改动 ${changed.length} 个文件，PR #${published.pr}（${mergeState}）`);
    } catch (error) {
      result.errors.push({number: item.number, error: String(error?.message || error).slice(0, 200)});
    }
  }
  for (const item of plan.adjudicable) {
    try {
      await cmdClaim({client, number: item.number, seat, branch: 'adjudication_only', now, leaseHours: 12});
      const verdict = runAdjudication(issues.find(i => i.number === item.number), {cwd});
      await client.comment(item.number, `[advisory] seat=relay verdict_is_not_approval=true ok=${verdict.ok}\n\n${verdict.stdout.slice(0, 4000)}`);
      result.needsGpt.push(`#${item.number} ${item.task_id || ''} 中转已给建议，待 GPT 复核`);
    } catch (error) {
      result.errors.push({number: item.number, error: String(error?.message || error).slice(0, 200)});
    }
  }
  result.nextActions.push('复核中转建议并把结论写回 Issue');
  result.nextActions.push('新增 autoloop:exec 任务时先在 executors.json 登记执行器');
  const out = path.join(cwd, 'knowledge/results/autoloop');
  fs.mkdirSync(out, {recursive: true});

  // Mail is a report, never a gate: a mail outage is recorded and the loop continues.
  const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
  const mailRead = runMail(['read', '--days', '2', '--out', path.join(out, 'mail-headers.json')], {env, cwd});
  const digest = buildEmailDigest({
    done: result.done, needsGpt: result.needsGpt, nextActions: result.nextActions,
    mail: {read: mailRead}, run: {day, run_id: result.run_id, seat, mode: 'apply'},
  });
  const bodyFile = path.join(out, 'digest.txt');
  fs.writeFileSync(bodyFile, digest.body, 'utf8');
  let mailSend = {status: 'skipped_disabled'};
  if (String(env.AUTOLOOP_SEND_MAIL || '').toLowerCase() === 'true') {
    mailSend = runMail(['send', '--subject', digest.subject, '--body-file', bodyFile, '--to', env.AUTOLOOP_MAIL_TO || 'ltzyz2181@gmail.com'], {env, cwd});
  }
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
