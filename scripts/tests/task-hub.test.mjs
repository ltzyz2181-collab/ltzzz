import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUB_LABEL, DEFAULT_LEASE_HOURS, issueSections, taskField, issueSeat, normalizeSeat, protocolEvents,
  derive, expectedHubLabel, reapPlan, claimComment, deliveredComment, blockedComment, renderTaskBody, buildDigest,
} from '../lib/task-hub.mjs';
import {cmdClaim, cmdSync, cmdCreate, cmdReap, cmdReassign, cmdSubmit, cmdReopen, cmdUnblock} from '../task-hub.mjs';
import {deliveredEvidenceProblems, reopenedComment, unblockedComment, reassignPlan, reassignTarget, reassignLabels, isDeepQueued, reassignedComment, countReassignments, hasStaleEscalation, MAX_REASSIGNMENTS} from '../lib/task-hub.mjs';

const NOW = '2026-11-18T12:00:00Z';
const body = (fields = {}) => renderTaskBody({task_id: 'LTZZZ-DEMO-1', decision_id: 'GPT-X', seat: 'desktop-claude', goal: '把任务放进 Issue', scope: '只改 docs', forbidden: '不动资金', acceptance: '测试通过', evidence: '- PR', ...fields});
const issue = ({labels = ['seat:desktop-claude', 'dispatch', HUB_LABEL.new], comments = [], body: text = body(), number = 1} = {}) => ({
  number, state: 'open', title: '[TASK] LTZZZ-DEMO-1', html_url: `https://github.com/ltzyz2181-collab/ltzzz/issues/${number}`,
  created_at: '2026-11-18T00:00:00Z', labels: labels.map(name => ({name})), body: text, comments,
});

function fakeClient(initial = []) {
  const store = new Map(initial.map(item => [item.number, {...item}]));
  const calls = [];
  const client = {
    calls,
    async listOpenDispatches() { return [...store.values()].map(({comments, ...rest}) => rest); },
    async withComments(item) { return {...item, comments: store.get(item.number)?.comments || []}; },
    async api(route, options = {}) {
      calls.push([route, options.method || 'GET']);
      const match = route.match(/^issues\/(\d+)$/);
      if (match) return {status: 200, data: {...store.get(Number(match[1]))}};
      if (route === 'issues' && options.method === 'POST') {
        const created = {number: 99, html_url: 'https://github.com/x/99', ...options.body, labels: options.body.labels.map(name => ({name})), comments: []};
        store.set(99, created); return {status: 201, data: created};
      }
      if (/^labels\?/.test(route)) return {status: 200, data: [{name: 'dispatch'}, {name: 'seat:desktop-claude'}]};
      return {status: 200, data: {}};
    },
    async comment(number, text) { store.get(number).comments.push({body: text, created_at: optionsNow()}); },
    async addLabels(number, labels) { const target = store.get(number); target.labels = [...target.labels, ...labels.map(name => ({name}))]; },
    async removeLabel(number, label) { const target = store.get(number); target.labels = target.labels.filter(item => item.name !== label); },
  };
  return client;
}
let clock = NOW;
const optionsNow = () => clock;

test('issue form sections and seat aliases are parsed from the body when no seat label exists', () => {
  const text = body({seat: '桌面 Claude'});
  assert.equal(issueSections(text)['task id'], 'LTZZZ-DEMO-1');
  assert.equal(taskField(text, 'task_id'), 'LTZZZ-DEMO-1');
  assert.equal(issueSeat({labels: [], body: text}), 'desktop-claude');
  assert.equal(issueSeat({labels: [{name: 'seat:doubao'}], body: text}), 'doubao');
  assert.equal(normalizeSeat('千问'), 'qianwen');
  assert.equal(normalizeSeat('unknown-seat'), null);
});

test('comment protocol keeps spaces inside blocked reasons', () => {
  const events = protocolEvents([
    {body: '[claimed] seat=desktop-claude at=2026-11-18T00:00:00Z branch=feat/x lease_until=2026-11-19T00:00:00Z', created_at: '2026-11-18T00:00:00Z'},
    {body: '[blocked] reason=缺少 owner 的生产部署授权 evidence=not_applicable need=gpt', created_at: '2026-11-18T01:00:00Z'},
  ]);
  assert.equal(events.length, 2);
  assert.equal(events[0].fields.seat, 'desktop-claude');
  assert.equal(events[1].fields.reason, '缺少 owner 的生产部署授权');
  assert.equal(events[1].fields.need, 'gpt');
});

