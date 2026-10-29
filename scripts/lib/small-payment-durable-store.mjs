// Deployment-owned SQLite Durable Object capabilities; no HTTP, credentials or payments.
import {initialSmallPaymentState} from './small-payment-runtime.mjs';

export const PAYMENT_STATE_KEY = initialSmallPaymentState().schema;
const timestamp = value => {
  const ms = typeof value === 'string' ? Date.parse(value) : NaN;
  if (!Number.isSafeInteger(ms) || new Date(ms).toISOString() !== value)
    throw Error('payment_deadline_invalid');
  return ms;
};
function ledger(value) {
  if (!value || value.schema !== PAYMENT_STATE_KEY || typeof value.frozen !== 'boolean' ||
      typeof value.switch_enabled !== 'boolean' || !value.operations ||
      Array.isArray(value.operations) || typeof value.operations !== 'object')
    throw Error('durable_payment_state_required');
  return value;
}

// The one DO alarm represents ALL outstanding obligations, not the last reservation.
export function nextPaymentAlarmAt(value) {
  const state = ledger(value);
  let earliest = null;
  const include = ms => { earliest = earliest === null ? ms : Math.min(earliest, ms); };
  for (const [id, op] of Object.entries(state.operations)) {
    if (!op || op.request?.payment_id !== id) throw Error('payment_operation_identity_invalid');
    const receipt = timestamp(op.receipt_due_at), audit = timestamp(op.audit_due_at);
    if (audit < receipt) throw Error('payment_deadline_order_invalid');
    if (!op.receipt) include(receipt);
    if (!op.audit) include(audit);
  }
  // A durable freeze stops new spending; repeatedly firing overdue alarms adds no safety.
  return state.frozen ? null : earliest;
}

export function createDurablePaymentAdapters(storage) {
  // This adapter deliberately supports SQLite DOs only. Cloudflare documents that
  // all storage calls inside their transaction closure join that transaction,
  // including alarm operations. Do not substitute Workers KV or an in-memory Map.
  if (typeof storage?.sql?.exec !== 'function' ||
      ['transaction', 'get', 'put', 'setAlarm', 'deleteAlarm'].some(k => typeof storage[k] !== 'function'))
    throw Error('sqlite_durable_object_storage_required');
  const key = k => { if (k !== PAYMENT_STATE_KEY) throw Error('payment_state_key_only'); };
  const rearm = async state => {
    const deadline = nextPaymentAlarmAt(state);
    if (deadline === null) await storage.deleteAlarm();
    else await storage.setAlarm(deadline);
    return deadline;
  };
  const store = Object.freeze({
    transaction: callback => storage.transaction(async () => {
      const tx = Object.freeze({
        get: async k => { key(k); return storage.get(k); },
        put: async (k, value) => {
          key(k);
          // Validate BEFORE writing. A failed alarm write must roll back this put too.
          const snapshot = structuredClone(ledger(value));
          nextPaymentAlarmAt(snapshot);
          await storage.put(k, snapshot);
          await rearm(snapshot);
        }
      });
      return callback(tx);
    })
  });
  return Object.freeze({
    store,
    async initialize() {
      return storage.transaction(async () => {
        const prior = await storage.get(PAYMENT_STATE_KEY);
        if (prior !== undefined) {
          // Never reset a corrupt or existing financial ledger, nor postpone its alarm.
          nextPaymentAlarmAt(prior);
          return {initialized: false, existing: true};
        }
        await storage.put(PAYMENT_STATE_KEY, initialSmallPaymentState());
        await storage.deleteAlarm();
        return {initialized: true, switch_enabled: false};
      });
    },
    async scheduleAudit({payment_id, receipt_due_at, audit_due_at} = {}) {
      return storage.transaction(async () => {
        const state = ledger(await storage.get(PAYMENT_STATE_KEY));
        const op = typeof payment_id === 'string' && Object.hasOwn(state.operations, payment_id)
          ? state.operations[payment_id] : null;
        if (!op || op.status !== 'reserved_before_execution' || op.execution_attempted !== false ||
            op.receipt || op.audit || op.request?.payment_id !== payment_id || op.receipt_due_at !== receipt_due_at ||
            op.audit_due_at !== audit_due_at || state.frozen)
          throw Error('exact_durable_payment_reservation_required');
        const alarm_at = await rearm(state);
        if (alarm_at === null) throw Error('pending_payment_deadline_required');
        return {durable: true, payment_id, receipt_due_at, audit_due_at, alarm_at};
      });
    },
    async reconcileAlarm() {
      return storage.transaction(async () => ({
        durable: true, alarm_at: await rearm(ledger(await storage.get(PAYMENT_STATE_KEY)))
      }));
    }
  });
}
