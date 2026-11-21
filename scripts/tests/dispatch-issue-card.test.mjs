import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ISSUE_CARD_RE,
  IssueCardBlocked,
  assessIssue,
  buildIssueCard,
  buildIssuePrompt,
  issueCardPath,
  issueTaskId,
  parseRepoRead,
  secretRisk,
  writeIssueCard,
} from '../dispatch-issue-card.mjs';
import {checkCard, loadPolicy} from '../dispatch-seat-policy.mjs';
import {analyzeCardPrompt} from '../check-card-contract.mjs';

const issue = (patch = {}) => ({
  number: 471,
  title: '派单桥：Issue 触发的任务从未生成卡',
  body: '队列只消费卡提交。需要 Issue → 卡的真实链路。',
  state: 'open',
  html_url: 'https://github.com/ltzyz2181-collab/ltzzz/issues/471',
  labels: [{name: 'deep:task'}],
  ...patch,
});

const tmpRoot = () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-issue-card-'));
  fs.mkdirSync(path.join(root, 'config'), {recursive: true});
  fs.copyFileSync(new URL('../../config/dispatch-seat-policy-20261117.json', import.meta.url), path.join(root, 'config/dispatch-seat-policy-20261117.json'));
  return root;
};

test('issue card path follows the dispatch contract and rejects odd numbers', () => {
  assert.equal(
    issueCardPath({date: '2026-11-21', issueNumber: 471}),
    'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261121-ISSUE-471.json',
  );
  assert.equal(
    issueCardPath({date: '2026-11-21', issueNumber: 471, retry: 2}),
    'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261121-ISSUE-471-R2.json',
  );
  for (const bad of [0, -1, 1.5, '471x']) {
    assert.throws(() => issueCardPath({date: '2026-11-21', issueNumber: bad}), /invalid_issue_number/);
  }
  assert.throws(() => issueCardPath({date: '2026-11-21', issueNumber: 471, retry: 10}), /invalid_retry/);
  assert.throws(() => issueCardPath({date: '21-11-2026', issueNumber: 471}), /invalid_date/);
  assert.ok(ISSUE_CARD_RE.test(issueCardPath({date: '2026-11-21', issueNumber: 471})));
  assert.ok(ISSUE_CARD_RE.test(issueCardPath({date: '2026-11-21', issueNumber: 471, retry: 1})));
  assert.equal(ISSUE_CARD_RE.test('ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261121-ISSUE-471.json.bak'), false);
  assert.equal(ISSUE_CARD_RE.test('ops/deep-superagent/tasks/anything-else.json'), false);
});

test('built issue card passes the seat policy and the single-role contract', () => {
  const built = buildIssueCard({issue: issue(), date: '2026-11-21'});
  const policy = loadPolicy();
  assert.deepEqual(checkCard(policy, built.card), []);
  assert.equal(analyzeCardPrompt(built.card.prompt).mixed, false);
  assert.equal(built.card.task_id, issueTaskId({date: '2026-11-21', issueNumber: 471}));
  assert.equal(built.card.package_id, 'LTZZZ-DEEP-ISSUE-471-20261121');
  assert.equal(built.card.importance, 'medium');
  assert.deepEqual(built.card.seats.map((seat) => seat.seat), ['deep']);
  assert.equal(built.card.seats[0].decision_authority, false);
  assert.equal(built.card.autonomy.mode, 'auto');
  assert.equal(built.card.autonomy.code_change, true);
  assert.deepEqual(built.card.autonomy.repo_read, []);
  assert.equal(built.path, 'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261121-ISSUE-471.json');
  assert.ok(built.card.prompt.includes('#471'));
  assert.ok(built.card.prompt.indexOf('【给 deepseek 的任务】') > built.card.prompt.indexOf('【Issue 正文】'));
});

test('a plain engineering issue is not blocked by our own guard words', () => {
  const built = buildIssueCard({issue: issue({body: '修 dispatch 桥的 PUSHED=0；只改 scripts/ 和测试。'}), date: '2026-11-21'});
  assert.equal(buildIssuePrompt({number: 1, title: 't'}).includes('退款'), false);
  assert.ok(built.card.prompt.length > 0);
});

