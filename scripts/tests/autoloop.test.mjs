import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadExecutors, classifyIssue, planWork, reservedTopics, buildEmailDigest,
  adjudicationPrompt, executeExecutor, runVerification, recordDeployRuns, waitForDeploy, waitForChecks,
  listAutoloopCandidates,
  githubRequest,
  changedPaths,
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
  // 2026-11-22 GPT 更正：凭据配置/轮换是普通工程，不再是保留词；Secret 值仍不得外泄。
  assert.deepEqual(reservedTopics('轮换 API 凭据与 Secrets 配置'), []);
  assert.deepEqual(reservedTopics('清理密钥文件并提交'), []);
  assert.deepEqual(reservedTopics('保护私钥与助记词'), ['私钥', '助记词']);
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

test('a finished deploy run is reported as deployed, a queued one is not', async () => {
  const done = await waitForDeploy({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: async () => ({workflow_runs: [{id: 1, path: '.github/workflows/deploy-x.yml', name: 'deploy x', status: 'completed', conclusion: 'success'}]})});
  assert.equal(done.status, 'deployed');
  const queued = await waitForDeploy({token: 't', sha: 'abc', attempts: 2, sleepFn: async () => {}, fetcher: async () => ({workflow_runs: [{id: 2, path: '.github/workflows/deploy-x.yml', name: 'deploy x', status: 'queued', conclusion: null}]})});
  assert.equal(queued.status, 'deploy_pending');
});

const checksFetcher = (checkRuns, workflowRuns = []) => async (token, method, route) => {
  if (route.includes('/check-runs')) return {check_runs: checkRuns};
  if (route.includes('actions/runs')) return {workflow_runs: workflowRuns};
  throw new Error('unexpected route ' + route);
};

test('zero check runs and zero PR workflow runs block the merge', async () => {
  const state = await waitForChecks({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: checksFetcher([], [])});
  assert.equal(state, 'none_or_pending');
});

test('a pending check run does not authorize a merge', async () => {
  const state = await waitForChecks({token: 't', sha: 'abc', attempts: 2, sleepFn: async () => {}, fetcher: checksFetcher([{status: 'in_progress', conclusion: null}])});
  assert.equal(state, 'none_or_pending');
});

test('any failed, cancelled or action_required check run blocks the merge', async () => {
  for (const conclusion of ['failure', 'cancelled', 'action_required', 'timed_out']) {
    const state = await waitForChecks({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: checksFetcher([{status: 'completed', conclusion}, {status: 'completed', conclusion: 'success'}])});
    assert.equal(state, 'failed', conclusion);
  }
});

test('all applicable check runs green is the only success path', async () => {
  const state = await waitForChecks({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: checksFetcher([{status: 'completed', conclusion: 'success'}, {status: 'completed', conclusion: 'skipped'}])});
  assert.equal(state, 'success');
});

test('zero check runs falls back to pull_request workflow runs instead of trusting silence', async () => {
  const failed = await waitForChecks({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: checksFetcher([], [{event: 'pull_request', status: 'completed', conclusion: 'failure'}])});
  assert.equal(failed, 'failed');
  const pending = await waitForChecks({token: 't', sha: 'abc', attempts: 2, sleepFn: async () => {}, fetcher: checksFetcher([], [{event: 'pull_request', status: 'in_progress', conclusion: null}])});
  assert.equal(pending, 'none_or_pending');
  const passed = await waitForChecks({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: checksFetcher([], [{event: 'pull_request', status: 'completed', conclusion: 'success'}])});
  assert.equal(passed, 'success');
  const pushOnly = await waitForChecks({token: 't', sha: 'abc', sleepFn: async () => {}, fetcher: checksFetcher([], [{event: 'push', status: 'completed', conclusion: 'success'}])});
  assert.equal(pushOnly, 'none_or_pending');
});

test('ordinary adjudication defaults to relay-gpt, claude label routes to relay-claude', () => {
  const gpt = classifyIssue(issue({labels: [{name: 'autoloop:adjudicate'}]}), execs);
  assert.equal(gpt.action, 'adjudicate');
  assert.equal(gpt.relay, 'relay-gpt');
  const claude = classifyIssue(issue({labels: [{name: 'autoloop:adjudicate:claude'}]}), execs);
  assert.equal(claude.action, 'adjudicate');
  assert.equal(claude.relay, 'relay-claude');
});

test('a reserved topic never reaches a relay seat', () => {
  const r = classifyIssue(issue({title: '\u94b1\u5305\u7b7e\u540d\u4f5c\u4e1a', labels: [{name: 'autoloop:adjudicate'}]}), execs);
  assert.equal(r.action, 'escalate');
  assert.equal(r.topics[0], '\u94b1\u5305');
});

test('planWork carries the relay seat through the plan', () => {
  const plan = planWork({seat: 'desktop-claude', executors: execs, issues: [
    issue({number: 20, labels: [{name: 'autoloop:adjudicate:claude'}]}),
  ]});
  assert.deepEqual(plan.adjudicable.map(x => [x.number, x.relay]), [[20, 'relay-claude']]);
});
test('discovery picks up autoloop-labelled cards, not only dispatch cards', async () => {
  const asked = [];
  const client = {
    api: async (route) => {
      const label = decodeURIComponent(/labels=([^&]+)/.exec(route)[1]);
      asked.push(label);
      if (label === 'autoloop:adjudicate') return {data: [{number: 7, labels: [{name: 'autoloop:adjudicate'}]}]};
      if (label === 'autoloop:exec:relay-patch') return {data: [{number: 8, labels: [{name: 'autoloop:exec:relay-patch'}]}]};
      return {data: [{number: 7, labels: []}, {number: 9, labels: [], pull_request: {}}]};
    },
  };
  const issues = await listAutoloopCandidates(client, [{match: {label: 'autoloop:exec:relay-patch'}}]);
  assert.deepEqual(issues.map((i) => i.number).sort((a, b) => a - b), [7, 8]);
  assert.ok(asked.includes('dispatch'));
  assert.ok(asked.includes('autoloop:adjudicate'));
  assert.ok(asked.includes('autoloop:exec:relay-patch'));
});

test('githubRequest retries a transient network failure', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; if (calls === 1) throw new TypeError('fetch failed'); return {ok: true, status: 200, text: async () => JSON.stringify({ok: true})}; };
  const data = await githubRequest('t', 'GET', 'x', null, {fetcher, sleepFn: async () => {}});
  assert.deepEqual(data, {ok: true});
  assert.equal(calls, 2);
});

test('githubRequest retries 503 but does not retry 400', async () => {
  let calls = 0;
  const fetcher = async () => { calls += 1; return calls === 1 ? {ok: false, status: 503, text: async () => 'busy'} : {ok: true, status: 200, text: async () => '{"ok":true}'}; };
  await githubRequest('t', 'GET', 'x', null, {fetcher, sleepFn: async () => {}});
  assert.equal(calls, 2);
  calls = 0;
  await assert.rejects(() => githubRequest('t', 'GET', 'x', null, {fetcher: async () => { calls += 1; return {ok: false, status: 400, text: async () => 'bad'}; }, sleepFn: async () => {}}), /autoloop_github_400/);
  assert.equal(calls, 1);
});

test('changedPaths excludes .tmp relay prompts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-changed-'));
  try {
    spawnSync('git', ['init'], {cwd: dir, encoding: 'utf8'});
    fs.writeFileSync(path.join(dir, 'keep.mjs'), 'x');
    fs.writeFileSync(path.join(dir, '.tmp-relay-patch-prompt.txt'), 'x');
    assert.deepEqual(changedPaths(dir), ['keep.mjs']);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
