import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {classifyCycle} from '../agi-econ/cycle-outcome.mjs';

const job = status => ({title: `t-${status}`, status});

test('a total provider outage is not a finished cycle', () => {
  const r = classifyCycle([job('error'), job('error'), job('error'), job('error')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'all_jobs_failed');
  assert.equal(r.errored, 4);
  assert.equal(r.audited, 0);
});

test('every job blocked by a failed worker call is still not a finished cycle', () => {
  const r = classifyCycle([
    {...job('blocked_refunded'), reason: 'worker_model_failed'},
    {...job('blocked_refunded'), reason: 'worker_model_failed'},
  ]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_job_reached_audit');
  assert.equal(r.blocked, 2);
});

test('one settled job makes the cycle green even when the rest failed', () => {
  const r = classifyCycle([job('settled'), job('error'), job('error'), job('blocked_refunded')]);
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'partially_audited');
  assert.equal(r.audited, 1);
  assert.equal(r.errored, 2);
  assert.equal(r.blocked, 1);
});

test('an audit that ran and rejected the work counts as audited, not as an outage', () => {
  const r = classifyCycle([job('slashed'), job('slashed')]);
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'audited');
  assert.equal(r.audited, 2);
});

test('a re-run where every title already ran is idle, not failed', () => {
  const r = classifyCycle([job('already_ran'), job('already_ran')]);
  assert.equal(r.ok, true);
  assert.equal(r.reason, 'nothing_to_do');
  assert.equal(r.skipped, 2);
});

test('an empty job list is a wiring error, not success', () => {
  const r = classifyCycle([]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_jobs');
});

test('unknown status is treated as a failure instead of silently passing', () => {
  const r = classifyCycle([{title: 'x'}]);
  assert.equal(r.ok, false);
  assert.equal(r.errored, 1);
  assert.equal(r.failures[0].status, 'unknown');
});

test('classifyCycle rejects a non-array input', () => {
  assert.throws(() => classifyCycle({jobs: []}), /jobs_must_be_array/);
});

test('run-cycle fails the workflow when no job reached the audit gate', () => {
  const src = fs.readFileSync(new URL('../agi-econ/run-cycle.mjs', import.meta.url), 'utf8');
  assert.match(src, /const outcome = classifyCycle\(out\)/);
  assert.match(src, /if \(!outcome\.ok\) process\.exitCode = 1;/);
  assert.match(src, /outcome,/);
});


test('a cycle with no worker keys is unconfigured, not an idle success', () => {
  const r = classifyCycle([job('skipped_no_worker_key'), job('skipped_no_worker_key')]);
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'worker_keys_missing');
  assert.equal(r.unconfigured, 2);
});