test('lease expiry is decided on the exact boundary with an injected clock', () => {
  const claimed = issue({comments: [{body: '[claimed] seat=desktop-claude at=2026-11-18T00:00:00Z branch=main', created_at: '2026-11-18T00:00:00Z'}]});
  const leaseUntil = new Date(Date.parse('2026-11-18T00:00:00Z') + DEFAULT_LEASE_HOURS * 3600000).toISOString();
  assert.equal(derive(claimed, {now: leaseUntil}).expired, false);
  assert.equal(derive(claimed, {now: new Date(Date.parse(leaseUntil) + 1000).toISOString()}).expired, true);
  const delivered = issue({comments: [...claimed.comments, {body: '[delivered] commit=abcdef1 pr=https://github.com/x/y/pull/1 ci=success tests=1/1 deploy=not_deployed smoke=not_applicable', created_at: '2026-11-18T02:00:00Z'}]});
  const d = derive(delivered, {now: '2026-11-25T00:00:00Z'});
  assert.equal(d.active, false);
  assert.equal(d.settled.kind, 'delivered');
  assert.equal(expectedHubLabel(delivered, {now: '2026-11-25T00:00:00Z'}), HUB_LABEL.delivered);
});

test('reaping returns an expired claim to new, then marks it stale after the attempt limit', () => {
  const claim = {body: '[claimed] seat=doubao at=2026-11-18T00:00:00Z branch=main', created_at: '2026-11-18T00:00:00Z'};
  const first = reapPlan({issues: [issue({labels: ['seat:doubao'], comments: [claim]})], now: '2026-11-20T00:00:00Z', leaseHours: 24, maxAttempts: 3});
  assert.deepEqual(first.map(row => row.action), ['return_to_new']);
  const reapedTwice = [claim, {body: '[lease-expired] task=#1 attempts=1', created_at: '2026-11-20T00:00:00Z'}, {body: '[lease-expired] task=#1 attempts=2', created_at: '2026-11-21T00:00:00Z'}];
  const third = reapPlan({issues: [issue({labels: ['seat:doubao'], comments: reapedTwice})], now: '2026-11-22T00:00:00Z', leaseHours: 24, maxAttempts: 3});
  assert.deepEqual(third.map(row => row.action), ['mark_stale']);
});

test('reap stops re-commenting once a lease was marked stale, and resumes on a new claim', () => {
  const claimA = {body: '[claimed] seat=doubao at=2026-11-18T00:00:00Z branch=main', created_at: '2026-11-18T00:00:00Z'};
  const staleReap = {body: '[lease-expired] task=#1 attempts=66 lease_until=2026-11-19T00:00:00.000Z action=mark_stale', created_at: '2026-11-21T00:00:00Z'};
  const reapedOnly = issue({labels: ['seat:doubao'], comments: [claimA, staleReap]});
  assert.deepEqual(reapPlan({issues: [reapedOnly], now: '2026-11-22T00:00:00Z', leaseHours: 24, maxAttempts: 3}).map(row => row.action), []);
  const reclaimedB = {body: '[claimed] seat=doubao at=2026-11-22T00:00:00Z branch=main', created_at: '2026-11-22T00:00:00Z'};
  const reclaimed = issue({labels: ['seat:doubao'], comments: [claimA, staleReap, reclaimedB]});
  assert.deepEqual(reapPlan({issues: [reclaimed], now: '2026-11-23T06:00:00Z', leaseHours: 24, maxAttempts: 3}).map(row => row.action), ['return_to_new']);
});

