import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {initialSmallPaymentState} from '../lib/small-payment-runtime.mjs';
import {runtimeFixture, RELEASE} from './small-payment-fixtures.mjs';
import {PAYMENT_STATE_KEY, nextPaymentAlarmAt, createDurablePaymentAdapters} from '../lib/small-payment-durable-store.mjs';

const iso = ms => new Date(ms).toISOString();
const op = (id, receipt, audit) => ({request: {payment_id: id}, receipt_due_at: iso(receipt), audit_due_at: iso(audit), receipt: null, audit: null});
test('alarm chooses earliest outstanding obligation across all payments', () => {
  const s = initialSmallPaymentState();
  s.operations.one = op('one', 1000, 4000);
  s.operations.two = op('two', 2000, 5000);
  assert.equal(nextPaymentAlarmAt(s), 1000);
  s.operations.one.receipt = {synthetic: true};
  assert.equal(nextPaymentAlarmAt(s), 2000);
  s.operations.two.receipt = {synthetic: true};
  assert.equal(nextPaymentAlarmAt(s), 4000);
  s.operations.one.audit = s.operations.two.audit = {synthetic: true};
  assert.equal(nextPaymentAlarmAt(s), null);
});
test('already frozen state has no recurring hot alarm; deadlines stay in the ledger', () => {
  const s = initialSmallPaymentState(); s.operations.one = op('one', 1000, 2000); s.frozen = true;
  assert.equal(nextPaymentAlarmAt(s), null); assert.equal(s.operations.one.receipt_due_at, iso(1000));
});
test('malformed identity, dates and ledger cannot silently delete a deadline', () => {
  assert.throws(() => nextPaymentAlarmAt({}), /durable_payment_state_required/);
  const s = initialSmallPaymentState(); s.operations.one = op('other', 1000, 2000);
  assert.throws(() => nextPaymentAlarmAt(s), /identity_invalid/);
  s.operations.one = op('one', 1000, 2000); s.operations.one.receipt_due_at = 'tomorrow';
  assert.throws(() => nextPaymentAlarmAt(s), /deadline_invalid/);
  s.operations.one = op('one', 2000, 1000);
  assert.throws(() => nextPaymentAlarmAt(s), /deadline_order_invalid/);
});
test('in-memory and KV substitutes are refused; key matches the runtime state schema', () => {
  assert.equal(PAYMENT_STATE_KEY, initialSmallPaymentState().schema);
  assert.throws(() => createDurablePaymentAdapters(new Map()), /sqlite_durable_object_storage_required/);
  assert.throws(() => createDurablePaymentAdapters({transaction() {}}), /sqlite_durable_object_storage_required/);
});

