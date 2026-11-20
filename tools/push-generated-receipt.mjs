import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {git} from './push-receipt-commit.mjs';

// 生成型快照（task-hub 状态等）每次都是对实时状态的完整重算。
// 直接在本地提交再 rebase 会在 main 前进时冲突并 fail-closed；
// 这里改为在 origin/main 的临时 worktree 里重新生成，再提交推送。
// 不改 push-receipt-commit 的 fail-closed 语义：拿不到最新 main 就报错，绝不覆盖别人的提交。
export function pushGeneratedReceipt({cwd = process.cwd(), target, message = 'chore(receipt): refresh generated snapshot', build, attempts = 4, beforePush = () => {}} = {}) {
  if (!target) throw Error('receipt_target_required');
  if (typeof build !== 'function') throw Error('receipt_build_required');
  const run = (dir, args) => {
    const r = git(dir, args);
    if (r.status !== 0) throw Error('receipt_git_' + args[0] + '_failed');
    return r.stdout.trim();
  };
  for (let attempt = 0; attempt < attempts; attempt++) {
    run(cwd, ['fetch', 'origin', 'main']);
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-receipt-'));
    const tree = path.join(temporary, 'snapshot');
    try {
      run(cwd, ['worktree', 'add', '--detach', tree, 'origin/main']);
      const built = build(tree);
      if (built && built.status !== undefined && built.status !== 0) throw Error('receipt_build_failed');
      run(tree, ['add', '--', target]);
      if (git(tree, ['diff', '--staged', '--quiet']).status === 0) return {ok: true, changed: false, attempts: attempt + 1, commit: run(tree, ['rev-parse', 'HEAD'])};
      run(tree, ['commit', '-m', message]);
      beforePush(attempt);
      const push = git(tree, ['push', 'origin', 'HEAD:main']);
      if (push.status === 0) return {ok: true, changed: true, attempts: attempt + 1, commit: run(tree, ['rev-parse', 'HEAD'])};
      if (!/non-fast-forward|fetch first|cannot lock ref|failed to update ref/i.test(push.stderr)) throw Error('receipt_push_failed_not_a_concurrent_update');
    } finally {
      git(cwd, ['worktree', 'remove', '--force', tree]);
      fs.rmSync(temporary, {recursive: true, force: true});
    }
  }
  throw Error('receipt_concurrent_update_retry_limit');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const argv = process.argv.slice(2);
  const value = (flag) => {const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null;};
  const sep = argv.indexOf('--');
  const command = sep >= 0 ? argv.slice(sep + 1) : [];
  try {
    if (command.length === 0) throw Error('receipt_command_required');
    const result = pushGeneratedReceipt({
      target: value('--path'),
      message: value('--message') || undefined,
      build: (tree) => spawnSync(command[0], command.slice(1), {cwd: tree, encoding: 'utf8', env: process.env}),
    });
    console.log(JSON.stringify(result));
  } catch (e) {
    console.error(e.message);
    process.exitCode = 1;
  }
}