test('claim and delivery comments refuse incomplete receipts', () => {
  assert.match(claimComment({seat: 'deep', now: NOW, branch: 'feat/y', leaseHours: 2}), /^\[claimed\] seat=deep at=2026-11-18T12:00:00Z branch=feat\/y lease_until=2026-11-18T14:00:00(?:\.000)?Z$/);
  assert.throws(() => claimComment({seat: 'nobody', now: NOW}), /task_hub_unknown_seat/);
  assert.throws(() => deliveredComment({pr: 'https://x/y/pull/1'}), /task_hub_commit_sha_required/);
  assert.throws(() => deliveredComment({commit: 'abcdef1', pr: 'not-a-url'}), /task_hub_pr_url_required/);
  assert.throws(() => deliveredComment({commit: 'abcdef1', pr: 'https://x/y/pull/1', deploy: 'not_deployed', smoke: 'ok'}), /task_hub_smoke_without_deploy/);
  assert.throws(() => blockedComment({reason: '   '}), /task_hub_block_reason_required/);
});

test('a claim from another seat wins the race and is reported as lost', async () => {
  clock = NOW;
  const target = issue({comments: [{body: '[claimed] seat=gpt at=2026-11-18T11:00:00Z branch=main', created_at: '2026-11-18T11:00:00Z'}]});
  const client = fakeClient([target]);
  await assert.rejects(() => cmdClaim({client, number: 1, seat: 'desktop-claude', now: NOW}), /task_hub_already_claimed_by:gpt/);
  const stolen = issue();
  const racing = fakeClient([stolen]);
  const originalComment = racing.comment;
  racing.comment = async (number, text) => { await originalComment(number, '[claimed] seat=gpt at=2026-11-18T11:59:59Z branch=main'); };
  const result = await cmdClaim({client: racing, number: 1, seat: 'desktop-claude', now: NOW});
  assert.equal(result.status, 'claim_lost');
});

test('sync corrects stale hub labels without touching seat-labelled unrelated issues', async () => {
  clock = NOW;
  const claimed = issue({labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.new], comments: [{body: '[claimed] seat=desktop-claude at=2026-11-18T10:00:00Z branch=main', created_at: '2026-11-18T10:00:00Z'}]});
  const client = fakeClient([claimed]);
  const dry = await cmdSync({client, now: NOW});
  assert.equal(dry.changes.length, 1);
  assert.deepEqual(dry.changes[0].add, [HUB_LABEL.claimed]);
  const applied = await cmdSync({client, apply: true, now: NOW});
  assert.equal(applied.applied, true);
  const labels = (await client.api('issues/1')).data.labels.map(item => item.name);
  assert.ok(labels.includes(HUB_LABEL.claimed));
  assert.ok(!labels.includes(HUB_LABEL.new));
});

test('create refuses a duplicate task id and renders the required envelope', async () => {
  clock = NOW;
  const client = fakeClient([issue()]);
  const duplicate = await cmdCreate({client, spec: {task_id: 'LTZZZ-DEMO-1', seat: 'desktop-claude', goal: 'x'}});
  assert.equal(duplicate.status, 'duplicate_task_id');
  const fresh = fakeClient([]);
  const created = await cmdCreate({client: fresh, spec: {task_id: 'LTZZZ-DEMO-2', seat: 'deep', goal: '跑一次轮询', scope: 'scripts', forbidden: '不动资金', acceptance: '测试通过'}});
  assert.equal(created.status, 'created');
  const posted = fresh.calls.find(([route, method]) => route === 'issues' && method === 'POST');
  assert.ok(posted);
});

test('reap --apply posts one lease-expired comment per reaped task', async () => {
  clock = '2026-11-20T00:00:00Z';
  const client = fakeClient([issue({comments: [{body: '[claimed] seat=desktop-claude at=2026-11-18T00:00:00Z branch=main', created_at: '2026-11-18T00:00:00Z'}]})]);
  const result = await cmdReap({client, apply: true, now: clock, leaseHours: 24});
  assert.equal(result.reaped, 1);
  const comments = (await client.withComments({number: 1})).comments.map(item => item.body);
  assert.ok(comments.some(text => text.startsWith('[lease-expired]')));
});

test('digest orders lease-expired first and keeps the issue link as the authority', () => {
  const text = buildDigest({seat: 'desktop-claude', now: NOW, issues: [
    issue({number: 3, labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.claimed], comments: [{body: '[claimed] seat=desktop-claude at=2026-11-17T00:00:00Z branch=main', created_at: '2026-11-17T00:00:00Z'}]}),
    issue({number: 2}),
  ]});
  assert.match(text, /待领取：1/);
  assert.match(text, /租约过期：1/);
  assert.ok(text.indexOf('#3') < text.indexOf('#2'));
  assert.match(text, /以 GitHub Issue 为准/);
});

