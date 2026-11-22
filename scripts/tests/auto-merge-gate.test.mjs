import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  evaluateAutoMerge,
  extractTaskId,
  matchDenyPath,
  renderDecisionComment,
  GATE_VERSION,
} from '../lib/auto-merge-gate.mjs';

const OK_CHECK = {name: 'tests', status: 'completed', conclusion: 'success'};

function basePr(over = {}) {
  return {
    number: 900,
    state: 'open',
    draft: false,
    body: '### Task ID\nAUTO-MERGE-DEMO-20261121-01\n',
    mergeable: true,
    mergeable_state: 'clean',
    labels: [{name: 'dispatch'}],
    head: {sha: 'a'.repeat(40), repo: {full_name: 'ltzyz2181-collab/ltzzz'}},
    base: {ref: 'main', repo: {full_name: 'ltzyz2181-collab/ltzzz'}},
    ...over,
  };
}

const OK_FILES = [{filename: 'scripts/lib/demo.mjs'}, {filename: 'docs/demo.md'}];

test('放行：任务号、白名单路径、全部检查通过', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: OK_FILES, checkRuns: [OK_CHECK]});
  assert.equal(v.decision, 'merge');
  assert.deepEqual(v.reasons, []);
  assert.equal(v.taskId, 'AUTO-MERGE-DEMO-20261121-01');
  assert.equal(v.stats.success, 1);
});

test('拒绝：草稿', () => {
  const v = evaluateAutoMerge({pr: basePr({draft: true}), files: OK_FILES, checkRuns: [OK_CHECK]});
  assert.equal(v.decision, 'refuse');
  assert.ok(v.reasons.includes('draft'));
});

test('拒绝：目标分支不是 main', () => {
  const v = evaluateAutoMerge({pr: basePr({base: {ref: 'dev', repo: {full_name: 'ltzyz2181-collab/ltzzz'}}}), files: OK_FILES, checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.includes('base_not_main'));
});

test('拒绝：来自 fork', () => {
  const v = evaluateAutoMerge({pr: basePr({head: {sha: 'b'.repeat(40), repo: {full_name: 'someone/fork'}}}), files: OK_FILES, checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.includes('not_same_repo'));
});

test('拒绝：缺 Task ID', () => {
  const v = evaluateAutoMerge({pr: basePr({body: 'no task here'}), files: OK_FILES, checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.includes('missing_task_id'));
});

test('拒绝：资金/裁决标签', () => {
  for (const label of ['hold', 'gpt:decide', 'do-not-merge', 'hub:blocked']) {
    const v = evaluateAutoMerge({pr: basePr({labels: [{name: label}]}), files: OK_FILES, checkRuns: [OK_CHECK]});
    assert.equal(v.decision, 'refuse', label);
    assert.ok(v.reasons.includes('label:' + label));
  }
});

test('拒绝：白名单外路径', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: [{filename: 'workers/site/src/index.js'}], checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.some((r) => r.startsWith('outside_allowlist:')));
});

test('拒绝：资金与签名路径', () => {
  const paths = [
    'scripts/fulfill-market-orders.mjs',
    'scripts/preflight-signer.mjs',
    'scripts/run-treasury-aave.mjs',
    'scripts/lib/signer-readiness.mjs',
    'contracts/Ledger.sol',
    'workers/wep3/src/index.js',
    '.github/workflows/autonomous-funded-orders.yml',
    '.github/workflows/deploy-treasury.yml',
  ];
  for (const p of paths) {
    const v = evaluateAutoMerge({pr: basePr(), files: [{filename: p}], checkRuns: [OK_CHECK]});
    assert.equal(v.decision, 'refuse', p);
    assert.ok(v.reasons.some((r) => r.startsWith('deny_path:')), p);
  }
});

test('拒绝：闸门改自己', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: [{filename: '.github/workflows/auto-merge-gate.yml'}], checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.some((r) => r.includes('gate-self-modify')));
});

test('拒绝：检查还在跑', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: OK_FILES, checkRuns: [OK_CHECK, {name: 'e2e', status: 'in_progress', conclusion: null}]});
  assert.equal(v.decision, 'refuse');
  assert.ok(v.reasons.includes('checks_pending'));
  assert.equal(v.stats.pending, 1);
});

test('拒绝：任一检查失败', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: OK_FILES, checkRuns: [OK_CHECK, {name: 'e2e', status: 'completed', conclusion: 'failure'}]});
  assert.ok(v.reasons.includes('checks_failed'));
  assert.ok(v.reasons.includes('check_failed:e2e'));
});

test('拒绝：完全没有检查通过', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: OK_FILES, checkRuns: []});
  assert.ok(v.reasons.includes('no_successful_check'));
});

test('拒绝：冲突与不可合并', () => {
  const v = evaluateAutoMerge({pr: basePr({mergeable: false, mergeable_state: 'dirty'}), files: OK_FILES, checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.includes('not_mergeable'));
  assert.ok(v.reasons.includes('merge_conflict'));
});

test('拒绝：没有文件', () => {
  const v = evaluateAutoMerge({pr: basePr(), files: [], checkRuns: [OK_CHECK]});
  assert.ok(v.reasons.includes('no_files'));
});

test('extractTaskId 兼容多种写法', () => {
  assert.equal(extractTaskId('Task ID: ABC-20261121-01'), 'ABC-20261121-01');
  assert.equal(extractTaskId('### Task ID\nXYZ-1'), 'XYZ-1');
  assert.equal(extractTaskId('task id: ABC-9'), 'ABC-9');
  assert.equal(extractTaskId('task id：中文冒号-01'), null);
  assert.equal(extractTaskId('task_id=SHOULD_NOT_MATCH'), null);
  assert.equal(extractTaskId('decision_id: NOPE'), null);
});

test('matchDenyPath 命中与放行', () => {
  assert.equal(matchDenyPath('scripts/lib/wake-agenda.mjs'), null);
  assert.equal(matchDenyPath('scripts/lib/payout-guard.mjs'), 'funds-lib');
  assert.equal(matchDenyPath('docs/a.md'), null);
});

test('判定评论带可审计标记', () => {
  const body = renderDecisionComment({prNumber: 7, decision: 'merge', reasons: [], taskId: 'T-1', stats: {files: 2, checks: 3, success: 3, pending: 0, failed: 0}, merged: true, mergeSha: 'c'.repeat(40)});
  assert.ok(body.includes('已自动合并'));
  assert.ok(body.includes('<!-- auto-merge-gate:' + GATE_VERSION + ' -->'));
  assert.ok(body.includes('T-1'));
});
