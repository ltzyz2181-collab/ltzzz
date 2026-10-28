// Miniflare-only harness. Never deploy: routes deliberately let tests inject synthetic state.
import {createDurablePaymentAdapters, PAYMENT_STATE_KEY} from '../../lib/small-payment-durable-store.mjs';
import {createSmallPaymentService, consumeSmallPaymentPermit} from '../../lib/small-payment-runtime.mjs';

export class PaymentAlarmProbe {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.adapters = createDurablePaymentAdapters(ctx.storage);
    this.service = createSmallPaymentService({policy: {enabled: false}, store: this.adapters.store});
    this.ready = ctx.blockConcurrencyWhile(async () => {
      await this.adapters.initialize();
      await this.adapters.reconcileAlarm();
      await this.restoreSyntheticRuntime();
    });
  }
  async alarm() {
    await this.ready;
    // DO alarms are consumed before this handler. Rebuild from the committed
    // ledger even when the clock is early or runtime processing throws.
    try { return await this.service.alarm(); }
    finally { await this.adapters.reconcileAlarm(); }
  }
  async restoreSyntheticRuntime() {
    const config = await this.storage.get('fixture_runtime_config');
    if (!config) return;
    if (config.synthetic !== true) throw Error('synthetic_fixture_only');
    this.service = createSmallPaymentService({
      policy: config.policy, release_sha256: config.release_sha256,
      store: this.adapters.store, activationAuthority: config.authority,
      loadActivationEvidence: async () => config.activation_evidence,
      authenticateController: async () => ({verified: true, controller_id: 'gpt'}),
      loadBudgetEvidence: async () => config.budget,
      scheduleAudit: async input => {
        const ack = await this.adapters.scheduleAudit(input);
        await this.storage.put('fixture_schedule_ack:' + input.payment_id, ack);
        return ack;
      },
      execute: async ({request, recipient, permit}) => {
        const state = await this.storage.get(PAYMENT_STATE_KEY);
        const op = state.operations[request.payment_id];
        const ack = await this.storage.get('fixture_schedule_ack:' + request.payment_id);
        const alarm = await this.storage.getAlarm();
        if (!ack?.durable || ack.payment_id !== request.payment_id ||
            ack.receipt_due_at !== op.receipt_due_at || ack.audit_due_at !== op.audit_due_at ||
            op.status !== 'dispatched_outcome_unknown' || op.execution_attempted !== true ||
            !Number.isSafeInteger(alarm) || alarm > Date.parse(op.receipt_due_at)) throw Error('synthetic_ordering_violation');
        await this.storage.put('fixture_ordering_verified', true);
        await this.storage.put('fixture_execute_count', ((await this.storage.get('fixture_execute_count')) || 0) + 1);
        consumeSmallPaymentPermit(permit, {recipient, amount_raw: request.amount_raw,
          purpose_id: request.purpose_id, rail: request.rail});
        if (config.execute_mode === 'throw_unknown') throw Error('synthetic_execution_outcome_unknown');
        return {hash: '0x' + 'c'.repeat(64)};
      },
      verifySettlement: async ({request, expected_recipient_key}) => ({
        payment_id: request.payment_id, amount_raw: request.amount_raw, currency: 'USDC',
        recipient_key: expected_recipient_key, purpose_id: request.purpose_id,
        evidence_sha256: 'a'.repeat(64), paid: true, tx_hash: '0x' + 'c'.repeat(64),
        provider_receipt_id: null, status: 'confirmed'
      })
    });
  }
  async fetch(request) {
    await this.ready;
    const path = new URL(request.url).pathname;
    try {
      if (path === '/state') return Response.json({
        state: await this.storage.get(PAYMENT_STATE_KEY), alarm: await this.storage.getAlarm(),
        fake_executions: (await this.storage.get('fixture_execute_count')) || 0,
        schedule_ack_verified_before_execute: (await this.storage.get('fixture_ordering_verified')) === true
      });
      const input = await request.json();
      if (path === '/schedule') return Response.json(await this.adapters.scheduleAudit(input));
      if (path === '/initialize-only') return Response.json(await this.adapters.initialize());
      if (path === '/initialize') {
        const initialized = await this.adapters.initialize();
        await this.adapters.reconcileAlarm(); return Response.json(initialized);
      }
      if (path === '/delete-alarm') { await this.storage.deleteAlarm(); return Response.json({synthetic: true}); }
      if (path === '/reconcile') return Response.json(await this.adapters.reconcileAlarm());
      if (path === '/fire-early-alarm' || path === '/fire-throwing-alarm') {
        await this.storage.deleteAlarm();
        const oldService = this.service;
        if (path === '/fire-throwing-alarm') this.service = {alarm: async () => { throw Error('synthetic_handler_failure'); }};
        try { await this.alarm(); return Response.json({synthetic: true}); }
        finally { this.service = oldService; }
      }
      if (path === '/configure-runtime') {
        if (input.synthetic !== true || JSON.stringify(input).includes('PRIVATE KEY')) throw Error('synthetic_public_configuration_required');
        await this.adapters.store.transaction(tx => tx.put(PAYMENT_STATE_KEY, input.state));
        await this.storage.put('fixture_runtime_config', input);
        await this.restoreSyntheticRuntime(); return Response.json({synthetic: true, paid: false, tx_hash: null});
      }
      if (path === '/submit') return Response.json(await this.service.submit(input));
      const capabilities = path === '/alarm-failure' ? createDurablePaymentAdapters({
        sql: this.storage.sql,
        transaction: this.storage.transaction.bind(this.storage),
        get: this.storage.get.bind(this.storage), put: this.storage.put.bind(this.storage),
        deleteAlarm: this.storage.deleteAlarm.bind(this.storage),
        setAlarm: async () => { throw Error('synthetic_alarm_write_failure'); }
      }) : this.adapters;
      await capabilities.store.transaction(async tx => {
        const state = await tx.get(PAYMENT_STATE_KEY);
        if (path === '/append' || path === '/rollback' || path === '/alarm-failure') {
          const id = input.id;
          state.operations[id] = {
            ordinal: Object.keys(state.operations).length + 1,
            activation_sha256: 'a'.repeat(64), request: {payment_id: id}, history: {payment_id: id},
            receipt_due_at: input.receipt_due_at, audit_due_at: input.audit_due_at,
            receipt: null, audit: null, status: 'reserved_before_execution', execution_attempted: false
          };
        } else if (path === '/receipt') state.operations[input.id].receipt = {synthetic: true};
        else if (path === '/audit') state.operations[input.id].audit = {synthetic: true};
        else throw Error('unknown_test_route');
        await tx.put(PAYMENT_STATE_KEY, state);
        if (path === '/rollback') throw Error('synthetic_transaction_rollback');
      });
      return Response.json({ok: true, synthetic: true, paid: false, tx_hash: null});
    } catch (e) {
      return Response.json({error: e.message, synthetic: true}, {status: 422});
    }
  }
}
export default {
  fetch(request, env) {
    const name = new URL(request.url).searchParams.get('object') || 'test';
    return env.PAYMENTS.get(env.PAYMENTS.idFromName(name)).fetch(request);
  }
};