const CLAIM = {body: '[claimed] seat=desktop-claude at=2026-11-18T00:00:00Z branch=main', created_at: '2026-11-18T00:00:00Z'};
const DELIVERED_OK = {body: '[delivered] commit=abcdef1 pr=https://github.com/x/y/pull/1 ci=success tests=10/10 deploy=not_deployed smoke=not_applicable', created_at: '2026-11-18T02:00:00Z'};

test('a delivered receipt without PR or deploy evidence never becomes a terminal state', () => {
  const fakeDelivered = issue({comments: [CLAIM, {body: '[delivered] commit=d36f0c8 pr=n/a ci=success tests=ok deploy=not_deployed smoke=not_applicable', created_at: '2026-11-18T02:00:00Z'}]});
  const d = derive(fakeDelivered, {now: '2026-11-18T03:00:00Z'});
  assert.equal(d.invalid_delivered, true);
  assert.ok(d.delivered_evidence_problems.includes('pr_url_missing'));
  assert.equal(d.settled, null);
  assert.notEqual(d.state, 'delivered');
  assert.equal(expectedHubLabel(fakeDelivered, {now: '2026-11-18T03:00:00Z'}), HUB_LABEL.new);

  const deployScoped = issue({body: body({acceptance: '合并后部署到生产并给出线上 smoke 证据'}), comments: [CLAIM, DELIVERED_OK]});
  const deployProblems = derive(deployScoped, {now: '2026-11-18T03:00:00Z'}).delivered_evidence_problems;
  assert.ok(deployProblems.includes('deploy_evidence_missing'));
  assert.ok(deployProblems.includes('smoke_evidence_missing'));
  assert.notEqual(derive(deployScoped, {now: '2026-11-18T03:00:00Z'}).state, 'delivered');

  const deployed = {...DELIVERED_OK, body: '[delivered] commit=abcdef1 pr=https://github.com/x/y/pull/1 ci=success tests=10/10 deploy=deployed smoke=health=200'};
  assert.equal(derive(issue({body: body({acceptance: '合并后部署到生产'}), comments: [CLAIM, deployed]}), {now: '2026-11-18T03:00:00Z'}).state, 'delivered');
});

test('an explicit 部署要求 field overrides the scope heuristic', () => {
  const notRequired = issue({body: body({acceptance: '合并后部署说明写进文档', deploy_requirement: 'not_required'}), comments: [CLAIM, DELIVERED_OK]});
  assert.equal(derive(notRequired, {now: '2026-11-18T03:00:00Z'}).state, 'delivered');
  const required = issue({body: body({acceptance: '只改脚本', deploy_requirement: 'required'}), comments: [CLAIM, DELIVERED_OK]});
  assert.ok(derive(required, {now: '2026-11-18T03:00:00Z'}).delivered_evidence_problems.includes('deploy_evidence_missing'));
});

test('reopened and unblocked supersede historical terminal comments without deleting them', () => {
  const reopenedAfterDelivered = issue({labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.delivered], comments: [
    CLAIM, DELIVERED_OK,
    {body: reopenedComment({reason: 'fix regressed in run 44663674946', evidence: 'run:44663674946', by: 'deep'}), created_at: '2026-11-20T20:22:00Z'},
  ]});
  const d = derive(reopenedAfterDelivered, {now: '2026-11-21T00:00:00Z'});
  assert.equal(d.state, 'new');
  assert.equal(d.settled, null);
  assert.equal(d.reopened.kind, 'reopened');
  assert.equal(expectedHubLabel(reopenedAfterDelivered, {now: '2026-11-21T00:00:00Z'}), HUB_LABEL.new);
  assert.equal(reopenedAfterDelivered.comments.length, 3);

  const unblocked = issue({labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.blocked], comments: [
    CLAIM,
    {body: blockedComment({reason: '缺 owner 授权', evidence: 'n/a', need: 'gpt'}), created_at: '2026-11-18T01:00:00Z'},
    {body: unblockedComment({reason: '授权到位', evidence: 'comment:1', by: 'gpt'}), created_at: '2026-11-18T05:00:00Z'},
  ]});
  assert.equal(derive(unblocked, {now: '2026-11-18T06:00:00Z'}).state, 'new');
});

