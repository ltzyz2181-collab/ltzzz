import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {publishDailyCards} from '../publish-daily-cards.mjs';

const git = (cwd, args) => execFileSync('git', args, {cwd, encoding: 'utf8'}).trim();

// 队列的 workflow_dispatch 只接受「一次提交只新增卡文件」。这个测试锁住发布顺序：
// 分流单单独提交，卡单独提交，否则卡提交永远进不了队列。
test('分流单与卡分两次提交，卡提交只含两张卡，推送后按首次新增提交补派', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-cards-'));
  const origin = fs.mkdtempSync(path.join(os.tmpdir(), 'publish-cards-origin-'));
  try {
    git(origin, ['init', '--bare', '-b', 'main']);
    git(root, ['init', '-b', 'main']);
    fs.writeFileSync(path.join(root, 'README.md'), 'seed\n');
    git(root, ['add', '--', 'README.md']);
    git(root, ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-m', 'seed']);
    git(root, ['remote', 'add', 'origin', origin]);
    git(root, ['push', '-u', 'origin', 'main']);

    // 公开输入：监督总表与邮件采集（只放公开元数据，不复制正文）。
    fs.mkdirSync(path.join(root, 'knowledge/results/dispatch/oversight'), {recursive: true});
    fs.mkdirSync(path.join(root, 'knowledge/results/deep-superagent/mail-intake'), {recursive: true});
    fs.writeFileSync(path.join(root, 'knowledge/results/dispatch/oversight/latest.json'), JSON.stringify({
      backlog: {open_warning_cases: 2, unique_original_tasks: 2, not_rechecked_in_current_window: 1},
      warnings: [
        {case_id: 'case-1', task_id: 'CONTROL-1', issue: 'claim_missing', assigned_to: 'deepseek', first_observed_at: '2026-10-01T00:00:00Z', severity: 'repeated_warning'},
        {case_id: 'case-2', task_id: 'REFUND-TERMINAL-1', issue: 'review_missing', assigned_to: 'qianwen', first_observed_at: '2026-10-02T00:00:00Z', severity: 'warning'},
      ],
    }));
    fs.writeFileSync(path.join(root, 'knowledge/results/deep-superagent/mail-intake/latest.json'), JSON.stringify({
      counts: {open_or_dispatch: 3, unified: 10},
      open_items: [{ref: 'r1', channel: 'qq_fullbox', status: 'unknown', age_days: 0.2, subject_short: 'not copied', task_ids: [], has_dispatch_wording: false}],
    }));

    const result = await publishDailyCards({root, date: '2026-11-27', suffix: 1, env: {}});
    assert.equal(result.triage.totals.triaged_cases, 2);
    assert.equal(result.cards.length, 2);
    assert.equal(result.commits.brief.status, 'pushed');
    assert.equal(result.commits.card.status, 'pushed');
    assert.notEqual(result.commits.brief.commit, result.commits.card.commit);
    // 没有令牌时仍生成并推送，只是不派发。
    assert.deepEqual(result.dispatch.cards.map((row) => row.status), ['dispatch_skipped_no_token', 'dispatch_skipped_no_token']);

    const cardCommit = result.commits.card.commit;
    const cardFiles = git(root, ['show', '--pretty=format:', '--name-only', cardCommit]).split('\n').filter(Boolean);
    assert.deepEqual(cardFiles.sort(), [
      'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261127-DAILY-1.json',
      'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261127-OPS-1.json',
    ]);
    const briefFiles = git(root, ['show', '--pretty=format:', '--name-only', result.commits.brief.commit]).split('\n').filter(Boolean);
    assert.ok(briefFiles.includes('knowledge/results/deep-superagent/backlog/latest.json'));
    assert.ok(!briefFiles.some((name) => name.startsWith('ops/deep-superagent/tasks/')));

    // 两张卡都真的到了 origin/main，且卡文件没有把分流单一起带进提交。
    const remoteFiles = git(origin, ['ls-tree', '-r', '--name-only', 'main']);
    assert.match(remoteFiles, /DEEP-SUPERAGENT-20261127-DAILY-1\.json/);
    assert.match(remoteFiles, /DEEP-SUPERAGENT-20261127-OPS-1\.json/);

    // 再跑一次：文件不变则不产生新提交，卡仍可被补派（不会因 PUSHED=0 变成孤儿）。
    const again = await publishDailyCards({root, date: '2026-11-27', suffix: 1, env: {}});
    assert.equal(again.commits.brief.status, 'unchanged');
    assert.equal(again.commits.card.status, 'unchanged');

    // 同一 run 里邮件采集会留下未提交的公开证据；rebase 必须 autostash，
    // 不能把“工作区不干净”误判成并发冲突（run 46093726815）。
    fs.writeFileSync(path.join(root, 'README.md'), 'dirty intake output\n');
    const dirty = await publishDailyCards({root, date: '2026-11-28', suffix: 1, env: {}});
    assert.equal(dirty.commits.brief.status, 'pushed');
    assert.equal(dirty.commits.card.status, 'pushed');
    assert.match(git(root, ['status', '--porcelain']), /M README\.md/);
    assert.doesNotMatch(git(origin, ['show', 'main:README.md']), /dirty intake output/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
    fs.rmSync(origin, {recursive: true, force: true});
  }
});
