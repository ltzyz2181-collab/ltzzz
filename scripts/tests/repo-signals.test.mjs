// 仓库信号快照测试：只采公开元数据、窗口过滤、失败不冒充空待办、缺 token 精确阻塞。
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  REPO_SIGNALS_SCHEMA,
  buildRepoSignals,
  collectRepoSignals,
  extractTaskIds,
  redactMetadata,
} from '../collect-repo-signals.mjs';

const NOW = new Date('2026-11-23T12:00:00Z');

test('标题脱敏与 Task ID 提取', () => {
  const redacted = redactMetadata('退款 128.50 USDT token sk-ant-abcdefghijklmnopqrstuvwxyz0123', 100);
  assert.ok(!redacted.includes('128.50'));
  assert.ok(!redacted.includes('sk-ant-abcdefghijklmnopqrstuvwxyz0123'));
  assert.deepEqual(extractTaskIds('见 LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01'), [
    'LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01',
  ]);
});

test('只输出元数据：不采评论正文，窗口外失败 run 不混入', () => {
  const doc = buildRepoSignals({
    now: NOW,
    windowDays: 14,
    issues: [
      {number: 592, state: 'open', title: 'Issue 592', labels: [{name: 'dispatch'}], updated_at: '2026-11-23T00:00:00Z'},
      {number: 591, state: 'closed', title: 'closed issue', updated_at: '2026-11-23T00:00:00Z'},
      {number: 700, state: 'open', title: 'PR as issue', pull_request: {}, updated_at: '2026-11-23T00:00:00Z'},
    ],
    pulls: [{number: 800, state: 'open', title: 'PR 800', head: {ref: 'fix/x', sha: 'a'.repeat(40)}, base: {ref: 'main'}, updated_at: '2026-11-23T00:00:00Z'}],
    runs: [
      {id: 1, name: 'pages', conclusion: 'failure', created_at: '2026-11-22T00:00:00Z', html_url: 'https://example/1'},
      {id: 2, name: 'pages', conclusion: 'failure', created_at: '2026-10-01T00:00:00Z', html_url: 'https://example/2'},
      {id: 3, name: 'queue', conclusion: 'success', created_at: '2026-11-22T00:00:00Z'},
    ],
    issueComments: [{id: 10, issue_url: 'https://api.github.com/repos/o/r/issues/592', body: 'SECRET BODY', created_at: '2026-11-23T00:00:00Z'}],
    prReviewComments: [{id: 11, pull_request_url: 'https://api.github.com/repos/o/r/pulls/800', body: 'SECRET BODY', created_at: '2026-11-23T00:00:00Z'}],
    deployReceipts: [
      {receipt_id: 'DR-OK', status: 'ok', path: 'ops/deploy-receipts/DR-OK.json'},
      {receipt_id: 'DR-BAD', status: 'blocked', task_id: 'LTZZZ-MAIL-INTAKE-RECONCILIATION-20261123-01', path: 'ops/deploy-receipts/DR-BAD.json', blockers: ['x']},
    ],
  });
  assert.equal(doc.schema, REPO_SIGNALS_SCHEMA);
  assert.equal(doc.status, 'ok');
  assert.equal(doc.issues.open_count, 1);
  assert.equal(doc.pulls.open_count, 1);
  assert.equal(doc.actions.failed_count, 1, '窗口外失败 run 不得混入');
  assert.equal(doc.comments.issue_comments_recent, 1);
  assert.equal(doc.comments.pr_review_comments_recent, 1);
  assert.equal(doc.comments.bodies_collected, false);
  assert.equal(doc.deploy_receipts.unresolved_count, 1);
  assert.equal(doc.deploy_receipts.unresolved[0].receipt_id, 'DR-BAD');
  assert.equal(doc.contains_mail_body, false);
  const text = JSON.stringify(doc);
  assert.ok(!text.includes('SECRET BODY'), '评论正文不得进入快照');
});

test('缺 token 时精确标记 BLOCKED_EVIDENCE，不生成空 ok 快照', async () => {
  const doc = await collectRepoSignals({token: '', now: NOW});
  assert.equal(doc.status, 'blocked');
  assert.equal(doc.block_code, 'BLOCKED_EVIDENCE');
  assert.equal(doc.error, 'github_token_missing');
  assert.equal('issues' in doc, false);
});