test('duplicate protocol events are idempotent and expired leases still reap after a reopen', () => {
  const duplicated = issue({comments: [CLAIM, CLAIM, DELIVERED_OK, DELIVERED_OK]});
  const d = derive(duplicated, {now: '2026-11-18T03:00:00Z'});
  assert.equal(d.state, 'delivered');
  assert.equal(d.attempts, 0);

  const reopenedThenStale = issue({comments: [CLAIM, {body: '[reopened] reason=regressed evidence=n/a by=deep', created_at: '2026-11-18T01:00:00Z'}]});
  const plan = reapPlan({issues: [reopenedThenStale], now: '2026-11-20T00:00:00Z', leaseHours: 24, maxAttempts: 3});
  assert.deepEqual(plan.map(row => row.action), []);
  const reclaimed = issue({comments: [CLAIM, {body: '[reopened] reason=regressed evidence=n/a by=deep', created_at: '2026-11-18T01:00:00Z'}, {body: '[claimed] seat=desktop-claude at=2026-11-19T00:00:00Z branch=main', created_at: '2026-11-19T00:00:00Z'}]});
  assert.deepEqual(reapPlan({issues: [reclaimed], now: '2026-11-21T00:00:00Z', leaseHours: 24, maxAttempts: 3}).map(row => row.action), ['return_to_new']);
});

test('submit refuses an incomplete receipt before writing any comment', async () => {
  clock = NOW;
  const deployScoped = issue({body: body({acceptance: '合并后部署到生产'})});
  const client = fakeClient([deployScoped]);
  await assert.rejects(
    () => cmdSubmit({client, number: 1, commit: 'abcdef1', pr: 'https://github.com/x/y/pull/1', ci: 'success', tests: '10/10', now: NOW}),
    /task_hub_delivered_evidence_incomplete:.*deploy_evidence_missing/,
  );
  assert.equal((await client.withComments({number: 1})).comments.length, 0);

  await assert.rejects(
    () => cmdSubmit({client, number: 1, commit: 'abcdef1', pr: 'n/a', ci: 'success', tests: '10/10', deploy: 'deployed', smoke: 'ok', now: NOW}),
    /task_hub_pr_url_required/,
  );

  const ok = await cmdSubmit({client, number: 1, commit: 'abcdef1', pr: 'https://github.com/x/y/pull/1', ci: 'success', tests: '10/10', deploy: 'deployed', smoke: 'health=200', now: NOW});
  assert.equal(ok.status, 'delivered');
  const labels = (await client.api('issues/1')).data.labels.map(item => item.name);
  assert.ok(labels.includes(HUB_LABEL.delivered));
});

test('reopen and unblock post append-only events and clear terminal labels', async () => {
  clock = NOW;
  const client = fakeClient([issue({labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.delivered]})]);
  const reopened = await cmdReopen({client, number: 1, reason: 'ship regressed', evidence: 'run:1', by: 'deep', now: NOW});
  assert.equal(reopened.status, 'new');
  const afterReopen = await client.withComments({number: 1});
  assert.ok(afterReopen.comments.some(item => item.body.startsWith('[reopened]')));
  const labels = (await client.api('issues/1')).data.labels.map(item => item.name);
  assert.ok(!labels.includes(HUB_LABEL.delivered));
  assert.ok(labels.includes(HUB_LABEL.new));

  const client2 = fakeClient([issue({labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.blocked]})]);
  await cmdUnblock({client: client2, number: 1, reason: 'authorisation arrived', evidence: 'comment:1', by: 'gpt', now: NOW});
  assert.ok((await client2.withComments({number: 1})).comments.some(item => item.body.startsWith('[unblocked]')));
});

test('sync demotes a stale hub:delivered label when the receipt is invalid', async () => {
  clock = NOW;
  const staleDelivered = issue({labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.delivered], comments: [
    CLAIM, {body: '[delivered] commit=d36f0c8 pr=n/a ci=success tests=ok deploy=not_deployed smoke=not_applicable', created_at: '2026-11-18T02:00:00Z'},
  ]});
  const client = fakeClient([staleDelivered]);
  const dry = await cmdSync({client, now: '2026-11-18T03:00:00Z'});
  const change = dry.changes.find(item => item.action === 'set_state');
  assert.ok(change);
  assert.deepEqual(change.add, [HUB_LABEL.new]);
  assert.deepEqual(change.remove, [HUB_LABEL.delivered]);
});

