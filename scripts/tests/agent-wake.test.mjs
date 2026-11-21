import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {
  WAKE_SCHEMA,
  WAKE_EVENT_SCHEMA,
  DEFAULT_LIMITS,
  parseWakeRequests,
  wakeDedupeKey,
  effectiveDedupeKey,
  validateSeats,
  canonicalSeat,
  spendSummary,
  decideWake,
  appendEvent,
  convergence,
  readLedger,
  serializeLedger
} from '../lib/agent-wake.mjs';

const NOW = '2026-11-20T12:00:00.000Z';
const TODAY = '2026-11-20';
const REGISTRY = ['deep', 'claude', 'qwen'];

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'agent-wake-'));
}

function request(overrides = {}) {
  return {
    topic: 'revenue',
    why: '客户催单',
    seats: ['deep'],
    budget_usd: 0.01,
    dedupe_key: '',
    ...overrides
  };
}

function wakeEvent(overrides = {}) {
  return {
    schema: WAKE_EVENT_SCHEMA,
    event_id: 'e1',
    at: '2026-11-20T01:00:00.000Z',
    action: 'wake',
    reason: 'wake',
    dedupe_key: 'other',
    topic: 'route',
    seats: ['deep'],
    budget_usd: 0.01,
    cost_usd: 0.01,
    task_id: null,
    thread_id: null,
    ...overrides
  };
}

test('parseWakeRequests parses valid lines, ignores non-wake lines and reports fixed invalid reasons', () => {
  const text = [
    '# 说明行不是请求',                                                       // 1
    '普通文本也忽略',                                                         // 2
    '[wake] topic=revenue why="客户催单" seats="deep, claude, deep" budget_usd=0.02 dedupe_key=k1', // 3
    '[wake] topic=route why=补位 seats=deep budget_usd=0.01',                  // 4
    '[wake] why=缺议题 seats=deep',                                           // 5
    '[wake] topic=topic seats=deep',                                          // 6
    '[wake] topic=topic why=why',                                             // 7
    '[wake] topic=topic why=why seats=deep budget_usd=abc',                   // 8
    '[wake] topic=topic why=why seats=deep budget_usd=0.01 unknown=ignored'   // 9
  ].join('\n');

  const {requests, invalid} = parseWakeRequests(text);

  assert.equal(requests.length, 3);
  assert.deepEqual(requests[0], {
    topic: 'revenue',
    why: '客户催单',
    seats: ['deep', 'claude'],
    budget_usd: 0.02,
    dedupe_key: 'k1'
  });
  assert.equal(requests[1].topic, 'route');
  assert.equal(requests[1].seats[0], 'deep');
  assert.equal(requests[2].topic, 'topic');
  assert.equal(requests[2].budget_usd, 0.01);
  assert.equal(Object.hasOwn(requests[2], 'unknown'), false);

  assert.deepEqual(invalid.map(item => ({line: item.line, reason: item.reason})), [
    {line: 5, reason: 'missing_topic'},
    {line: 6, reason: 'missing_why'},
    {line: 7, reason: 'missing_seats'},
    {line: 8, reason: 'invalid_budget'}
  ]);
  for (const item of invalid) {
    assert.equal(typeof item.text, 'string');
    assert.ok(item.text.startsWith('[wake]'));
  }
  assert.deepEqual(parseWakeRequests('').requests, []);
  assert.deepEqual(parseWakeRequests('no wake here').invalid, []);
});

test('wakeDedupeKey and effectiveDedupeKey prefer explicit keys', () => {
  assert.equal(
    wakeDedupeKey({task_id: 'T1', thread_id: 'th9', date: '2026-11-21'}),
    'task:T1|thread:th9|date:2026-11-21'
  );
  assert.equal(wakeDedupeKey({}), 'task:none|thread:none|date:none');

  const context = {task_id: 'T1', thread_id: 'th9', date: '2026-11-21'};
  assert.equal(effectiveDedupeKey({dedupe_key: 'explicit-key'}, context), 'explicit-key');
  assert.equal(effectiveDedupeKey({dedupe_key: '   '}, context), wakeDedupeKey(context));
  assert.equal(effectiveDedupeKey({}, context), 'task:T1|thread:th9|date:2026-11-21');
});

