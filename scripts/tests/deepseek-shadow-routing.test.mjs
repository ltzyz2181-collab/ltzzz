import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ROUTES,
  REF_PATTERNS,
  PLANNER_SEATS,
  parsePlannerOutput,
  PROMPT_MODES,
  WORKER_OVERRIDE,
  buildPrompt,
  ASK_TARGETS,
  extractRefs,
  parseRouteOutput,
  evaluateShadow,
  newestDailyCard,
  runShadow,
} from '../deepseek-shadow-routing.mjs';

const REFS = ['8d9a5f45ab685bbb', '5556bddb2622ff00', 'adad792d0ef16422'];
const REF_A = REFS[0];
const REF_B = REFS[1];
const REF_C = REFS[2];

const PROMPT = [
  'GROUP C:',
  '- ' + REF_A + ' age=0d status=unknown :: one',
  '- ' + REF_B + ' age=0d status=unknown :: two',
  '- ' + REF_A + ' age=0d status=unknown :: duplicate listing',
  '- not-a-real-ref age=0d status=unknown :: malformed',
  '- ' + REF_C + ' age=0d status=unknown :: three',
].join('\n');

const GOOD = [
  'ROUTE | ' + REF_A + ' | coordinator_close_with_receipt | receipt already recorded',
  'ROUTE | ' + REF_B + ' | needs_gpt_decision | mail policy conflict open',
  'ASK | ' + REF_B + ' | gpt | confirm which mail wording governs',
  'ROUTE | ' + REF_C + ' | blocked_evidence_needed | refund callback not received',
  'ASK | ' + REF_C + ' | evidence | official refund callback and certificate',
].join('\n');

const ALL_FIVE = [
  'ROUTE | ' + REF_A + ' | coordinator_close_with_receipt | done',
  'ROUTE | ' + REF_B + ' | needs_gpt_decision | needs ruling',
  'ROUTE | ' + REF_C + ' | needs_owner_decision | needs owner value',
  'ROUTE | 1111111111111111 | blocked_evidence_needed | waiting',
  'ROUTE | 2222222222222222 | deploy_confirm_only | confirm only',
].join('\n');
const FIVE_REFS = [REF_A, REF_B, REF_C, '1111111111111111', '2222222222222222'];

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-shadow-'));
}

function writeCard(dir, name, body) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(body, null, 2) + '\n', 'utf8');
  return file;
}

test('route vocabulary is the five documented routes', () => {
  assert.deepEqual([...ROUTES], [
    'coordinator_close_with_receipt',
    'needs_gpt_decision',
    'needs_owner_decision',
    'blocked_evidence_needed',
    'deploy_confirm_only',
  ]);
  assert.deepEqual([...ASK_TARGETS], ['gpt', 'owner', 'evidence']);
});

test('extractRefs keeps order, dedupes, and ignores non-list lines', () => {
  assert.deepEqual(extractRefs(PROMPT), REFS);
  assert.deepEqual(extractRefs('- deadbeefdeadbeef age=1d'), ['deadbeefdeadbeef']);
  assert.deepEqual(extractRefs('task - deadbeefdeadbeef age=1d'), []);
  assert.deepEqual(extractRefs(''), []);
  assert.deepEqual(extractRefs(undefined), []);
});

test('parseRouteOutput accepts a clean four-line-per-ref answer', () => {
  const parsed = parseRouteOutput(GOOD, REFS);
  assert.equal(parsed.route_lines, 3);
  assert.equal(parsed.covered_refs, 3);
  assert.deepEqual(parsed.missing_refs, []);
  assert.deepEqual(parsed.duplicate_refs, []);
  assert.deepEqual(parsed.invalid_lines, []);
  assert.deepEqual(parsed.extra_lines, []);
  assert.deepEqual(parsed.distinct_routes, ['coordinator_close_with_receipt', 'needs_gpt_decision', 'blocked_evidence_needed']);
  assert.equal(parsed.ask_expected, 2);
  assert.equal(parsed.route_vocabulary_complete, true);
  assert.equal(parsed.output_nonempty, true);
});