test('delivered evidence helper reports every missing family at once', () => {
  const problems = deliveredEvidenceProblems(issue({body: body({acceptance: '部署'})}), {fields: {}});
  assert.deepEqual(problems, ['commit_sha_missing', 'pr_url_missing', 'ci_result_missing', 'test_result_missing', 'deploy_evidence_missing', 'smoke_evidence_missing']);
});

test('a deployment requirement may carry a trailing note', () => {
  const noted = issue({body: body({acceptance: '合并后部署说明写进文档', deploy_requirement: 'not_required（P1 只入库，不启用定时）'}), comments: [CLAIM, DELIVERED_OK]});
  assert.equal(derive(noted, {now: '2026-11-18T03:00:00Z'}).state, 'delivered');
  const stillRequired = issue({body: body({acceptance: '只改脚本', deploy_requirement: 'required（上线后验证）'}), comments: [CLAIM, DELIVERED_OK]});
  assert.ok(derive(stillRequired, {now: '2026-11-18T03:00:00Z'}).delivered_evidence_problems.includes('deploy_evidence_missing'));
});

test('chinese deployment requirement keeps word-edge semantics', () => {
  const bare = issue({body: body({acceptance: '合并后部署说明写进文档', deploy_requirement: '不需要'}), comments: [CLAIM, DELIVERED_OK]});
  assert.equal(derive(bare, {now: '2026-11-18T03:00:00Z'}).state, 'delivered');
  const notedCn = issue({body: body({acceptance: '合并后部署说明写进文档', deploy_requirement: '不需要（P1 只入库）'}), comments: [CLAIM, DELIVERED_OK]});
  assert.equal(derive(notedCn, {now: '2026-11-18T03:00:00Z'}).state, 'delivered');
  const needCn = issue({body: body({acceptance: '只改脚本', deploy_requirement: '需要（上线后验证）'}), comments: [CLAIM, DELIVERED_OK]});
  assert.ok(derive(needCn, {now: '2026-11-18T03:00:00Z'}).delivered_evidence_problems.includes('deploy_evidence_missing'));
  const ambiguous = issue({body: body({acceptance: '只改脚本', deploy_requirement: '是否需要待定'}), comments: [CLAIM, DELIVERED_OK]});
  assert.equal(derive(ambiguous, {now: '2026-11-18T03:00:00Z'}).state, 'delivered');
});

test('a card nobody claimed for 24h is planned for reassignment', () => {
  const stale = issue({number: 7});
  stale.created_at = '2026-11-17T00:00:00Z';
  const fresh = issue({number: 8});
  fresh.created_at = '2026-11-18T11:00:00Z';
  const plan = reassignPlan([stale, fresh], {now: NOW});
  assert.deepEqual(plan.map(item => item.number), [7]);
  assert.equal(plan[0].seat, 'desktop-claude');
  assert.equal(plan[0].to, 'deep');
});

test('a claimed or delivered card is never reassigned', () => {
  const claimed = issue({number: 9, comments: [{body: claimComment({seat: 'desktop-claude', at: '2026-11-17T01:00:00Z', leaseHours: 24})}]});
  claimed.created_at = '2026-11-10T00:00:00Z';
  const delivered = issue({number: 10, comments: [
    {body: '[claimed] seat=desktop-claude at=2026-11-17T01:00:00Z lease_until=2026-11-18T01:00:00Z'},
    {body: '[delivered] commit=abcdef1234567 pr=https://github.com/x/y/pull/1 ci=success tests=pass deploy=not_required smoke=none'}
  ]});
  delivered.created_at = '2026-11-10T00:00:00Z';
  assert.deepEqual(reassignPlan([claimed, delivered], {now: NOW}), []);
});

test('reassigning to deep also queues the Deep bridge label', () => {
  assert.deepEqual(reassignLabels('deep'), ['seat:deep', 'deep:task']);
  assert.deepEqual(reassignLabels('desktop-claude'), ['seat:desktop-claude']);
  assert.deepEqual(reassignLabels('relay-gpt'), ['seat:relay-gpt']);
});

