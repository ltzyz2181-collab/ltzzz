import test from 'node:test';
import assert from 'node:assert/strict';
import {
  collectWakeSources,
  planIntake,
  formatIntakeComment,
  registrySeatsFrom
} from '../lib/wake-intake.mjs';

const REGISTRY = ['doubao', 'qianwen', 'desktop_claude', 'relay_gpt'];
const NOW = '2026-11-21T04:00:00.000Z';

function line(topic = 't1', extra = '') {
  return `[wake] topic=${topic} why=需要讨论 seats=doubao,qianwen budget_usd=0.02 ${extra}`.trim();
}

test('collectWakeSources puts the body first and orders comments by created_at', () => {
  const sources = collectWakeSources({
    repo: 'o/r',
    issue: 7,
    body: 'body text',
    comments: [
      {id: 2, created_at: '2026-11-21T03:00:00Z', body: 'second'},
      {id: 1, created_at: '2026-11-21T02:00:00Z', body: 'first'},
      {id: 3, created_at: null, body: '  '}
    ]
  });
  assert.deepEqual(sources.map(s => s.ref), ['body', 'c:1', 'c:2']);
  assert.equal(sources[0].text, 'body text');
});

test('a well formed line becomes a wake event with zero cost', () => {
  const sources = collectWakeSources({repo: 'o/r', issue: 1, body: line('议题A')});
  const plan = planIntake({sources, registrySeats: REGISTRY, now: NOW});
  assert.equal(plan.added, 1);
  assert.equal(plan.decisions[0].action, 'wake');
  assert.equal(plan.decisions[0].reason, 'wake');
  assert.equal(plan.decisions[0].budget_usd, 0.02);
  assert.equal(plan.events[0].action, 'wake');
  assert.equal(plan.events[0].cost_usd, 0, '准入本身不花钱');
  assert.equal(plan.events[0].dedupe_key, 'task:issue-1|thread:body|date:2026-11-21');
});

test('replaying the same issue only records once', () => {
  const sources = collectWakeSources({repo: 'o/r', issue: 1, body: line('议题A')});
  const first = planIntake({sources, registrySeats: REGISTRY, now: NOW});
  const second = planIntake({sources, registrySeats: REGISTRY, now: NOW, ledgerEvents: first.events});
  assert.equal(second.added, 0);
  assert.equal(second.decisions[0].action, 'already_recorded');
  assert.equal(second.events.length, 1);
});

test('unknown seats and overspending budgets are refused with reason codes', () => {
  const unknown = planIntake({
    sources: collectWakeSources({repo: 'o/r', issue: 2, body: line('x', 'seats=ghost')}),
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(unknown.decisions[0].action, 'blocked_seat');
  assert.equal(unknown.decisions[0].reason, 'unknown_seat');

  const overspend = planIntake({
    sources: collectWakeSources({repo: 'o/r', issue: 3, body: '[wake] topic=x why=y seats=doubao budget_usd=0.9'}),
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(overspend.decisions[0].action, 'blocked_budget');
});

test('extra lines from one source are deduped by the default task+thread+date key', () => {
  const sources = collectWakeSources({
    repo: 'o/r',
    issue: 4,
    body: [line('a'), line('b'), line('c')].join('\n')
  });
  const plan = planIntake({sources, registrySeats: REGISTRY, now: NOW});
  assert.deepEqual(plan.decisions.map(d => d.action), ['wake', 'deduped', 'deduped']);
});

test('a third distinct source on the same day hits the daily topic cap', () => {
  const sources = [4, 5, 6].flatMap(issue =>
    collectWakeSources({repo: 'o/r', issue, body: line('topic-' + issue)})
  );
  const plan = planIntake({sources, registrySeats: REGISTRY, now: NOW});
  assert.deepEqual(plan.decisions.map(d => d.action), ['wake', 'wake', 'blocked_topic_limit']);
  assert.equal(plan.decisions[2].reason, 'daily_topic_cap_reached');
});

test('an incomplete line is recorded as blocked_request instead of being dropped', () => {
  const plan = planIntake({
    sources: collectWakeSources({repo: 'o/r', issue: 5, body: '[wake] topic= why=x seats=doubao'}),
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(plan.decisions[0].action, 'blocked_request');
  assert.equal(plan.decisions[0].reason, 'missing_topic');
  assert.equal(plan.events.length, 1);
});

test('appending stays monotonic when the ledger already holds a future timestamp', () => {
  const future = [{schema: 'ltzzz.agent-wake.event.v1', event_id: 'f'.repeat(16), at: '2027-01-01T00:00:00.000Z', action: 'wake', cost_usd: 0}];
  const plan = planIntake({
    sources: collectWakeSources({repo: 'o/r', issue: 6, body: line('z')}),
    registrySeats: REGISTRY,
    now: NOW,
    ledgerEvents: future
  });
  assert.equal(plan.added, 1);
  assert.ok(Date.parse(plan.events[1].at) > Date.parse(future[0].at));
});

test('the intake comment lists verdicts and escapes table pipes', () => {
  const text = formatIntakeComment({
    issue: 12,
    date: '2026-11-21',
    decisions: [
      {line: 3, action: 'blocked_seat', reason: 'unknown_seat', topic: 'a|b', seats: ['ghost'], budget_usd: 0.02},
      {line: 4, action: 'already_recorded', reason: 'event_id_present'}
    ]
  });
  assert.match(text, /\[wake-intake\]/);
  assert.match(text, /unknown_seat/);
  assert.match(text, /a\\\|b/);
  assert.doesNotMatch(text, /already_recorded/, '被跳过的行不进评论');
  assert.doesNotMatch(text, /password|smtp/i);
});

test('the intake comment carries a hidden event marker for replay detection', () => {
  const text = formatIntakeComment({
    issue: 12,
    date: '2026-11-21',
    decisions: [
      {line: 3, action: 'wake', reason: 'wake', topic: 'a', seats: ['doubao'], budget_usd: 0.01, event_id: 'abc123'},
      {line: 4, action: 'already_recorded', reason: 'event_id_present', event_id: 'skipme'}
    ],
    eventIds: ['abc123']
  });
  assert.match(text, /<!-- wake-intake:abc123 -->/);
  assert.doesNotMatch(text, /skipme/, '被跳过的行不进标记');
});

test('registrySeatsFrom accepts id, name and seat keys', () => {
  assert.deepEqual(
    registrySeatsFrom({seats: [{id: 'a'}, {name: 'b'}, {seat: 'c'}, {}]}),
    ['a', 'b', 'c']
  );
});
