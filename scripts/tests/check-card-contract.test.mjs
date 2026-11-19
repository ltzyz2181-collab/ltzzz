import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzeCardPrompt} from '../check-card-contract.mjs';

const PLANNER = '- Planner deepseek: return ONLY JSON {"summary":"x","tasks":[]}';
const WORKER = '- Worker (each seat): return ONLY one line per ref, pipe separated';

test('a card carrying both contracts is flagged for splitting', () => {
  const r = analyzeCardPrompt('GROUP A:\n' + PLANNER + '\n' + WORKER);
  assert.equal(r.has_planner, true);
  assert.equal(r.has_worker, true);
  assert.equal(r.mixed, true);
  assert.equal(r.verdict, 'split_required');
});

test('a worker-only card passes', () => {
  const r = analyzeCardPrompt('GROUP C:\n- 8d9a5f45ab685bbb age=0d status=unknown :: x\n' + WORKER);
  assert.equal(r.mixed, false);
  assert.equal(r.verdict, 'ok');
  assert.equal(r.refs, 1);
});

test('planner with an explicit nested worker block is a two-layer contract, not mixing', () => {
  const r = analyzeCardPrompt([
    PLANNER,
    '【给 qianwen 的任务】',
    'Worker: return one line per ref',
    'ROUTE | <ref> | <route> | <reason>',
  ].join('\n'));
  assert.equal(r.has_planner, true);
  assert.equal(r.has_worker, true);
  assert.equal(r.has_nested_worker, true);
  assert.equal(r.mixed, false);
  assert.equal(r.verdict, 'ok');
});

test('planner and worker contracts without the nested marker are still flagged', () => {
  const r = analyzeCardPrompt(PLANNER + '\nROUTE | <ref> | <route> | <reason>');
  assert.equal(r.has_nested_worker, false);
  assert.equal(r.mixed, true);
  assert.deepEqual(r.reasons, ['planner_worker']);
});

test('a planner-only card passes', () => {
  const r = analyzeCardPrompt(PLANNER);
  assert.equal(r.has_planner, true);
  assert.equal(r.has_worker, false);
  assert.equal(r.mixed, false);
});

test('a plain prose card is neither', () => {
  const r = analyzeCardPrompt('Please review the repository and report status.');
  assert.equal(r.has_planner, false);
  assert.equal(r.has_worker, false);
  assert.equal(r.verdict, 'ok');
  assert.equal(r.refs, 0);
});

test('refs counts hex refs and B-labelled items', () => {
  const r = analyzeCardPrompt('- aaaaaaaaaaaaaaaa age=1d status=open :: x\n- B1 backlog\n- B2 runs');
  assert.equal(r.refs, 3);
});
const COORDINATOR = '协调席输出：每项一行 <ref> | <route> | <理由一句>';
const REVIEWER = '复核席输出：只对协调席给出的 close 与 deploy 项，逐条写 agree/disagree';

test('a card asking one seat for coordinator routes and another for review is split', () => {
  const r = analyzeCardPrompt('GROUP B:\n- B1 backlog\n' + COORDINATOR + '\n' + REVIEWER);
  assert.equal(r.has_coordinator, true);
  assert.equal(r.has_reviewer, true);
  assert.equal(r.mixed, true);
  assert.deepEqual(r.reasons, ['coordinator_reviewer']);
});

test('a coordinator-only card passes', () => {
  const r = analyzeCardPrompt('Worker: return one line per ref\n' + COORDINATOR);
  assert.equal(r.has_coordinator, true);
  assert.equal(r.has_reviewer, false);
  assert.equal(r.mixed, false);
  assert.equal(r.verdict, 'ok');
});

test('a reviewer-only card passes', () => {
  const r = analyzeCardPrompt(REVIEWER);
  assert.equal(r.has_reviewer, true);
  assert.equal(r.has_coordinator, false);
  assert.equal(r.mixed, false);
});