test('a deep:task card belongs to the async deep queue and is never reassigned', () => {
  const queued = issue({number: 21, labels: ['seat:deep', 'dispatch', HUB_LABEL.new, 'deep:task']});
  queued.created_at = '2026-11-10T00:00:00Z';
  assert.equal(isDeepQueued(queued), true);
  assert.deepEqual(reassignPlan([queued], {now: NOW}), []);
  const unqueued = issue({number: 22, labels: ['seat:deep', 'dispatch', HUB_LABEL.new]});
  unqueued.created_at = '2026-11-10T00:00:00Z';
  assert.deepEqual(reassignPlan([unqueued], {now: NOW}).map(item => item.number), [22]);
  // #472/#474/#475 的实际情况：手工补 deep:task 后 seat 标签仍是 desktop-claude。
  const handQueued = issue({number: 24, labels: ['seat:desktop-claude', 'dispatch', HUB_LABEL.new, HUB_LABEL.stale, 'deep:task']});
  handQueued.created_at = '2026-11-10T00:00:00Z';
  assert.equal(isDeepQueued(handQueued), true);
  assert.deepEqual(reassignPlan([handQueued], {now: NOW}), []);
});

test('cmdReassign adds deep:task when the target seat is deep', async () => {
  const stale = issue({number: 23});
  stale.created_at = '2026-11-16T00:00:00Z';
  const client = fakeClient([stale]);
  await cmdReassign({client, apply: true, now: NOW});
  const after = await client.api('issues/23');
  const labels = after.data.labels.map(item => item.name);
  assert.ok(labels.includes('seat:deep'));
  assert.ok(labels.includes('deep:task'));
});

test('reassignTarget never returns the same seat and falls back when the chain loops', () => {
  assert.equal(reassignTarget('deep'), 'desktop-claude');
  assert.equal(reassignTarget('workbuddy'), 'deep');
  assert.equal(reassignTarget('unknown-seat', {fallbackSeats: ['deep']}), 'deep');
  assert.equal(reassignTarget('deep', {fallbackSeats: ['deep']}), 'desktop-claude');
});

test('cmdReassign moves the seat label, comments and queues one mail card', async () => {
  const stale = issue({number: 11});
  stale.created_at = '2026-11-16T00:00:00Z';
  const client = fakeClient([stale]);
  const result = await cmdReassign({client, apply: true, now: NOW, mailTo: 'owner@example.com'});
  assert.equal(result.reassigned, 1);
  const target = client.calls.filter(([route, method]) => route === 'issues' && method === 'POST');
  assert.equal(target.length, 1, '每张改派卡只发一封邮件卡');
  const comment = (client.calls || []).length;
  assert.ok(comment > 0);
  assert.match(reassignedComment({number: 11, from: 'desktop-claude', to: 'deep', ageHours: 60}), /reason=no_claim_60h/);
});

