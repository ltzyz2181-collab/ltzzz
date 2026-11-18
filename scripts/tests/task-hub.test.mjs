import test from 'node:test';
import assert from 'node:assert/strict';
import {
  HUB_LABEL, DEFAULT_LEASE_HOURS, issueSections, taskField, issueSeat, normalizeSeat, protocolEvents,
  derive, expectedHubLabel, reapPlan, claimComment, deliveredComment, blockedComment, renderTaskBody, buildDigest,
} from '../lib/task-hub.mjs';
import {cmdClaim, cmdSync, cmdCreate, cmdReap} from '../task-hub.mjs';

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
