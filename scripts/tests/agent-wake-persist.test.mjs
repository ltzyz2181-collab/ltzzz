import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIntakeArgs} from '../agent-wake-persist.mjs';

test('buildIntakeArgs targets a single card when --issue is given', () => {
  assert.deepEqual(buildIntakeArgs({issue: 533}), [
    'scripts/agent-wake-intake.mjs', '--issue', '533', '--apply'
  ]);
});

test('buildIntakeArgs falls back to the label sweep', () => {
  assert.deepEqual(buildIntakeArgs({label: 'wake:request'}), [
    'scripts/agent-wake-intake.mjs', '--label', 'wake:request', '--apply'
  ]);
});

test('buildIntakeArgs prefers the issue over the label and appends extra args', () => {
  assert.deepEqual(buildIntakeArgs({issue: 7, label: 'wake:request', extra: ['--now', '2026-11-21T04:00:00Z']}), [
    'scripts/agent-wake-intake.mjs', '--issue', '7', '--apply', '--now', '2026-11-21T04:00:00Z'
  ]);
});