test('cmdReassign routes the wake mail by target seat and adds a dedupe key', async () => {
  const stale = issue({number: 21});
  stale.created_at = '2026-11-16T00:00:00Z';
  const client = fakeClient([stale]);
  const registry = {seats: [{id: 'deep', address: 'qingqizhu6502@agent.qq.com', kind: 'agent_mail', transport: 'agently_cli'}]};
  await cmdReassign({client, apply: true, now: NOW, registry});
  const card = (await client.api('issues/99')).data;
  assert.match(card.body, /to: 306122054@qq\.com/);
  assert.match(card.body, /subject: \[seat:deep\] \[LTZZZ\] #21/);
  assert.match(card.body, /dedupe_key: task-hub-reassign-21-deep/);
  assert.match(card.body, /delivery: shared_mailbox_fallback/);
});

test('a card already reassigned twice escalates instead of ping-ponging', () => {
  const card = issue({number: 12, comments: [
    {body: '[reassigned] from=deep to=desktop-claude age_hours=30 reason=no_claim_30h by=task-hub issue=12'},
    {body: '[reassigned] from=desktop-claude to=deep age_hours=28 reason=no_claim_28h by=task-hub issue=12'}
  ]});
  card.created_at = '2026-11-10T00:00:00Z';
  const plan = reassignPlan([card], {now: NOW});
  assert.equal(plan.length, 1);
  assert.equal(plan[0].action, 'escalate_stale');
  assert.equal(plan[0].to, null);
  assert.equal(countReassignments(card), MAX_REASSIGNMENTS);
});

test('a card already escalated stale is not escalated again on the next 15-minute cycle', () => {
  const card = issue({number: 15, comments: [
    {body: '[reassigned] from=deep to=desktop-claude age_hours=30 reason=no_claim_30h by=task-hub issue=15'},
    {body: '[reassigned] from=desktop-claude to=deep age_hours=28 reason=no_claim_28h by=task-hub issue=15'},
    {body: '[stale] reason=no_claim_after_2_reassign from=deep age_hours=100 by=task-hub'}
  ]});
  card.created_at = '2026-11-10T00:00:00Z';
  assert.equal(hasStaleEscalation(card), true);
  assert.deepEqual(reassignPlan([card], {now: NOW}), [], 'stale already escalated: no repeat comment and no repeat mail');
});

test('a new reassignment after the stale escalation re-arms exactly one fresh escalation', () => {
  const card = issue({number: 16, comments: [
    {body: '[reassigned] from=deep to=desktop-claude age_hours=30 reason=no_claim_30h by=task-hub issue=16'},
    {body: '[reassigned] from=desktop-claude to=deep age_hours=28 reason=no_claim_28h by=task-hub issue=16'},
    {body: '[stale] reason=no_claim_after_2_reassign from=deep age_hours=100 by=task-hub'},
    {body: '[reassigned] from=deep to=desktop-claude age_hours=101 reason=owner_manual_retry by=owner issue=16'}
  ]});
  card.created_at = '2026-11-10T00:00:00Z';
  assert.equal(hasStaleEscalation(card), false);
  assert.equal(reassignPlan([card], {now: NOW})[0].action, 'escalate_stale');
  card.comments.push({body: '[stale] reason=no_claim_after_3_reassign from=desktop-claude age_hours=120 by=task-hub'});
  assert.deepEqual(reassignPlan([card], {now: NOW}), []);
});

test('cmdReassign posts the stale escalation comment once, not on every cycle', async () => {
  const card = issue({number: 17, comments: [
    {body: '[reassigned] from=deep to=desktop-claude age_hours=30 reason=no_claim_30h by=task-hub issue=17'},
    {body: '[reassigned] from=desktop-claude to=deep age_hours=28 reason=no_claim_28h by=task-hub issue=17'}
  ]});
  card.created_at = '2026-11-10T00:00:00Z';
  const client = fakeClient([card]);
  await cmdReassign({client, apply: true, now: NOW});
  const first = await client.withComments((await client.api('issues/17')).data);
  assert.equal(first.comments.filter(item => item.body.startsWith('[stale]')).length, 1);
  await cmdReassign({client, apply: true, now: '2026-11-18T12:15:00Z'});
  const second = await client.withComments((await client.api('issues/17')).data);
  assert.equal(second.comments.filter(item => item.body.startsWith('[stale]')).length, 1, 'second cycle must not add another notification comment');
});

test('one reassignment still allows a second swap', () => {
  const card = issue({number: 13, comments: [
    {body: '[reassigned] from=deep to=desktop-claude age_hours=30 reason=no_claim_30h by=task-hub issue=13'}
  ]});
  card.created_at = '2026-11-10T00:00:00Z';
  const plan = reassignPlan([card], {now: NOW});
  assert.equal(plan[0].action, 'reassign');
  assert.equal(plan[0].to, 'deep');
});

test('cmdReassign marks a stuck card stale without moving the seat', async () => {
  const card = issue({number: 14, comments: [
    {body: '[reassigned] from=deep to=desktop-claude age_hours=30 reason=no_claim_30h by=task-hub issue=14'},
    {body: '[reassigned] from=desktop-claude to=deep age_hours=28 reason=no_claim_28h by=task-hub issue=14'}
  ]});
  card.created_at = '2026-11-10T00:00:00Z';
  const client = fakeClient([card]);
  const result = await cmdReassign({client, apply: true, now: NOW, mailTo: 'owner@example.com'});
  assert.equal(result.reassigned, 1);
  const created = client.calls.filter(([route, method]) => route === 'issues' && method === 'POST');
  assert.equal(created.length, 0, '升级为 stale 时不再发邮件卡');
});