test('fiduciary and secret issues are refused before any card is written', () => {
  for (const body of ['需要改退款终态逻辑', '把私钥放进 signer 里', 'wallet 余额对不上', '0x1234567890abcdef1234567890abcdef12345678']) {
    assert.throws(
      () => buildIssueCard({issue: issue({body}), date: '2026-11-21'}),
      (error) => error instanceof IssueCardBlocked && error.code === 'blocked_fiduciary',
      body,
    );
  }
  const secret = 'ghp_' + 'a'.repeat(30);
  const assessed = assessIssue(issue({body: `顺手用这个 ${secret} 推一下`}));
  assert.equal(assessed.ok, false);
  assert.equal(assessed.status, 'blocked_secret_in_issue');
  assert.equal(assessed.family, 'github_token');
  assert.equal(secretRisk('普通文本').hit, false);
  assert.equal(JSON.stringify(assessed).includes(secret), false);
});

test('issue admission requires an open, labelled, non-pull-request issue', () => {
  assert.equal(assessIssue(issue({state: 'closed'})).status, 'issue_not_open');
  assert.equal(assessIssue(issue({labels: [{name: 'hub:new'}]})).status, 'issue_label_missing');
  assert.equal(assessIssue(issue({pull_request: {url: 'x'}})).status, 'issue_is_pull_request');
  assert.equal(assessIssue(issue({title: '   '})).status, 'issue_title_required');
  assert.equal(assessIssue(issue({labels: ['deep:task']})).ok, true);
});

test('repo_read is opt-in through an explicit html comment block', () => {
  const body = ['正文', '<!-- deep:repo_read', 'scripts/a.mjs', 'scripts/a.mjs', 'scripts/b.mjs', '-->', '尾巴'].join('\n');
  assert.deepEqual(parseRepoRead(body), ['scripts/a.mjs', 'scripts/b.mjs']);
  assert.deepEqual(parseRepoRead('没有块'), []);
  const tooMany = ['<!-- deep:repo_read', ...Array.from({length: 9}, (_, index) => `scripts/f${index}.mjs`), '-->'].join('\n');
  assert.throws(() => parseRepoRead(tooMany), /too_many_repo_read_files/);
  const built = buildIssueCard({issue: issue({body: '<!-- deep:repo_read\nscripts/dispatch-issue-card.mjs\n-->'}), date: '2026-11-21'});
  assert.deepEqual(built.card.autonomy.repo_read, ['scripts/dispatch-issue-card.mjs']);
});

test('card writing is append-only and idempotent', () => {
  const root = tmpRoot();
  const first = writeIssueCard({root, issue: issue(), date: '2026-11-21'});
  assert.equal(first.status, 'created');
  const abs = path.join(root, first.path);
  const bytes = fs.readFileSync(abs, 'utf8');
  const second = writeIssueCard({root, issue: issue(), date: '2026-11-21'});
  assert.equal(second.status, 'already_exists');
  const third = writeIssueCard({root, issue: issue({body: '换了正文'}), date: '2026-11-21'});
  assert.equal(third.status, 'already_exists_different');
  assert.equal(fs.readFileSync(abs, 'utf8'), bytes);
  assert.equal(fs.readdirSync(path.dirname(abs)).filter((name) => name.includes('ISSUE-471')).length, 1);
});

test('retry cards get their own path and never overwrite the first attempt', () => {
  const root = tmpRoot();
  const first = writeIssueCard({root, issue: issue(), date: '2026-11-21'});
  const retry = writeIssueCard({root, issue: issue({body: '第二次尝试'}), date: '2026-11-21', retry: 1});
  assert.equal(retry.status, 'created');
  assert.notEqual(retry.path, first.path);
  assert.ok(retry.path.endsWith('-ISSUE-471-R1.json'));
  assert.ok(ISSUE_CARD_RE.test(retry.path));
});
