import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const root = new URL('../../', import.meta.url).pathname;
const read = (p) => JSON.parse(fs.readFileSync(root + p, 'utf8'));
const authority = read('config/deploy-automation-authority-20261117.json');

test('deploy automation authority is granted by owner with a date', () => {
  assert.equal(authority.schema, 'ltzzz.deploy-automation-authority.v1');
  assert.equal(authority.authorized_by, 'owner');
  assert.match(authority.decided_at, /^2026-11-17$/);
  assert.equal(authority.automatic_merge, true);
  assert.equal(authority.automatic_deploy, true);
});

test('deploy automation never enables funds, signing or real money', () => {
  assert.equal(authority.financial_execution, false);
  assert.equal(authority.production_signing, false);
  assert.equal(authority.real_funds_enabled, false);
  assert.equal(authority.automatic_rollback, false);
});

test('funds family stays manual and is exhaustively excluded', () => {
  const families = new Set(authority.excluded_families);
  for (const f of ['funding_moves', 'loan_disbursement', 'refund_semantics', 'wallet_or_safe_ops', 'signing', 'credential_access', 'five_signature_safe']) {
    assert.ok(families.has(f), `missing excluded family ${f}`);
  }
});

test('deploy automation preconditions require green tests and health readback', () => {
  const p = new Set(authority.preconditions);
  assert.ok(p.has('tests_green_before_merge'));
  assert.ok(p.has('health_readback_after_deploy'));
  assert.ok(p.has('deploy_receipt_written_to_knowledge/results'));
  assert.ok(p.has('model_calls_zero_for_verification_only'));
  assert.ok(p.has('no_funds_actions_in_same_run'));
});

test('phase-level validation guards are preserved and not flipped', () => {
  assert.equal(read('config/patch-policy.json').automatic_deploy, false);
  assert.equal(read('config/patchgate-a2.json').automatic_deploy, false);
  assert.equal(read('config/patchgate-a3.json').generic_production_deploy_enabled, false);
  assert.equal(read('config/pi-cloud.json').automatic_deploy, false);
  assert.match(authority.guards_preserved.note, /不随本授权翻转/);
});

test('current policy doc declares the new rule and marks history superseded', () => {
  const doc = fs.readFileSync(root + 'docs/DEPLOY-AUTOMATION-CURRENT.md', 'utf8');
  assert.match(doc, /当前口径/);
  assert.match(doc, /OWNER-AUTH-20261117-DEPLOY-AUTOMATION/);
  assert.match(doc, /superseded/);
  assert.match(doc, /仍然人工/);
  assert.match(doc, /unknown/);
});
