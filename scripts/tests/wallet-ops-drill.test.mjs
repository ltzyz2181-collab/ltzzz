import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Isolated negative drill for the wallet-ops receipt recorder.
// It runs the real CLI in a throwaway cwd, so the production workflow and the
// repository's own ops/wallet-ops/last-run.json are never touched.
const SCRIPT = path.resolve(fileURLToPath(new URL('../wallet-ops-receipt.mjs', import.meta.url)));
const STEPS = ['collect', 'balance', 'spend', 'refill', 'audit', 'anchor', 'guardian', 'feed'];

function drill(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-drill-'));
  const env = {
    ...process.env,
    ...Object.fromEntries(STEPS.map(id => [`STEP_${id.toUpperCase()}_OUTCOME`, 'success'])),
    GITHUB_RUN_ID: '9000000001',
    GITHUB_RUN_ATTEMPT: '1',
    GITHUB_SHA: 'a'.repeat(40),
    GITHUB_EVENT_NAME: 'drill',
    ...overrides,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value === null) delete env[key];
  }
  const run = spawnSync(process.execPath, [SCRIPT], {cwd: dir, env, encoding: 'utf8'});
  const receiptPath = path.join(dir, 'ops', 'wallet-ops', 'last-run.json');
  const receipt = fs.existsSync(receiptPath) ? JSON.parse(fs.readFileSync(receiptPath, 'utf8')) : null;
  return {status: run.status, receipt, stderr: run.stderr || '', dir};
}

test('drill: all eight steps success turns the run green', () => {
  const {status, receipt, stderr} = drill();
  assert.equal(status, 0, stderr);
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.failed_steps, []);
  assert.equal(receipt.steps.length, 8);
  assert.equal(receipt.run_id, '9000000001');
});

test('drill: a failed step turns the run red and names it', () => {
  const {status, receipt, stderr} = drill({STEP_AUDIT_OUTCOME: 'failure'});
  assert.equal(status, 1, stderr);
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.failed_steps, ['audit']);
  assert.match(stderr, /wallet-ops failed steps: audit/);
});

test('drill: a cancelled step (timeout or manual cancel) is never green', () => {
  const {status, receipt} = drill({STEP_SPEND_OUTCOME: 'cancelled'});
  assert.equal(status, 1);
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.failed_steps, ['spend']);
  assert.equal(receipt.steps.find(step => step.id === 'spend').outcome, 'cancelled');
});

test('drill: a missing outcome variable counts as not_run, not success', () => {
  const {status, receipt} = drill({STEP_GUARDIAN_OUTCOME: null});
  assert.equal(status, 1);
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.failed_steps, ['guardian']);
  assert.equal(receipt.steps.find(step => step.id === 'guardian').outcome, 'not_run');
});

test('drill: an empty environment fails all eight steps instead of exiting 0', () => {
  const overrides = Object.fromEntries(STEPS.map(id => [`STEP_${id.toUpperCase()}_OUTCOME`, null]));
  const {status, receipt} = drill(overrides);
  assert.equal(status, 1);
  assert.equal(receipt.ok, false);
  assert.equal(receipt.failed_steps.length, 8);
  assert.ok(receipt.steps.every(step => step.outcome === 'not_run'));
});

test('drill: a step that reports success but no receipt is still detectable', () => {
  const {status, receipt, dir} = drill();
  assert.equal(status, 0);
  const receiptPath = path.join(dir, 'ops', 'wallet-ops', 'last-run.json');
  assert.ok(fs.existsSync(receiptPath));
  fs.rmSync(receiptPath);
  assert.equal(fs.existsSync(receiptPath), false, 'missing receipt must be observable to the workflow guard');
  assert.equal(receipt.ok, true);
});