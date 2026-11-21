import test from 'node:test';
import assert from 'node:assert/strict';
import { probeMarker } from '../lib/e2e-probe-20261121.mjs';

test('E2E-PROBE-20261121 marker function returns correct value', () => {
  assert.strictEqual(probeMarker(), 'ltzzz-e2e-20261121');
});