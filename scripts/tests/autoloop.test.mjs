import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadExecutors, classifyIssue, planWork, reservedTopics, buildEmailDigest,
  adjudicationPrompt, executeExecutor, runVerification, recordDeployRuns,
} from '../autoloop.mjs';

const execs = loadExecutors();

const issue = (over = {}) => ({
  number: 1, state: 'open', title: 't', body: 'task_id: TASK-X', labels: [{name: 'dispatch'}], comments: [], ...over,
});

test('executor registry rejects a command outside the allowlist', () => {
  const fake = {readFileSync: () => JSON.stringify({schema: 'ltzzz.autoloop.executors.v1', executors: [{id: 'xx1', match: {label: 'a'}, command: ['curl', 'http://x']}]})};
  assert.throws(() => loadExecutors(fake, 'virtual.json'), /executor_command_not_allowlisted/);
});

test('an issue with an executor label is claimable', () => {
  const r = classifyIssue(issue({labels: [{name: 'autoloop:exec:task-hub-status'}]}), execs);
  assert.equal(r.action, 'exec');
  assert.equal(r.executor.id, 'task-hub-status');
});

test('reserved wording escalates to the GPT seat instead of executing', () => {
  const r = classifyIssue(issue({title: '退款终判', labels: [{name: 'autoloop:exec:task-hub-status'}]}), execs);
  assert.equal(r.action, 'escalate');
  assert.equal(r.reason, 'gpt_reserved_topic');
  assert.deepEqual(r.topics, ['退款']);
});

test('an unlabelled issue is never claimed automatically', () => {
  const r = classifyIssue(issue({labels: [{name: 'seat:deep'}]}), execs);
  assert.equal(r.action, 'skip');
  assert.equal(r.reason, 'no_autoloop_label');
});

test('adjudicate label routes to the relay seat, not to an executor', () => {
  const r = classifyIssue(issue({labels: [{name: 'autoloop:adjudicate'}]}), execs);
  assert.equal(r.action, 'adjudicate');
});

test('planWork skips other seats, live leases and settled issues', () => {
  const now = '2026-11-18T10:00:00.000Z';
  const our = 'desktop-claude';
  const plan = planWork({
    seat: our, executors: execs, now, leaseHours: 24,
    issues: [
      issue({number: 1, labels: [{name: `seat:${our}`}, {name: 'autoloop:exec:task-hub-status'}]}),
      issue({number: 2, labels: [{name: 'seat:deep'}, {name: 'autoloop:exec:task-hub-status'}]}),
      issue({number: 3, labels: [{name: `seat:${our}`}, {name: 'autoloop:exec:task-hub-status'}], comments: [{body: `[claimed] seat=${our} at=${now} lease_until=2026-11-19T10:00:00.000Z`}]}),
      issue({number: 4, labels: [{name: `seat:${our}`}, {name: 'autoloop:exec:task-hub-status'}], comments: [{body: `[claimed] seat=${our} at=${now} lease_until=2026-11-19T10:00:00.000Z`}, {body: '[delivered] commit=abcdef1 pr=https://github.com/x/y/pull/1 ci=success tests=pass deploy=not_deployed smoke=n/a'}]}),
    ],
  });
  assert.deepEqual(plan.claimable.map(x => x.number), [1]);
  assert.deepEqual(plan.skipped.map(x => [x.number, x.reason]), [[2, 'other_seat'], [3, 'leased_by_someone_else'], [4, 'settled_delivered']]);
});

test('reserved topics never include production deploy, which is opened', () => {
  assert.deepEqual(reservedTopics('生产部署 worker 并回读健康检查'), []);
  assert.deepEqual(reservedTopics('清理 ops/ 下的临时文件'), []);
  assert.deepEqual(reservedTopics('自动退款并签名'), ['退款', '签名']);
});

