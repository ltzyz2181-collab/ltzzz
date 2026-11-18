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