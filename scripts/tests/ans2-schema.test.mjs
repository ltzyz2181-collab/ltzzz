import test from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import Ajv from 'ajv';

const ajv = new Ajv({ allErrors: true, jsonPointers: true });
const SCHEMA_PATH = 'knowledge/schemas/ans2-follow-up-receipt.v3.json';
const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
const validate = ajv.compile(schema);

const base = {
  status: 'closed',
  test_status: {
    model_proposed: true,
    tested_by_model_claim: false,
    actually_run: false,
    run_id: null,
    sha256: null,
  },
  paid: false,
  tx_hash: null,
};

test('a receipt claiming fixed/dispatched/escalated without follow_up_receipt is rejected', () => {
  for (const action of ['fixed', 'dispatched', 'escalated']) {
    const ok = validate({ ...base, action_taken: action });
    assert.equal(ok, false, `action_taken="${action}" missing follow_up_receipt was accepted`);
    assert.ok(
      validate.errors.some((e) => /follow_up_receipt/.test(String(e.message) + String(e.dataPath || e.instancePath || ''))),
      `error should mention follow_up_receipt: ${JSON.stringify(validate.errors)}`
    );
  }
});

test('a receipt claiming action with a non-empty follow_up_receipt passes', () => {
  const ok = validate({
    ...base,
    action_taken: 'fixed',
    follow_up_receipt: 'knowledge/results/x.json',
  });
  assert.equal(ok, true, JSON.stringify(validate.errors));
});

test('empty-string follow_up_receipt is rejected (minLength 1)', () => {
  const ok = validate({
    ...base,
    action_taken: 'fixed',
    follow_up_receipt: '',
  });
  assert.equal(ok, false);
});

test('action_taken=none requires status open and a null follow_up_receipt', () => {
  assert.equal(
    validate({
      ...base,
      action_taken: 'none',
      status: 'open',
      follow_up_receipt: null,
    }),
    true
  );
  assert.equal(
    validate({
      ...base,
      action_taken: 'none',
      status: 'closed',
      follow_up_receipt: null,
    }),
    false
  );
});

test('actually_run=true still requires run_id and a 64-hex sha256 (regression)', () => {
  const run = {
    model_proposed: true,
    tested_by_model_claim: false,
    actually_run: true,
  };
  assert.equal(
    validate({
      action_taken: 'fixed',
      status: 'pending_review',
      follow_up_receipt: 'r.json',
      test_status: { ...run, run_id: null, sha256: null },
      paid: false,
      tx_hash: null,
    }),
    false
  );
  assert.equal(
    validate({
      action_taken: 'fixed',
      status: 'pending_review',
      follow_up_receipt: 'r.json',
      test_status: { ...run, run_id: '39566118736', sha256: 'a'.repeat(64) },
      paid: false,
      tx_hash: null,
    }),
    true
  );
});