test('digest carries the three required sections and the mail status', () => {
  const d = buildEmailDigest({
    done: ['#1 完成'], needsGpt: ['#2 需裁决'], nextActions: ['续跑'],
    mail: {read: {status: 'ok'}, send: {status: 'sent'}},
    run: {day: '2026-11-18', run_id: '1', seat: 'desktop-claude', mode: 'apply'},
  });
  assert.match(d.subject, /完成 1 \/ 待裁决 1/);
  assert.match(d.body, /## 今天做了什么/);
  assert.match(d.body, /## 需要 GPT 裁决/);
  assert.match(d.body, /## 下一步/);
  assert.match(d.body, /读 ok \/ 发 sent/);
});

test('adjudication prompt forbids claiming merge or deploy', () => {
  const p = adjudicationPrompt(issue({title: 'x'}));
  assert.match(p, /不得声称已合并\/已部署/);
  assert.match(p, /verdict/);
});

test('executeExecutor reports a failing command instead of throwing', () => {
  const r = executeExecutor({command: ['node', '-e', 'process.exit(3)']});
  assert.equal(r.ok, false);
  assert.equal(r.http_code, 3);
});


test('a disclaimer clause does not trip the human-only gate', () => {
  const r = classifyIssue(issue({
    body: 'task_id: TASK-X\n\u672c\u5361\u4e0d\u6d89\u53ca\u8d44\u91d1\u3001\u7b7e\u540d\u3001\u751f\u4ea7\u90e8\u7f72\u3001Secrets\u3002',
    labels: [{name: 'autoloop:exec:task-hub-status'}],
  }), execs);
  assert.equal(r.action, 'exec');
});

test('an un-negated fund or signing instruction escalates to GPT', () => {
  const refund = classifyIssue(issue({body: 'task_id: TASK-X\n\u81ea\u52a8\u9000\u6b3e 100 \u5143\u7ed9\u5ba2\u6237', labels: [{name: 'autoloop:exec:task-hub-status'}]}), execs);
  assert.equal(refund.action, 'escalate');
  assert.equal(refund.reason, 'gpt_reserved_topic');
  const sign = classifyIssue(issue({title: 'WEP3 \u7b7e\u540d\u6267\u884c', labels: [{name: 'autoloop:exec:task-hub-status'}]}), execs);
  assert.equal(sign.action, 'escalate');
  assert.deepEqual(sign.topics, ['\u7b7e\u540d']);
});

test('an executor without verify is not treated as verified', () => {
  const r = runVerification({id: 'x', command: ['node', '-v']});
  assert.equal(r.ran, false);
  assert.equal(r.ok, false);
});

test('executor registry rejects a verify command outside the allowlist', () => {
  const fake = {readFileSync: () => JSON.stringify({schema: 'ltzzz.autoloop.executors.v1', executors: [{id: 'xx1', match: {label: 'a'}, command: ['node', '-v'], verify: ['sh', '-c', 'x']}]})};
  assert.throws(() => loadExecutors(fake, 'virtual.json'), /executor_verify_not_allowlisted/);
});

test('planWork separates escalations from claimable work', () => {
  const plan = planWork({seat: 'desktop-claude', executors: execs, issues: [
    issue({number: 10, labels: [{name: 'autoloop:exec:task-hub-status'}]}),
    issue({number: 11, title: '\u94b1\u5305\u7b7e\u540d', labels: [{name: 'autoloop:exec:task-hub-status'}]}),
  ]});
  assert.deepEqual(plan.claimable.map(x => x.number), [10]);
  assert.deepEqual(plan.escalations.map(x => x.number), [11]);
});

test('a deploy run is read back from the merge commit, not assumed', async () => {
  const ok = await recordDeployRuns({token: 't', sha: 'abc', fetcher: async () => ({workflow_runs: [{id: 1, path: '.github/workflows/deploy-wep3.yml', name: 'deploy wep3', status: 'queued', conclusion: null, html_url: 'u'}]})});
  assert.equal(ok.status, 'deploy_queued');
  const none = await recordDeployRuns({token: 't', sha: 'abc', fetcher: async () => ({workflow_runs: [{id: 2, path: '.github/workflows/tests.yml', name: 'tests', status: 'completed', conclusion: 'success'}]})});
  assert.equal(none.status, 'no_deploy_workflow_matched');
  const failed = await recordDeployRuns({token: 't', sha: 'abc', fetcher: async () => ({workflow_runs: [{id: 3, path: '.github/workflows/deploy-x.yml', name: 'deploy x', status: 'completed', conclusion: 'failure'}]})});
  assert.equal(failed.status, 'deploy_run_failed');
});
