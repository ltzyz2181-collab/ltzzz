// Fixed, offline audit of the original delivery. No API credentials or live orders.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

if (process.argv.length !== 2) throw Error('fixed_offline_inspection_only');
let networkAttempts = 0;
globalThis.fetch = async () => { networkAttempts++; throw Error('offline_audit_network_forbidden'); };
const {completeExternalRelay, PROCUREMENT_ORDER} = await import('../wep3-procurement.js');
const {buildAavePlan} = await import('../wep3-aave.js');
const {Market} = await import('../wep3-market.js');
const sha256 = value => createHash('sha256').update(value).digest('hex');
const originalPath = 'knowledge/results/funded-invest/run-39005569942-attempt-1.json';
const inspectionPath = 'knowledge/results/funded-invest/inspection-39180766254-attempt-1.json';
const original = JSON.parse(fs.readFileSync(originalPath)).external_ai.order;
const inspected = JSON.parse(fs.readFileSync(inspectionPath)).inspections.find(x => x.label === 'external_order').result.order;
const checks = [];
function check(name, fn) { fn(); checks.push({name, passed: true}); }
check('original_order_identity_and_rejected_paid_state', () => {
  assert.equal(original.id, PROCUREMENT_ORDER);
  assert.equal(original.status, 'paid_delivery_rejected');
  assert.equal(original.paid, true);
  assert.equal(original.delivery_accepted, false);
  assert.equal(original.amount_raw, '3000');
});
const actualDigest = sha256(Buffer.from(original.deliverable, 'utf8'));
check('delivery_utf8_bytes_match_recorded_sha256', () => assert.equal(actualDigest, original.deliverable_sha256));
check('later_inspection_contains_identical_original_delivery_and_payment', () => {
  assert.equal(inspected.deliverable, original.deliverable);
  assert.equal(inspected.deliverable_sha256, actualDigest);
  assert.equal(inspected.tx_hash, original.tx_hash);
});
const artifact = JSON.parse(original.deliverable.replace(/^\s*```(?:json)?\s*/, '').replace(/\s*```\s*$/, ''));
async function replayStructure(text) {
  // An isolated in-memory receiver fixture; never the live book or a new purchase.
  const order = {id: PROCUREMENT_ORDER, relay_handed_off: true, paid: false, delivery_accepted: false};
  const book = {procurement: {[PROCUREMENT_ORDER]: order}};
  const response = await completeExternalRelay({save: async () => {}}, book, {
    http: original.http,
    body: JSON.stringify({choices: [{message: {content: text}, finish_reason: original.finish_reason}]}),
    payment_response: ''
  }, {paymentVerifier: async () => ({verified: false})});
  return response.order.delivery_accepted;
}
const originalStructureAccepted = await replayStructure(original.deliverable);
check('production_relay_structure_rejects_original_numeric_issue_ids', () => assert.equal(originalStructureAccepted, false));
const normalized = structuredClone(artifact);
normalized.issues.forEach(issue => { issue.id = String(issue.id); });
const normalizedStructureAccepted = await replayStructure(JSON.stringify(normalized));
check('id_only_normalization_passes_structure_without_proving_semantic_acceptance', () => assert.equal(normalizedStructureAccepted, true));
const input = artifact.tests.find(test => test.expected_http === 200).request.body;
const ctx = {address: original.payer, usdc_raw: '20000000', ausdc_raw: '0', allowance_raw: '0',
  cash_floor_raw: '5000000', day_raw: '0', week_raw: '0', month_raw: '0', first_supply_confirmed: false, exit_test_confirmed: false};
check('original_positive_body_has_invalid_intent', () => assert.throws(() => buildAavePlan(input, ctx), /invalid_intent/));
check('fixing_action_and_amount_does_not_fix_short_intent_id', () => assert.throws(() => buildAavePlan({...input, action: 'supply', amount_usdc: '1'}, ctx), /invalid_intent/));
check('fixing_intent_and_action_does_not_fix_numeric_amount', () => assert.throws(() => buildAavePlan({...input, intent_id: 'AUDIT_LOCAL_INTENT_20261019', action: 'supply'}, ctx), /decimal_amount_string_required/));
check('complete_corrected_body_builds_a_plan_only', () => assert.equal(buildAavePlan({intent_id: 'AUDIT_LOCAL_INTENT_20261019', action: 'supply', amount_usdc: '1'}, ctx).amount_raw, '1000000'));
const market = new Market({storage: {get: async () => undefined, put: async () => {throw Error('storage_write_forbidden');}}}, {LAB_PIN: 'offline-fixture-pin'});
const authResults = [];
for (const [label, headers] of [
  ['positive_missing_pin', {}],
  ['wrong_authorization_only', {Authorization: 'invalid_token'}],
  ['wrong_lab_pin', {'X-Lab-Pin': 'wrong-fixture-pin'}]
]) {
  const response = await market.fetch(new Request('https://offline.invalid/market/aave/preview', {
    method: 'POST', headers: {'Content-Type': 'application/json', ...headers}, body: JSON.stringify(input)
  }));
  const body = await response.json();
  check(label + '_is_401_pin_required', () => {assert.equal(response.status, 401); assert.equal(body.error, 'pin_required');});
  authResults.push({label, actual_http: response.status, error: body.error});
}
check('valid_lab_pin_satisfies_authentication_only', () => assert.equal(market.admin(new Request('https://offline.invalid/', {headers: {'X-Lab-Pin': 'offline-fixture-pin'}})), true));
check('no_network_attempts', () => assert.equal(networkAttempts, 0));
console.log(JSON.stringify({
  at: new Date().toISOString(), source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  command: 'node scripts/inspect-original-hire-closeout.mjs', scope: 'offline_original_bytes_and_local_receiver_fixtures_not_live_API_or_chain',
  original_path: originalPath, inspection_path: inspectionPath,
  input_files: [originalPath, inspectionPath, 'wep3-procurement.js', 'wep3-aave.js', 'wep3-market.js'].map(path => ({path, sha256: sha256(fs.readFileSync(path))})),
  order_id: original.id, recorded_deliverable_sha256: original.deliverable_sha256,
  recomputed_deliverable_sha256: actualDigest, deliverable_utf8_bytes: Buffer.byteLength(original.deliverable, 'utf8'),
  original_structure_accepted: originalStructureAccepted, id_normalized_structure_accepted: normalizedStructureAccepted,
  auth_results: authResults, checks, checks_passed: checks.length,
  live_generation_calls: 0, live_network_attempts: networkAttempts, new_orders: 0, new_payments: 0,
  wallet_signatures: 0, chain_transactions: 0, runtime_order_modified: false
}, null, 2));
