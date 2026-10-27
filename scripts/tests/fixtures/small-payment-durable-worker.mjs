// Miniflare-only harness. Never deploy: routes deliberately let tests inject synthetic state.
import {createDurablePaymentAdapters, PAYMENT_STATE_KEY} from '../../lib/small-payment-durable-store.mjs';
import {createSmallPaymentService} from '../../lib/small-payment-runtime.mjs';

export class PaymentAlarmProbe {
  constructor(ctx) {
    this.storage = ctx.storage;
    this.adapters = createDurablePaymentAdapters(ctx.storage);
    this.ready = ctx.blockConcurrencyWhile(() => this.adapters.initialize());
    this.service = createSmallPaymentService({policy: {enabled: false}, store: this.adapters.store});
  }
  async alarm() { await this.ready; await this.service.alarm(); }
  async fetch(request) {
    await this.ready;
    const path = new URL(request.url).pathname;
    try {
      if (path === '/state') return Response.json({
        state: await this.storage.get(PAYMENT_STATE_KEY), alarm: await this.storage.getAlarm()
      });
      const input = await request.json();
      if (path === '/schedule') return Response.json(await this.adapters.scheduleAudit(input));
      if (path === '/initialize') return Response.json(await this.adapters.initialize());
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
            receipt: null, audit: null, status: 'synthetic_reserved_no_execution', execution_attempted: false
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