test('real workerd SQLite DO transactions, alarms and restart (synthetic ledger, no transfers)', async t => {
  const {Miniflare, Log, LogLevel} = await import(process.env.LTZZZ_MINIFLARE_MODULE || 'miniflare');
  const root = fileURLToPath(new URL('../../', import.meta.url));
  const persist = await mkdtemp(join(tmpdir(), 'ltzzz-payment-do-'));
  const options = {modules: true, modulesRoot: root,
    scriptPath: resolve(root, 'scripts/tests/fixtures/small-payment-durable-worker.mjs'),
    compatibilityDate: '2025-10-08', compatibilityFlags: ['nodejs_compat'],
    durableObjects: {PAYMENTS: {className: 'PaymentAlarmProbe', useSQLite: true}},
    durableObjectsPersist: persist, log: new Log(LogLevel.ERROR)};
  let mf = new Miniflare(options);
  const call = async (name, path, body) => {
    const r = await mf.dispatchFetch('https://fixture.local' + path + '?object=' + encodeURIComponent(name),
      body === undefined ? undefined : {method: 'POST', headers: {'content-type': 'application/json'}, body: JSON.stringify(body)});
    return {status: r.status, body: await r.json()};
  };
  const deadlines = (id, base = Date.now() + 60000) => ({id, receipt_due_at: iso(base), audit_due_at: iso(base + 3600000)});
  try {
    await t.test('new ledger starts disabled and without a scheduled alarm', async () => {
      const {body} = await call('initial', '/state');
      assert.equal(body.state.switch_enabled, false); assert.equal(body.alarm, null);
      assert.deepEqual(body.state.operations, {});
    });
    await t.test('parallel writes serialize and later obligations cannot postpone earlier ones', async () => {
      const base = Date.now() + 120000;
      const inputs = Array.from({length: 20}, (_, i) => deadlines('op-' + i, base + i * 1000));
      const results = await Promise.all(inputs.reverse().map(x => call('concurrent', '/append', x)));
      assert.ok(results.every(r => r.status === 200));
      const {body} = await call('concurrent', '/state');
      assert.equal(Object.keys(body.state.operations).length, 20); assert.equal(body.alarm, base);
    });
    await t.test('transaction exception rolls back both ledger and alarm', async () => {
      await call('rollback', '/append', deadlines('old'));
      const before = (await call('rollback', '/state')).body;
      const r = await call('rollback', '/rollback', deadlines('new', Date.now() + 30000));
      assert.equal(r.status, 422); assert.match(r.body.error, /synthetic_transaction_rollback/);
      assert.deepEqual((await call('rollback', '/state')).body, before);
    });
    await t.test('alarm-write failure rolls back the reservation before it can be used', async () => {
      const before = (await call('alarm-failure', '/state')).body;
      const r = await call('alarm-failure', '/alarm-failure', deadlines('never-reserved'));
      assert.equal(r.status, 422); assert.match(r.body.error, /synthetic_alarm_write_failure/);
      assert.deepEqual((await call('alarm-failure', '/state')).body, before);
    });
    await t.test('scheduler acknowledges only the exact committed reservation', async () => {
      const input = deadlines('exact'); await call('schedule', '/append', input);
      const exact = {payment_id: input.id, receipt_due_at: input.receipt_due_at, audit_due_at: input.audit_due_at};
      const ok = await call('schedule', '/schedule', exact);
      assert.equal(ok.body.durable, true); assert.equal(ok.body.alarm_at, Date.parse(input.receipt_due_at));
      const before = (await call('schedule', '/state')).body;
      assert.equal((await call('schedule', '/schedule', {...exact, audit_due_at: iso(Date.now() + 9999999)})).status, 422);
      assert.equal((await call('schedule', '/schedule', {...exact, payment_id: 'missing'})).status, 422);
      assert.deepEqual((await call('schedule', '/state')).body, before);
    });
    await t.test('receipt advances alarm to audit; full review clears it without losing state', async () => {
      const input = deadlines('settlement'); await call('settlement', '/append', input);
      await call('settlement', '/receipt', {id: input.id});
      assert.equal((await call('settlement', '/state')).body.alarm, Date.parse(input.audit_due_at));
      assert.equal((await call('settlement', '/schedule', {payment_id: input.id,
        receipt_due_at: input.receipt_due_at, audit_due_at: input.audit_due_at})).status, 422);
      assert.equal((await call('settlement', '/state')).body.alarm, Date.parse(input.audit_due_at));
      await call('settlement', '/audit', {id: input.id});
      const {body} = await call('settlement', '/state'); assert.equal(body.alarm, null);
      assert.equal(body.state.operations.settlement.execution_attempted, false);
    });
    await t.test('actual automatic alarm invokes runtime and durably freezes overdue receipt', async () => {
      await call('automatic', '/append', deadlines('overdue', Date.now() + 200));
      const until = Date.now() + 15000;
      let snapshot;
      do {
        await new Promise(resolve => setTimeout(resolve, 50));
        snapshot = (await call('automatic', '/state')).body;
      } while (!snapshot.state.frozen && Date.now() < until);
      assert.equal(snapshot.state.frozen, true); assert.equal(snapshot.state.switch_enabled, false);
      assert.equal(snapshot.state.freeze_reason, 'receipt_deadline_missed'); assert.equal(snapshot.alarm, null);
      assert.equal(snapshot.state.operations.overdue.execution_attempted, false);
      assert.ok(snapshot.state.events.some(e => e.kind === 'automatic_freeze' && e.trigger === 'alarm'));
    });
    await t.test('restart preserves frozen history and does not reset a live reservation', async () => {
      const frozen = (await call('automatic', '/state')).body;
      const live = (await call('concurrent', '/state')).body;
      await mf.dispose(); mf = new Miniflare(options);
      assert.deepEqual((await call('automatic', '/state')).body, frozen);
      assert.deepEqual((await call('concurrent', '/state')).body, live);
      assert.equal((await call('automatic', '/initialize', {})).body.initialized, false);
      assert.deepEqual((await call('automatic', '/state')).body, frozen);
    });
    await t.test('consumed early alarm is rearmed even when runtime makes no ledger write', async () => {
      const input = deadlines('not-due'); await call('early-alarm', '/append', input);
      const before = (await call('early-alarm', '/state')).body;
      const response = await call('early-alarm', '/fire-early-alarm', {});
      assert.equal(response.status, 200);
      const after = (await call('early-alarm', '/state')).body;
      assert.deepEqual(after.state, before.state); assert.equal(after.alarm, Date.parse(input.receipt_due_at));
    });
    await t.test('alarm handler finally rearms when runtime handler throws', async () => {
      const input = deadlines('still-due'); await call('throwing-alarm', '/append', input);
      const response = await call('throwing-alarm', '/fire-throwing-alarm', {});
      assert.equal(response.status, 422); assert.match(response.body.error, /synthetic_handler_failure/);
      assert.equal((await call('throwing-alarm', '/state')).body.alarm, Date.parse(input.receipt_due_at));
    });
    await t.test('reconcile restores an accidentally deleted earliest alarm and leaves frozen alarm empty', async () => {
      const input = deadlines('restore'); await call('reconcile-live', '/append', input);
      await call('reconcile-live', '/delete-alarm', {});
      assert.equal((await call('reconcile-live', '/state')).body.alarm, null);
      assert.equal((await call('reconcile-live', '/initialize-only', {})).body.initialized, false);
      assert.equal((await call('reconcile-live', '/state')).body.alarm, null);
      assert.equal((await call('reconcile-live', '/reconcile', {})).body.alarm_at, Date.parse(input.receipt_due_at));
      assert.equal((await call('reconcile-live', '/state')).body.alarm, Date.parse(input.receipt_due_at));
      assert.equal((await call('automatic', '/reconcile', {})).body.alarm_at, null);
      assert.equal((await call('automatic', '/state')).body.state.frozen, true);
    });
    await t.test('constructor reconstructs missing alarm from an existing ledger after restart', async () => {
      const input = deadlines('resume'); await call('rearm-restart', '/append', input);
      const before = (await call('rearm-restart', '/state')).body;
      await call('rearm-restart', '/delete-alarm', {});
      assert.equal((await call('rearm-restart', '/state')).body.alarm, null);
      await mf.dispose(); mf = new Miniflare(options);
      const after = (await call('rearm-restart', '/state')).body;
      assert.deepEqual(after.state, before.state); assert.equal(after.alarm, before.alarm);
    });
    const configureSyntheticRuntime = async (name, execute_mode = 'confirm') => {
      // Private keys remain in ephemeral host test fixtures. Only synthetic public
      // policy, activation and signatures enter this never-deployable workerd fixture.
      const f = runtimeFixture(), state = f.store.read();
      const config = {synthetic: true, policy: f.policy, release_sha256: RELEASE,
        state, authority: f.signatures.authority, budget: f.budgetProof,
        activation_evidence: f.signatures.makeEvidence(Date.now(), state.activation.command), execute_mode};
      const configured = await call(name, '/configure-runtime', config);
      assert.equal(configured.status, 200); return f.request;
    };
    await t.test('runtime submit commits reservation and real durable audit scheduling before fake execution', async () => {
      const request = await configureSyntheticRuntime('submit-confirm');
      const response = await call('submit-confirm', '/submit', {request});
      assert.equal(response.body.status, 'paid_pending_independent_audit');
      const snapshot = (await call('submit-confirm', '/state')).body;
      const operation = snapshot.state.operations[request.payment_id];
      assert.equal(operation.execution_attempted, true); assert.equal(operation.receipt.paid, true);
      assert.equal(snapshot.fake_executions, 1); assert.equal(snapshot.schedule_ack_verified_before_execute, true);
      assert.equal(snapshot.alarm, Date.parse(operation.audit_due_at));
      assert.equal((await call('submit-confirm', '/submit', {request})).body.status, 'existing_operation_reconcile_only');
      assert.equal((await call('submit-confirm', '/state')).body.fake_executions, 1);
    });
    await t.test('duplicate settlement hash freezes durable runtime and no retry executes after restart', async () => {
      const request = await configureSyntheticRuntime('duplicate-settlement');
      assert.equal((await call('duplicate-settlement', '/submit', {request})).body.status, 'paid_pending_independent_audit');
      const second = {...request, payment_id: 'PAY-TEST-2'};
      const response = await call('duplicate-settlement', '/submit', {request: second});
      assert.equal(response.body.status, 'frozen_unknown_reconcile_no_retry');
      assert.equal(response.body.reason, 'settlement_transaction_already_claimed');
      const before = (await call('duplicate-settlement', '/state')).body;
      assert.equal(before.fake_executions, 2); assert.equal(before.state.frozen, true); assert.equal(before.alarm, null);
      assert.equal(before.state.operations[second.payment_id].status, 'unknown_reconcile_no_retry');
      await mf.dispose(); mf = new Miniflare(options);
      const after = (await call('duplicate-settlement', '/state')).body;
      assert.deepEqual(after, before);
      assert.equal((await call('duplicate-settlement', '/submit', {request: second})).body.execution_attempted, false);
      assert.equal((await call('duplicate-settlement', '/state')).body.fake_executions, 2);
    });
    await t.test('unknown fake execute persists freeze and clears alarm across restart without replay', async () => {
      const request = await configureSyntheticRuntime('unknown-execution', 'throw_unknown');
      const response = await call('unknown-execution', '/submit', {request});
      assert.equal(response.body.status, 'frozen_unknown_reconcile_no_retry');
      const before = (await call('unknown-execution', '/state')).body;
      assert.equal(before.fake_executions, 1); assert.equal(before.state.frozen, true); assert.equal(before.alarm, null);
      assert.equal(before.state.operations[request.payment_id].status, 'unknown_reconcile_no_retry');
      await mf.dispose(); mf = new Miniflare(options);
      assert.deepEqual((await call('unknown-execution', '/state')).body, before);
      assert.equal((await call('unknown-execution', '/submit', {request})).body.execution_attempted, false);
      assert.equal((await call('unknown-execution', '/state')).body.fake_executions, 1);
    });
    await t.test('confirmed receipt does not suppress the later independent-audit deadline', async () => {
      const now = Date.now(), input = {id: 'unaudited', receipt_due_at: iso(now + 600), audit_due_at: iso(now + 1200)};
      await call('audit-overdue', '/append', input);
      await call('audit-overdue', '/receipt', {id: input.id});
      const until = Date.now() + 15000;
      let snapshot;
      do {
        await new Promise(resolve => setTimeout(resolve, 50));
        snapshot = (await call('audit-overdue', '/state')).body;
      } while (!snapshot.state.frozen && Date.now() < until);
      assert.equal(snapshot.state.frozen, true);
      assert.equal(snapshot.state.freeze_reason, 'post_payment_audit_deadline_missed');
      assert.equal(snapshot.alarm, null);
      assert.equal(snapshot.state.operations.unaudited.execution_attempted, false);
    });
  } finally { await mf.dispose(); await rm(persist, {recursive: true, force: true}); }
});
