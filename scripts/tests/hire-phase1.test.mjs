import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateOrder, classifyIntent, gateOutcome, buildReceipt, appendReceipt, readLedger, assertAppendOnly, PHASE1_REVISION} from '../hire-phase1.mjs';
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const order = {
  order_id: 'HIRE-TEST-20261116-01',
  role: 'repo_audit_seat',
  objective: 'read docs and report broken links',
  acceptance_gate: 'node -e "process.exit(0)"',
  evidence_paths: 'knowledge/results/hire/test.md',
  rollback: 'git revert',
  salary: 'none',
  seat: 'doubao'
};

test('valid order passes', () => {
  assert.deepEqual(validateOrder(order), []);
});

test('unknown field, bad gate and salary are rejected', () => {
  assert.ok(validateOrder({...order, extra: 'x'}).includes('unknown_field:extra'));
  assert.ok(validateOrder({...order, acceptance_gate: 'bash -c "rm -rf /"'}).includes('gate_must_start_with_node'));
  assert.ok(validateOrder({...order, acceptance_gate: 'node x && rm y'}).includes('gate_must_be_single_command_no_shell_metacharacters'));
  assert.ok(validateOrder({...order, salary: 5}).includes('salary_must_be_none_in_phase1'));
});

test('forbidden intent escalates instead of deciding', () => {
  const o = {...order, objective: 'move wallet funds and sign a tx'};
  const out = gateOutcome(o, {runner: () => { throw Error('should not run'); }});
  assert.equal(out.state, 'needs_owner_decision');
  assert.match(out.reason, /forbidden_intent/);
  assert.ok(classifyIntent('credential rotation').includes('credential'));
});

test('gate failure is a refusal with reason', () => {
  const out = gateOutcome({...order, acceptance_gate: 'node -e "process.exit(7)"'});
  assert.equal(out.state, 'refused');
  assert.match(out.reason, /gate_failed/);
});

test('gate success is accepted and receipt never pays', () => {
  const out = gateOutcome(order, {runner: () => 0});
  const receipt = buildReceipt(order, out, {at: '2026-11-16T00:00:00Z'});
  assert.equal(receipt.state, 'accepted');
  assert.equal(receipt.paid, false);
  assert.equal(receipt.financial_execution, false);
  assert.equal(receipt.amount_usd, 0);
  assert.equal(receipt.revision, PHASE1_REVISION);
  assert.match(receipt.receipt_sha256, /^[0-9a-f]{64}$/);
});

test('ledger is append-only and accepted cannot be downgraded', () => {
  const dir = mkdtempSync(join(tmpdir(), 'hire-'));
  const ledger = join(dir, 'ledger.jsonl');
  const ok = buildReceipt(order, {state: 'accepted', reason: 'gate_exit_0'});
  appendReceipt(ledger, ok);
  const rows = readLedger(ledger);
  assert.equal(rows.length, 1);
  const next = buildReceipt(order, {state: 'refused', reason: 'later'});
  assert.throws(() => assertAppendOnly(rows, next), /accepted_order_cannot_be_downgraded/);
  const paid = {...ok, paid: true};
  assert.throws(() => appendReceipt(ledger, paid), /phase1_must_not_pay/);
});

test('invalid receipt state is refused', () => {
  assert.throws(() => buildReceipt(order, {state: 'paid', reason: 'x'}), /invalid_receipt_state/);
});
