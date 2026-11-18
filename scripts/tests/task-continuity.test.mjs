import test from 'node:test';
import assert from 'node:assert/strict';
import {validateBoard, reportBoard, formatReport, STATES} from '../task-continuity.mjs';

const at = (hoursAgo) => new Date(Date.now() - hoursAgo * 36e5).toISOString();
const task = (over = {}) => ({id: 'WALLET-P1-TEST', title: '测试任务', state: 'ready', next_owner: 'claude', next_action: '落代码并跑测试', evidence: [], updated_at: at(1), ...over});
const board = (tasks) => ({schema: 'ltzzz.task-continuity.v1', tasks});

test('a well-formed board validates', () => {
  assert.deepEqual(validateBoard(board([task()])), []);
});

test('state and owner must come from the fixed sets', () => {
  assert.ok(validateBoard(board([task({state: 'someday'})])).includes('tasks[0]:bad_state'));
  assert.ok(validateBoard(board([task({next_owner: 'intern'})])).includes('tasks[0]:bad_next_owner'));
});

test('non-done tasks need exactly one next action and owner', () => {
  assert.ok(validateBoard(board([task({next_action: '  '})])).includes('tasks[0]:next_action_required'));
  const done = task({state: 'done', next_action: undefined, next_owner: undefined});
  assert.ok(validateBoard(board([done])).includes('tasks[0]:done_requires_evidence'));
  assert.deepEqual(validateBoard(board([{...done, evidence: ['ops/x.json']}])), []);
});

test('blocking states must state their unblock condition', () => {
  for (const state of ['blocked_decision', 'waiting_external', 'waiting_owner']) {
    assert.ok(validateBoard(board([task({state})])).includes('tasks[0]:unblock_condition_required'), state);
    assert.deepEqual(validateBoard(board([task({state, unblock_condition: 'Owner 给出 openid'})])), []);
  }
});

test('duplicate ids are rejected', () => {
  assert.ok(validateBoard(board([task(), task()])).includes('tasks[1]:duplicate_id'));
});

test('a ready task left alone past the fail window is reported as stalled', () => {
  const r = reportBoard(board([task({updated_at: at(80)}, ), task({id: 'WALLET-P1-OLD', updated_at: at(30)})]), {warnHours: 24, failHours: 72});
  assert.deepEqual(r.stalled, ['WALLET-P1-TEST']);
  assert.deepEqual(r.warn, ['WALLET-P1-OLD']);
  assert.equal(r.open, 2);
});

test('done tasks drop out of the report and out of owner counts', () => {
  const r = reportBoard(board([task(), task({id: 'WALLET-P1-DONE', state: 'done', evidence: ['ops/x.json'], next_action: undefined, next_owner: undefined})]));
  assert.equal(r.open, 1);
  assert.equal(r.by_owner.claude, 1);
});

test('the text report always shows the actionable list and the waiting list', () => {
  const text = formatReport(reportBoard(board([task(), task({id: 'WALLET-P1-WAIT', state: 'waiting_owner', next_owner: 'owner', unblock_condition: 'Owner 提供 openid'})])));
  assert.match(text, /现在就能做/);
  assert.match(text, /等条件 \/ 等裁决/);
  assert.match(text, /WALLET-P1-TEST/);
  assert.match(text, /解除条件：Owner 提供 openid/);
  assert.deepEqual(STATES.includes('done'), true);
});