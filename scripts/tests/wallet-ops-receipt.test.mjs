import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildReceipt, writeReceipt, main, REQUIRED_STEPS} from '../wallet-ops-receipt.mjs';

const allSuccess = () => Object.fromEntries(REQUIRED_STEPS.map(([id]) => [`STEP_${id.toUpperCase()}_OUTCOME`, 'success']));

test('all steps successful -> ok and exit 0', () => {
  const receipt = buildReceipt(allSuccess());
  assert.equal(receipt.ok, true);
  assert.deepEqual(receipt.failed_steps, []);
  assert.equal(main({env: {...allSuccess(), GITHUB_RUN_ID: '1'}, outPath: path.join(os.tmpdir(), 'wo-ok-' + process.pid + '.json')}), 0);
});

test('one failed step -> red, receipt names the step', () => {
  const env = {...allSuccess(), STEP_AUDIT_OUTCOME: 'failure'};
  const receipt = buildReceipt(env);
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.failed_steps, ['audit']);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-red-'));
  const outPath = path.join(dir, 'ops', 'wallet-ops', 'last-run.json');
  const code = main({env, outPath});
  assert.equal(code, 1);
  const written = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.equal(written.ok, false);
  assert.equal(written.steps.find(step => step.id === 'audit').outcome, 'failure');
});

test('a step that never ran is not success', () => {
  const env = allSuccess();
  delete env.STEP_GUARDIAN_OUTCOME;
  const receipt = buildReceipt(env);
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.failed_steps, ['guardian']);
});

test('a skipped step is still red (no silent green)', () => {
  const receipt = buildReceipt({...allSuccess(), STEP_SPEND_OUTCOME: 'skipped'});
  assert.equal(receipt.ok, false);
  assert.deepEqual(receipt.failed_steps, ['spend']);
});

test('writeReceipt is deterministic apart from the timestamp and reports run metadata', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wo-meta-'));
  const outPath = path.join(dir, 'receipt.json');
  const receipt = writeReceipt({env: {...allSuccess(), GITHUB_RUN_ID: '4400', GITHUB_SHA: 'a'.repeat(40)}, outPath, at: '2026-11-17T00:00:00.000Z'});
  assert.equal(receipt.run_id, '4400');
  assert.equal(receipt.commit, 'a'.repeat(40));
  assert.equal(receipt.at, '2026-11-17T00:00:00.000Z');
  assert.equal(JSON.parse(fs.readFileSync(outPath, 'utf8')).ok, true);
});
