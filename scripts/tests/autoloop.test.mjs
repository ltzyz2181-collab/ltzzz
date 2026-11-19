import test from 'node:test';
import assert from 'node:assert/strict';
import {
  loadExecutors, classifyIssue, planWork, pathsAllowed, buildEmailDigest,
  adjudicationPrompt, executeExecutor,
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

test('human-only wording wins even when the executor label is present', () => {
  const r = classifyIssue(issue({title: '退款终判', labels: [{name: 'autoloop:exec:task-hub-status'}]}), execs);
  assert.equal(r.action, 'skip');
  assert.equal(r.reason, 'human_only');
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

test('merge allowlist accepts docs and rejects product code', () => {
  assert.equal(pathsAllowed(['docs/a.md', 'ops/task-continuity/board.json']), true);
  assert.equal(pathsAllowed(['scripts/agi-econ/run-cycle.mjs']), false);
  assert.equal(pathsAllowed([]), false);
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

