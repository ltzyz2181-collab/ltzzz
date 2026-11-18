import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeWarnings, renderMarkdown} from '../merge-oversight-backlog.mjs';

const caseA = {
  case_id: 'c1', task_id: 'TASK-A', issue: 'review_missing', assigned_to: 'doubao',
  warning_dates: ['2026-10-22', '2026-10-23'], evidence: ['knowledge/results/a.json'],
  state: 'open', severity: 'warning', first_observed_at: '2026-10-22T00:00:00Z', last_observed_at: '2026-10-23T00:00:00Z',
};
const caseA2 = {
  case_id: 'c2', task_id: 'TASK-A', issue: 'review_missing', assigned_to: 'doubao',
  warning_dates: ['2026-10-23', '2026-10-24'], evidence: ['knowledge/results/b.json'],
  state: 'open', severity: 'repeated_warning', first_observed_at: '2026-10-21T00:00:00Z', last_observed_at: '2026-10-24T00:00:00Z',
};

test('the same original task id collapses into one row with unioned dates', () => {
  const m = mergeWarnings([caseA, caseA2]);
  assert.equal(m.totals.cases, 2);
  assert.equal(m.totals.unique_tasks, 1);
  assert.equal(m.totals.collapsed, 1);
  const t = m.tasks[0];
  assert.equal(t.task_id, 'TASK-A');
  assert.equal(t.cases, 2);
  assert.deepEqual(t.case_ids, ['c1', 'c2']);
  assert.equal(t.warning_days, 3);
  assert.equal(t.first_observed_at, '2026-10-21T00:00:00Z');
  assert.equal(t.last_observed_at, '2026-10-24T00:00:00Z');
  assert.equal(t.severity, 'repeated_warning');
  assert.deepEqual(t.evidence, ['knowledge/results/a.json', 'knowledge/results/b.json']);
});

test('conflicting seats are surfaced, never guessed', () => {
  const m = mergeWarnings([caseA, {...caseA2, assigned_to: 'qianwen'}]);
  assert.equal(m.tasks[0].seat, 'unresolved');
  assert.equal(m.tasks[0].seat_conflict, true);
  assert.equal(m.totals.seat_conflicts, 1);
});

test('rows without a task id are reported as invalid instead of dropped silently', () => {
  const m = mergeWarnings([{...caseA, task_id: '  '}]);
  assert.equal(m.totals.invalid_cases, 1);
  assert.equal(m.totals.unique_tasks, 0);
  assert.equal(m.invalid[0].reason, 'missing_task_id');
});

test('output is sorted by task id so repeated runs are stable', () => {
  const m = mergeWarnings([{...caseA, task_id: 'TASK-Z'}, {...caseA, task_id: 'TASK-B'}]);
  assert.deepEqual(m.tasks.map(t => t.task_id), ['TASK-B', 'TASK-Z']);
});

test('markdown carries the merged totals and one row per task', () => {
  const md = renderMarkdown(mergeWarnings([caseA, caseA2]), 'x.json');
  assert.match(md, /原始 warning 案例：2/);
  assert.match(md, /去重后任务：1/);
  assert.match(md, /\| TASK-A \| doubao \| review_missing \| 2 \| 3 \|/);
});