test('parseRouteOutput reports missing refs', () => {
  const text = GOOD.split('\n').filter(line => !line.includes(REF_C)).join('\n');
  const parsed = parseRouteOutput(text, REFS);
  assert.deepEqual(parsed.missing_refs, [REF_C]);
  assert.equal(parsed.covered_refs, 2);
});

test('parseRouteOutput reports duplicate refs', () => {
  const text = GOOD + '\nROUTE | ' + REF_A + ' | deploy_confirm_only | second opinion';
  const parsed = parseRouteOutput(text, REFS);
  assert.deepEqual(parsed.duplicate_refs, [REF_A]);
  assert.equal(parsed.route_lines, 4);
});

test('parseRouteOutput rejects unknown refs, invalid routes, empty reasons and bad arity', () => {
  const text = [
    'ROUTE | ' + REF_A + ' | coord_ok | fine',
    'ROUTE | 3333333333333333 | coordinator_close_with_receipt | foreign ref',
    'ROUTE | ' + REF_B + ' | needs_human | not a route',
    'ROUTE | ' + REF_C + ' | needs_gpt_decision |',
    'ROUTE | ' + REF_C,
  ].join('\n');
  const parsed = parseRouteOutput(text, REFS);
  const reasons = parsed.invalid_lines.map(item => item.reason);
  assert.deepEqual(reasons, ['invalid_route', 'unknown_ref', 'invalid_route', 'empty_reason', 'route_arity']);
  assert.equal(parsed.route_vocabulary_complete, false);
  assert.deepEqual(parsed.missing_refs, [REF_A, REF_B, REF_C]);
});

test('parseRouteOutput treats non-ROUTE lines as leaked prose', () => {
  const parsed = parseRouteOutput('Summary: all refs handled\n' + GOOD, REFS);
  assert.equal(parsed.extra_lines.length, 1);
  assert.match(parsed.extra_lines[0], /^Summary:/);
});

test('ASK lines are validated without affecting the route count', () => {
  const bad = [
    GOOD,
    'ASK | ' + REF_A + ' | machine | wrong target',
    'ASK | ' + REF_B + ' | owner |',
    'ASK | 4444444444444444 | gpt | foreign ref',
    'ASK | ' + REF_C + ' | gpt',
  ].join('\n');
  const parsed = parseRouteOutput(bad, REFS);
  assert.deepEqual(parsed.invalid_lines.map(item => item.reason), ['ask_bad_target', 'ask_empty', 'ask_unknown_ref', 'ask_arity']);
  assert.equal(parsed.route_lines, 3);
});

test('evaluateShadow passes only on exact one-line-per-ref coverage', () => {
  const good = evaluateShadow(GOOD, REFS);
  assert.equal(good.pass, true);
  assert.equal(good.all_five_present, false);

  const empty = evaluateShadow('', REFS);
  assert.equal(empty.pass, false);
  assert.equal(empty.output_nonempty, false);

  const prose = evaluateShadow('Here is my plan.\n' + GOOD, REFS);
  assert.equal(prose.pass, false);

  const partial = evaluateShadow(GOOD.split('\n').slice(0, 2).join('\n'), REFS);
  assert.equal(partial.pass, false);
});

test('evaluateShadow --require-all-five needs five distinct routes', () => {
  assert.equal(evaluateShadow(ALL_FIVE, FIVE_REFS).pass, true);
  assert.equal(evaluateShadow(ALL_FIVE, FIVE_REFS).all_five_present, true);
  const strict = evaluateShadow(GOOD, REFS, {requireAllFive: true});
  assert.equal(strict.pass, false);
  assert.equal(strict.all_five_present, false);
});