test('validateSeats compares case-insensitively and preserves original unknown spelling', () => {
  assert.deepEqual(validateSeats(['DEEP', 'Claude'], REGISTRY), {ok: true, unknown: []});
  assert.deepEqual(validateSeats(['deep', 'Grok', 'Kimi'], REGISTRY), {ok: false, unknown: ['Grok', 'Kimi']});
  assert.deepEqual(validateSeats([], REGISTRY), {ok: true, unknown: []});
});

test('decideWake allows a legal wake and reports pre-decision spend', () => {
  const result = decideWake({
    request: request({dedupe_key: 'legal-1'}),
    context: {date: TODAY},
    events: [wakeEvent({event_id: 'old', at: '2026-11-19T01:00:00.000Z', cost_usd: 0.02, dedupe_key: 'old'})],
    registrySeats: REGISTRY,
    now: NOW
  });

  assert.equal(result.action, 'wake');
  assert.equal(result.reason, 'wake');
  assert.equal(result.dedupe_key, 'legal-1');
  assert.equal(result.topic, 'revenue');
  assert.deepEqual(result.seats, ['deep']);
  assert.equal(result.budget_usd, 0.01);
  assert.deepEqual(result.spend, {daily_usd: 0, project_usd: 0.02, events_count: 1});
});

