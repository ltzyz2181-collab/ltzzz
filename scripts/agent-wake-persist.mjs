#!/usr/bin/env node
// 台账落盘器：每次尝试都从最新 origin/main 重新推导，再提交推送。
// 为什么不用 rebase：ledger.json 是 append-only 的同一个文件，并发/排队时
// rebase 必然改同一段，冲突后只能人工处理。重跑是幂等的（event_id 固定），
// 所以「reset → 重新推导 → 推送」既安全又能自愈。
import {spawnSync} from 'node:child_process';

export function buildIntakeArgs({issue, label, extra = []} = {}) {
  const args = ['scripts/agent-wake-intake.mjs'];
  if (issue) args.push('--issue', String(issue));
  else if (label) args.push('--label', String(label));
  args.push('--apply');
  return args.concat(Array.isArray(extra) ? extra : []);
}

function git(cwd, args) {
  return spawnSync('git', args, {cwd, encoding: 'utf8'});
}

export function persistIntake({
  cwd = process.cwd(),
  issue,
  label = 'wake:request',
  attempts = 5,
  extra = [],
  log = line => process.stdout.write(line + '\n')
} = {}) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    if (git(cwd, ['fetch', 'origin', 'main']).status !== 0) throw new Error('wake_fetch_failed');
    if (git(cwd, ['reset', '--hard', 'origin/main']).status !== 0) throw new Error('wake_reset_failed');

    const run = spawnSync(process.execPath, buildIntakeArgs({issue, label, extra}), {cwd, encoding: 'utf8'});
    if (run.stdout) process.stdout.write(run.stdout);
    if (run.stderr) process.stderr.write(run.stderr);
    if (run.status !== 0) throw new Error('wake_intake_failed');

    git(cwd, ['add', 'knowledge/results/agent-wake']);
    if (git(cwd, ['diff', '--cached', '--quiet']).status === 0) {
      log(`attempt ${attempt}: 台账无变化（幂等），无需推送`);
      return {ok: true, pushed: false, attempt};
    }

    const commit = git(cwd, ['commit', '-m', 'chore(agent-wake): intake']);
    if (commit.status !== 0) throw new Error('wake_commit_failed');

    const push = git(cwd, ['push', 'origin', 'HEAD:main']);
    if (push.status === 0) {
      log(`attempt ${attempt}: 已推送台账`);
      return {ok: true, pushed: true, attempt};
    }
    log(`attempt ${attempt}: push 未成功，重建后用最新 main 重试`);
  }
  throw new Error('wake_push_retry_exhausted');
}

const isMain = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('scripts/agent-wake-persist.mjs');
if (isMain) {
  const argv = process.argv.slice(2);
  const opts = {extra: []};
  let passthrough = false;
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (item === '--') { passthrough = true; continue; }
    if (passthrough) { opts.extra.push(item); continue; }
    if (item === '--issue') { opts.issue = argv[++index]; continue; }
    if (item === '--label') { opts.label = argv[++index]; continue; }
    if (item === '--attempts') { opts.attempts = Number(argv[++index]); continue; }
    opts.extra.push(item);
  }
  try {
    const result = persistIntake(opts);
    process.stdout.write(JSON.stringify(result) + '\n');
  } catch (error) {
    process.stderr.write('[agent-wake-persist] ' + (error && error.message ? error.message : 'unknown_error') + '\n');
    process.exitCode = 2;
  }
}
