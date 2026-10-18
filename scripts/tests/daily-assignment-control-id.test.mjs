import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyAssignment} from '../lib/daily-assignment.mjs';

const date = '2026-10-18', agent = 'deepseek';
const controlId = `CONTROL-${date}-${agent}`, dailyId = `DAILY-${date}-${agent}`;
function fixture() {
  return {
    control: {date, dispatches: [{id:controlId, agent, instruction:'Repair the observed handover.', status:'queued', execute_on:date}]},
    pulse: {task_board:[{id:dailyId, date, agent, assigned_to:agent, status:'assigned', execution_chain:'daily'}]},
  };
}

test('CONTROL resolves to the unique eligible DAILY task and retains source provenance', () => {
  const options = fixture(), assignment = dailyAssignment(agent, date, options);
  assert.equal(assignment.id, dailyId);
  assert.equal(assignment.source_task_id, controlId);
  assert.equal(assignment.instruction, options.control.dispatches[0].instruction);
  assert.equal(assignment.execution_date, date);
});

test('next-day coordinator output without an id binds to that execution day DAILY task', () => {
  const options = fixture();
  options.control.date = '2026-10-17';
  delete options.control.dispatches[0].id;
  options.control.dispatches[0].status = 'queued_for_next_daily_economy';
  const assignment = dailyAssignment(agent, date, options);
  assert.equal(assignment.id, dailyId);
  assert.equal(assignment.source_task_id, controlId);
  assert.equal(assignment.source_date, '2026-10-17');
});

for (const [name, patch] of Object.entries({
  another_agent:{assigned_to:'doubao'}, mismatched_agent_field:{agent:'doubao'}, another_date:{date:'2026-10-17'},
  ans_chain:{execution_chain:'ans'}, missing_chain:{execution_chain:undefined},
  claimed:{status:'claimed'}, completed:{status:'completed_draft_review'},
  stale_claimant:{claimed_by:'doubao'}, missing_assignee:{assigned_to:null},
})) {
  test(`CONTROL never aliases a DAILY task with ${name}`, () => {
    const options = fixture(); Object.assign(options.pulse.task_board[0], patch);
    assert.equal(dailyAssignment(agent, date, options).id, controlId);
  });
}

test('missing or duplicate DAILY identities remain unresolved instead of guessing', () => {
  for (const duplicate of [false, true]) {
    const options = fixture();
    if (duplicate) options.pulse.task_board.push({...options.pulse.task_board[0], assigned_to:'doubao'});
    else options.pulse.task_board = [];
    assert.equal(dailyAssignment(agent, date, options).id, controlId);
  }
});

test('existing CONTROL task and explicit board_task_id retain priority', () => {
  const options = fixture();
  options.pulse.task_board.push({...options.pulse.task_board[0], id:controlId});
  assert.equal(dailyAssignment(agent, date, options).id, controlId);
  options.control.dispatches[0].board_task_id = 'explicit-board-task';
  assert.equal(dailyAssignment(agent, date, options).id, 'explicit-board-task');
});

test('custom or unrelated-date ids are never silently redirected', () => {
  for (const id of ['custom-job','CONTROL-2026-10-01-deepseek','CONTROL-2026-10-18-doubao']) {
    const options = fixture(); options.control.dispatches[0].id = id;
    assert.equal(dailyAssignment(agent, date, options).id, id);
  }
});