test('decideWake dedupes the same key within 24 hours', () => {
  const result = decideWake({
    request: request({dedupe_key: 'dup-1'}),
    events: [wakeEvent({event_id: 'd1', dedupe_key: 'dup-1', at: '2026-11-20T06:00:00.000Z'})],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(result.action, 'deduped');
  assert.equal(result.reason, 'duplicate_within_window');
});

test('decideWake blocks per-call, daily and project budget overruns', () => {
  const perCall = decideWake({
    request: request({budget_usd: 0.06}),
    events: [],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(perCall.action, 'blocked_budget');
  assert.equal(perCall.reason, 'per_call_cap_exceeded');

  const daily = decideWake({
    request: request({budget_usd: 0.20}),
    events: [wakeEvent({event_id: 'd2', cost_usd: 0.40, dedupe_key: 'x1'})],
    limits: {...DEFAULT_LIMITS, per_call_usd: 1},
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(daily.action, 'blocked_budget');
  assert.equal(daily.reason, 'daily_cap_exceeded');

  const project = decideWake({
    request: request({budget_usd: 0.20}),
    events: [wakeEvent({event_id: 'd3', at: '2026-11-18T01:00:00.000Z', cost_usd: 9.90, dedupe_key: 'x2'})],
    limits: {...DEFAULT_LIMITS, per_call_usd: 1, daily_usd: 100, project_usd: 10},
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(project.action, 'blocked_budget');
  assert.equal(project.reason, 'project_cap_exceeded');
});

test('decideWake blocks the third topic of the day before dedupe', () => {
  const events = [
    wakeEvent({event_id: 't1', dedupe_key: 'topic-1', at: '2026-11-20T01:00:00.000Z'}),
    wakeEvent({event_id: 't2', dedupe_key: 'topic-2', at: '2026-11-20T02:00:00.000Z'})
  ];
  const result = decideWake({
    request: request({dedupe_key: 'topic-1'}),
    events,
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(result.action, 'blocked_topic_limit');
  assert.equal(result.reason, 'daily_topic_cap_reached');
});

test('decideWake blocks unknown seats and invalid requests with fixed codes', () => {
  const seat = decideWake({
    request: request({seats: ['Grok']}),
    events: [],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(seat.action, 'blocked_seat');
  assert.equal(seat.reason, 'unknown_seat');

  const missingWhy = decideWake({
    request: request({why: ''}),
    events: [],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(missingWhy.action, 'blocked_request');
  assert.equal(missingWhy.reason, 'missing_why');

  const missingTopicAndSeat = decideWake({
    request: request({topic: '', seats: ['nobody']}),
    events: [],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(missingTopicAndSeat.action, 'blocked_request');
  assert.equal(missingTopicAndSeat.reason, 'missing_topic');

  const emptySeats = decideWake({
    request: request({seats: []}),
    events: [],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(emptySeats.action, 'blocked_request');
  assert.equal(emptySeats.reason, 'missing_seats');

  const badBudget = decideWake({
    request: request({budget_usd: 'abc'}),
    events: [],
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(badBudget.action, 'blocked_request');
  assert.equal(badBudget.reason, 'invalid_budget');
});

test('decideWake dedupe window boundary is exclusive at exactly 24 hours', () => {
  const limits = {...DEFAULT_LIMITS, max_topics_per_round: 10};

  const justInside = decideWake({
    request: request({dedupe_key: 'boundary'}),
    events: [wakeEvent({
      event_id: 'b1',
      dedupe_key: 'boundary',
      at: '2026-11-19T12:00:00.001Z' // 距 NOW 23:59:59.999
    })],
    limits,
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(justInside.action, 'deduped');

  const justOutside = decideWake({
    request: request({dedupe_key: 'boundary'}),
    events: [wakeEvent({
      event_id: 'b2',
      dedupe_key: 'boundary',
      at: '2026-11-19T11:59:59.999Z' // 距 NOW 24:00:00.001
    })],
    limits,
    registrySeats: REGISTRY,
    now: NOW
  });
  assert.equal(justOutside.action, 'wake');
});

test('appendEvent returns a new array, keeps old events and normalizes fields', () => {
  const original = [wakeEvent({event_id: 'old-1', at: '2026-11-20T01:00:00.000Z'})];
  const snapshot = JSON.stringify(original);

  const at = '2026-11-20T02:00:00.000Z';
  const result = appendEvent(original, {
    at,
    action: 'wake',
    reason: 'wake',
    dedupe_key: 'new-key',
    topic: 'revenue',
    seats: ['deep'],
    budget_usd: 0.01,
    cost_usd: 0.01,
    task_id: 'T1',
    thread_id: 'th1',
    ignored_field: 'must-not-land'
  });

  assert.notEqual(result.events, original);
  assert.equal(original.length, 1);
  assert.equal(JSON.stringify(original), snapshot);
  assert.equal(result.events.length, 2);
  assert.equal(result.entry.schema, WAKE_EVENT_SCHEMA);
  assert.equal(result.entry.event_id, crypto.createHash('sha256')
    .update(`new-key:${at}`, 'utf8').digest('hex').slice(0, 16));
  assert.equal(Object.hasOwn(result.entry, 'ignored_field'), false);
  assert.deepEqual(Object.keys(result.entry), [
    'schema', 'event_id', 'at', 'action', 'reason', 'dedupe_key',
    'topic', 'seats', 'budget_usd', 'cost_usd', 'task_id', 'thread_id'
  ]);
});

test('appendEvent rejects duplicate event_id and out-of-order timestamps', () => {
  const events = [wakeEvent({event_id: 'same-id', at: '2026-11-20T05:00:00.000Z'})];

  assert.throws(
    () => appendEvent(events, {event_id: 'same-id', at: '2026-11-20T06:00:00.000Z'}),
    /agent_wake_duplicate_event_id/
  );
  assert.throws(
    () => appendEvent(events, {event_id: 'older', at: '2026-11-20T04:59:59.999Z'}),
    /agent_wake_ledger_not_append_only/
  );
  assert.equal(events.length, 1);
});

test('spendSummary aggregates per day and per project while ignoring invalid rows', () => {
  const events = [
    {action: 'wake', cost_usd: 0.02, at: '2026-11-20T01:00:00.000Z'},
    {action: 'wake', cost_usd: 0.03, at: '2026-11-20T05:00:00.000Z'},
    {action: 'wake', cost_usd: 0.10, at: '2026-11-19T05:00:00.000Z'},
    {action: 'wake', cost_usd: '0.50', at: '2026-11-20T06:00:00.000Z'},
    {action: 'deduped', cost_usd: 0.99, at: '2026-11-20T07:00:00.000Z'},
    {action: 'wake', cost_usd: 0.04, at: '2026-11-20T08:00:00+08:00'}
  ];

  const summary = spendSummary(events, {date: TODAY});
  assert.ok(Math.abs(summary.daily_usd - 0.09) < 1e-9);
  assert.ok(Math.abs(summary.project_usd - 0.19) < 1e-9);
  assert.equal(summary.events_count, 4);

  assert.deepEqual(spendSummary([], {date: TODAY}), {daily_usd: 0, project_usd: 0, events_count: 0});
});

test('convergence returns agreed, split or insufficient_evidence', () => {
  assert.deepEqual(convergence({verdicts: ['agree', 'agree', 'unknown']}), {
    verdict: 'agreed',
    agrees: 2,
    disagrees: 0,
    unknown: 1,
    note: '所有有效意见一致同意。'
  });

  const split = convergence({verdicts: ['agree', 'disagree']});
  assert.equal(split.verdict, 'split');
  assert.equal(split.agrees, 1);
  assert.equal(split.disagrees, 1);
  assert.match(split.note, /合议/);

  assert.equal(convergence({verdicts: []}).verdict, 'insufficient_evidence');
  assert.equal(convergence({verdicts: ['unknown', 'other']}).verdict, 'insufficient_evidence');
  assert.equal(convergence({verdicts: ['agree', 'disagree'], rounds: DEFAULT_LIMITS.max_turns + 1}).verdict, 'insufficient_evidence');
  assert.equal(convergence({verdicts: ['agree'], rounds: DEFAULT_LIMITS.max_turns + 1}).verdict, 'agreed');
});

test('readLedger and serializeLedger round-trip and validate the schema', () => {
  const ledger = {schema: WAKE_SCHEMA, events: [wakeEvent()]};
  const text = serializeLedger(ledger);
  assert.ok(text.endsWith('\n'));
  assert.match(text, /\n  "schema"/);
  assert.deepEqual(readLedger(text), ledger);

  assert.deepEqual(readLedger(''), {schema: WAKE_SCHEMA, events: []});
  assert.deepEqual(readLedger('   \n'), {schema: WAKE_SCHEMA, events: []});
  assert.throws(() => readLedger('{not-json'), /agent_wake_ledger_invalid_json/);
  assert.throws(
    () => readLedger(JSON.stringify({schema: 'ltzzz.other.v1', events: []})),
    /agent_wake_ledger_schema_mismatch/
  );
});

test('CLI check prints valid JSON, exits 0 and does not write a ledger', () => {
  const dir = tmpDir();
  const textFile = path.join(dir, 'wake.txt');
  const ledgerFile = path.join(dir, 'ledger.json');
  fs.writeFileSync(
    textFile,
    '[wake] topic=revenue why=客户催单 seats=deep budget_usd=0.01 dedupe_key=cli-1\n',
    'utf8'
  );

  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-wake.mjs');
  const result = spawnSync(
    process.execPath,
    [cli, 'check', '--text', textFile, '--date', TODAY, '--seats', 'deep,claude', '--ledger', ledgerFile],
    {encoding: 'utf8'}
  );

  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.stderr, '');
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.schema, WAKE_SCHEMA);
  assert.equal(payload.command, 'check');
  assert.equal(payload.decisions.length, 1);
  assert.equal(payload.decisions[0].action, 'wake');
  assert.equal(payload.decisions[0].line, 1);
  assert.equal(fs.existsSync(ledgerFile), false);
});

test('CLI record appends to the injected ledger and spend reads it back', () => {
  const dir = tmpDir();
  const entryFile = path.join(dir, 'entry.json');
  const ledgerFile = path.join(dir, 'ledger.json');
  fs.writeFileSync(entryFile, JSON.stringify({
    at: '2026-11-20T03:00:00.000Z',
    action: 'wake',
    reason: 'wake',
    dedupe_key: 'cli-record-1',
    topic: 'revenue',
    seats: ['deep'],
    budget_usd: 0.02,
    cost_usd: 0.02
  }), 'utf8');

  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-wake.mjs');
  const recorded = spawnSync(
    process.execPath,
    [cli, 'record', '--entry', entryFile, '--ledger', ledgerFile],
    {encoding: 'utf8'}
  );
  assert.equal(recorded.status, 0, recorded.stderr);
  const recordPayload = JSON.parse(recorded.stdout);
  assert.equal(recordPayload.command, 'record');
  assert.equal(recordPayload.total_events, 1);
  assert.equal(typeof recordPayload.event_id, 'string');

  const spent = spawnSync(
    process.execPath,
    [cli, 'spend', '--date', TODAY, '--ledger', ledgerFile],
    {encoding: 'utf8'}
  );
  assert.equal(spent.status, 0, spent.stderr);
  const spendPayload = JSON.parse(spent.stdout);
  assert.deepEqual(spendPayload, {
    schema: WAKE_SCHEMA,
    command: 'spend',
    daily_usd: 0.02,
    project_usd: 0.02
  });
});

test('seat names resolve through the repository registry ids and hyphen aliases', () => {
  // config/seat-mail-registry.json 用下划线 id；协议里常写连字符，二者必须等价。
  const registry = ['owner', 'doubao', 'deep', 'qianwen', 'relay_gpt', 'relay_claude', 'desktop_claude'];
  assert.equal(canonicalSeat('Desktop-Claude'), 'desktop_claude');
  assert.equal(canonicalSeat('中转克劳德'), 'relay_claude');
  assert.deepEqual(validateSeats(['desktop-claude', 'relay-gpt'], registry), {ok: true, unknown: []});
  assert.deepEqual(validateSeats(['豆包', 'kimi_cn'], registry), {ok: false, unknown: ['kimi_cn']});
  assert.deepEqual(validateSeats([], registry), {ok: true, unknown: []});
});

test('CLI check defaults to the 12-seat registry, so a normal request is not blocked', () => {
  const dir = tmpDir();
  const textFile = path.join(dir, 'wake-registry.txt');
  fs.writeFileSync(
    textFile,
    '[wake] topic=registry-default why=不传 --seats 也不该全拒 seats=desktop-claude budget_usd=0.01 dedupe_key=cli-registry\n',
    'utf8'
  );
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-wake.mjs');
  const result = spawnSync(
    process.execPath,
    [cli, 'check', '--text', textFile, '--date', TODAY, '--ledger', path.join(dir, 'ledger.json')],
    {encoding: 'utf8', cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')}
  );
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.decisions[0].action, 'wake', JSON.stringify(payload.decisions[0]));
});

test('CLI check --now drives the 24h dedupe window instead of fixed midnight', () => {
  const dir = tmpDir();
  const textFile = path.join(dir, 'wake-now.txt');
  const ledgerFile = path.join(dir, 'ledger.json');
  fs.writeFileSync(textFile, '[wake] topic=t why=w seats=deep budget_usd=0.01 dedupe_key=cli-now\n', 'utf8');
  fs.writeFileSync(ledgerFile, JSON.stringify({schema: WAKE_SCHEMA, events: [{
    schema: 'ltzzz.agent-wake.event.v1',
    event_id: 'e1',
    at: TODAY + 'T00:00:00.000Z',
    action: 'wake',
    reason: 'wake',
    dedupe_key: 'cli-now',
    topic: 't',
    seats: ['deep'],
    budget_usd: 0.01,
    cost_usd: 0.01
  }]}), 'utf8');
  const cli = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'agent-wake.mjs');
  const before = spawnSync(process.execPath, [cli, 'check', '--text', textFile, '--date', TODAY, '--now', TODAY + 'T23:59:59.999Z', '--seats', 'deep', '--ledger', ledgerFile], {encoding: 'utf8'});
  assert.equal(JSON.parse(before.stdout).decisions[0].action, 'deduped');
  const nextDay = new Date(Date.parse(TODAY + 'T00:00:00.000Z') + 24 * 3600 * 1000).toISOString().slice(0, 10);
  const exact = spawnSync(process.execPath, [cli, 'check', '--text', textFile, '--date', nextDay, '--now', nextDay + 'T00:00:00.000Z', '--seats', 'deep', '--ledger', ledgerFile], {encoding: 'utf8'});
  assert.equal(JSON.parse(exact.stdout).decisions[0].action, 'wake');
});