test('newestDailyCard ignores non-daily files and picks the highest suffix', () => {
  const dir = tmpDir();
  try {
    fs.mkdirSync(path.join(dir, 'ops', 'deep-superagent', 'tasks'), {recursive: true});
    const tasks = path.join(dir, 'ops', 'deep-superagent', 'tasks');
    fs.writeFileSync(path.join(tasks, 'DEEP-SUPERAGENT-20261117-DAILY-1.json'), '{}');
    fs.writeFileSync(path.join(tasks, 'DEEP-SUPERAGENT-20261117-DAILY-2.json'), '{}');
    fs.writeFileSync(path.join(tasks, 'README.md'), 'ignore me');
    assert.equal(newestDailyCard(dir), path.join(tasks, 'DEEP-SUPERAGENT-20261117-DAILY-2.json'));
    assert.equal(newestDailyCard(path.join(dir, 'missing')), null);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('runShadow calls each model exactly once and never retries', async () => {
  const dir = tmpDir();
  try {
    const cardFile = writeCard(dir, 'card.json', {task_id: 'FAKE-CARD-1', prompt: PROMPT});
    const calls = [];
    const fakeCall = async ({model}) => {
      calls.push(model);
      if (model === 'deepseek-flash') return {ok: false, status: 'api_error', error: 'HTTP 503'};
      return {
        ok: true,
        status: 'success',
        output: GOOD,
        finish_reason: 'stop',
        request_id: 'req-1',
        tokens_used: 321,
      };
    };
    const result = await runShadow({
      cardPath: cardFile,
      call: fakeCall,
      apiKey: 'test-key',
      now: () => '2026-11-17T00:00:00.000Z',
    });
    assert.equal(result.ok, true);
    assert.deepEqual(calls, ['deepseek-v4-pro', 'deepseek-flash']);
    const receipt = result.receipt;
    assert.equal(receipt.schema, 'ltzzz.deepseek.shadow-routing.v1');
    assert.equal(receipt.at, '2026-11-17T00:00:00.000Z');
    assert.equal(receipt.card_task_id, 'FAKE-CARD-1');
    assert.equal(receipt.refs_total, 3);
    assert.equal(receipt.per_model.length, 2);
    const pro = receipt.per_model[0];
    assert.equal(pro.model, 'deepseek-v4-pro');
    assert.equal(pro.ok, true);
    assert.equal(pro.tokens_used, 321);
    assert.equal(pro.evaluation.pass, true);
    assert.match(pro.output_sha256, /^[0-9a-f]{64}$/);
    const flash = receipt.per_model[1];
    assert.equal(flash.ok, false);
    assert.equal(flash.provider_status, 'api_error');
    assert.equal(flash.evaluation.pass, false);
    assert.equal(receipt.verdict.pro_pass, true);
    assert.equal(receipt.verdict.flash_regression, true);
    assert.match(receipt.verdict.recommendation, /keep_pro_as_main_line/);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('runShadow records a single attempt per model even when both calls fail', async () => {
  const dir = tmpDir();
  try {
    const cardFile = writeCard(dir, 'card.json', {task_id: 'FAKE-CARD-2', prompt: PROMPT});
    const calls = [];
    const fakeCall = async ({model}) => {
      calls.push(model);
      return {ok: false, status: 'exception', error: 'deepseek_transport_failed', automatic_retry_allowed: false};
    };
    const result = await runShadow({cardPath: cardFile, call: fakeCall, apiKey: 'test-key'});
    assert.equal(calls.length, 2);
    assert.equal(result.receipt.per_model.every(row => row.ok === false), true);
    assert.equal(result.receipt.verdict.pro_pass, false);
    assert.equal(result.receipt.verdict.flash_regression, false);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('runShadow honours a custom model list and writes the receipt when asked', async () => {
  const dir = tmpDir();
  try {
    const cardFile = writeCard(dir, 'card.json', {task_id: 'FAKE-CARD-3', prompt: PROMPT + '\n- 1111111111111111 age=0d status=unknown :: four\n- 2222222222222222 age=0d status=unknown :: five'});
    const outPath = path.join(dir, 'out', 'shadow.json');
    const calls = [];
    const fakeCall = async ({model}) => {
      calls.push(model);
      return {ok: true, status: 'success', output: ALL_FIVE, tokens_used: 10};
    };
    const result = await runShadow({
      cardPath: cardFile,
      models: ['deepseek-flash'],
      call: fakeCall,
      apiKey: 'test-key',
      outPath,
      requireAllFive: true,
    });
    assert.deepEqual(calls, ['deepseek-flash']);
    assert.equal(result.receipt.per_model[0].evaluation.all_five_present, true);
    const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
    assert.equal(written.card_task_id, 'FAKE-CARD-3');
    assert.equal(result.receipt.receipt_path, outPath);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('runShadow fails closed without a card, refs or api key', async () => {
  const dir = tmpDir();
  try {
    let called = 0;
    const fakeCall = async () => {
      called += 1;
      return {ok: true, output: GOOD};
    };
    const missing = await runShadow({cardPath: path.join(dir, 'nope.json'), call: fakeCall, apiKey: 'k'});
    assert.equal(missing.status, 'card_not_found');
    assert.equal(missing.ok, false);

    const emptyCard = writeCard(dir, 'empty.json', {task_id: 'X', prompt: 'no refs here'});
    const noRefs = await runShadow({cardPath: emptyCard, call: fakeCall, apiKey: 'k'});
    assert.equal(noRefs.status, 'no_refs_in_card');

    const cardFile = writeCard(dir, 'card.json', {task_id: 'X', prompt: PROMPT});
    const noKey = await runShadow({cardPath: cardFile, call: fakeCall, apiKey: ''});
    assert.equal(noKey.status, 'not_configured');
    assert.equal(called, 0);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});
test('buildPrompt keeps the card prompt intact and appends a worker override', () => {
  assert.deepEqual([...PROMPT_MODES], ['card', 'worker', 'planner']);
  assert.equal(buildPrompt('hello', 'card'), 'hello');
  assert.equal(buildPrompt('hello'), 'hello');
  const worker = buildPrompt('hello', 'worker');
  assert.ok(worker.startsWith('hello\n'));
  assert.ok(worker.includes(WORKER_OVERRIDE));
  assert.match(worker, /SHADOW OVERRIDE: You are the worker seat/);
  assert.throws(() => buildPrompt('hello', 'reviewer'), /invalid_prompt_mode/);
  assert.equal(buildPrompt(undefined, 'card'), '');
});

test('runShadow worker mode sends the override and records the prompt mode', async () => {
  const dir = tmpDir();
  try {
    const cardFile = writeCard(dir, 'card.json', {task_id: 'FAKE-CARD-4', prompt: PROMPT});
    const seen = [];
    const fakeCall = async ({model, prompt}) => {
      seen.push({model, prompt});
      return {ok: true, status: 'success', output: GOOD, tokens_used: 5};
    };
    const result = await runShadow({
      cardPath: cardFile,
      models: ['deepseek-v4-pro'],
      call: fakeCall,
      apiKey: 'test-key',
      promptMode: 'worker',
      now: () => '2026-11-17T01:00:00.000Z',
    });
    assert.equal(seen.length, 1);
    assert.ok(seen[0].prompt.indexOf('SHADOW OVERRIDE: You are the worker seat') > seen[0].prompt.indexOf('GROUP C:'));
    assert.equal(result.receipt.prompt_mode, 'worker');
    assert.match(result.receipt.prompt_sha256, /^[0-9a-f]{64}$/);
    assert.equal(result.receipt.per_model[0].evaluation.pass, true);

    const bad = await runShadow({
      cardPath: cardFile,
      call: fakeCall,
      apiKey: 'test-key',
      promptMode: 'reviewer',
    });
    assert.equal(bad.status, 'invalid_prompt_mode');
    assert.equal(bad.ok, false);
    assert.equal(seen.length, 1);
  } finally {
    fs.rmSync(dir, {recursive: true, force: true});
  }
});

test('extractRefs also picks up B-labelled repo items in order', () => {
  const prompt = [
    'GROUP A:',
    '- 35e009a39885e44b age=8d status=open :: mail',
    'GROUP B (repo observation, 6 items):',
    '- B1 oversight backlog: open_warning_cases=188',
    '- B2 failed workflow runs in last 24h: 3',
    '- B6 no production deploy',
    'GROUP C:',
    '- 8d9a5f45ab685bbb age=0d status=unknown :: mail',
  ].join('\n');
  assert.deepEqual(extractRefs(prompt), ['35e009a39885e44b', 'B1', 'B2', 'B6', '8d9a5f45ab685bbb']);
  assert.equal(REF_PATTERNS.length, 2);
  assert.deepEqual(extractRefs('- B1 status=open'), ['B1']);
  assert.deepEqual(extractRefs('- Bytecode note'), []);
});

const PLANNER_OK = JSON.stringify({
  summary: 'route mail and repo items to three seats',
  tasks: [
    {seat: 'qianwen', task: 'handle GROUP A refs'},
    {seat: 'grok', task: 'handle GROUP B items'},
    {seat: 'doubao', task: 'handle GROUP C refs'},
  ],
  needs_gpt_decision: false,
  reason: null,
});

test('parsePlannerOutput accepts the documented planner JSON', () => {
  assert.deepEqual([...PLANNER_SEATS], ['qianwen', 'grok', 'doubao']);
  const parsed = parsePlannerOutput(PLANNER_OK);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.error, null);
  assert.equal(parsed.tasks.length, 3);
  assert.deepEqual(parsed.seats_seen, ['qianwen', 'grok', 'doubao']);
  assert.equal(parsed.needs_gpt_decision, false);
});

test('parsePlannerOutput rejects fences, prose and malformed JSON', () => {
  const fence = String.fromCharCode(96).repeat(3);
  assert.equal(parsePlannerOutput(fence + 'json\n' + PLANNER_OK + '\n' + fence).error, 'markdown_fence');
  assert.equal(parsePlannerOutput('Here you go: ' + PLANNER_OK).error, 'prose_outside_json');
  assert.equal(parsePlannerOutput('{not json}').error, 'invalid_json');
  assert.equal(parsePlannerOutput('').error, 'empty');
});

test('parsePlannerOutput enforces summary, task count and seat vocabulary', () => {
  const mk = (patch) => JSON.stringify({...JSON.parse(PLANNER_OK), ...patch});
  assert.equal(parsePlannerOutput(mk({summary: ''})).error, 'summary_missing');
  assert.equal(parsePlannerOutput(mk({summary: 'x'.repeat(101)})).error, 'summary_too_long');
  assert.equal(parsePlannerOutput(mk({tasks: []})).error, 'tasks_empty');
  assert.equal(parsePlannerOutput(mk({tasks: [{seat: 'qianwen', task: 'x'}, {seat: 'qianwen', task: 'y'}]})).error, 'duplicate_seat');
  assert.equal(parsePlannerOutput(mk({tasks: [1, 2, 3, 4].map((_, i) => ({seat: ['qianwen','grok','doubao','qianwen'][i], task: 'x'}))})).error, 'too_many_tasks');
  assert.equal(parsePlannerOutput(mk({tasks: [{seat: 'claude', task: 'x'}]})).error, 'invalid_seat');
  assert.equal(parsePlannerOutput(mk({tasks: [{seat: 'qianwen', task: 'x'.repeat(901)}]})).error, 'task_too_long');
  assert.equal(parsePlannerOutput(mk({tasks: [{seat: 'qianwen'}]})).error, 'task_text_missing');
  assert.equal(parsePlannerOutput(mk({needs_gpt_decision: 'no'})).error, 'needs_gpt_decision_not_boolean');
  assert.equal(parsePlannerOutput(mk({needs_gpt_decision: true, reason: ''})).error, 'reason_required');
  const needs = parsePlannerOutput(mk({needs_gpt_decision: true, reason: 'owner value missing'}));
  assert.equal(needs.ok, true);
  assert.equal(needs.needs_gpt_decision, true);
});

test('evaluateShadow in planner mode judges the JSON contract, not ROUTE lines', () => {
  const good = evaluateShadow(PLANNER_OK, REFS, {mode: 'planner'});
  assert.equal(good.pass, true);
  assert.equal(good.route_lines, 0);
  assert.equal(good.refs_total, REFS.length);
  assert.equal(good.all_five_present, false);

  const workerText = evaluateShadow(GOOD, REFS, {mode: 'planner'});
  assert.equal(workerText.pass, false);
  assert.equal(workerText.error, 'prose_outside_json');

  const oneTask = evaluateShadow(JSON.stringify({summary: 's', tasks: [{seat: 'grok', task: 't'}], needs_gpt_decision: false, reason: null}), REFS, {mode: 'planner'});
  assert.equal(oneTask.pass, true);
});

test('buildPrompt planner mode appends the planner override only', () => {
  const planner = buildPrompt('GROUP C:', 'planner');
  assert.ok(planner.includes('SHADOW OVERRIDE: You are the planner seat'));
  assert.ok(!planner.includes('SHADOW OVERRIDE: You are the worker seat'));
  assert.ok(planner.indexOf('planner seat') > planner.indexOf('GROUP C:'));
});
