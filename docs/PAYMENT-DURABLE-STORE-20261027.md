# Payment durable-state adapter — candidate, not activated

Original task: `PLAN-PATCHGATE-ESCROW-20261023`. Author: GPT/OpenAI engineering,
exact model identifier unavailable from executor metadata. This is a code candidate
and a verification plan, not Claude's audit, a live deployment or a payment receipt.

The existing payment service requires a serializable durable `store.transaction`
and an acknowledged `scheduleAudit`. A process could previously exit between its
reservation and its separately scheduled alarm. This adapter commits the ledger
and earliest outstanding alarm in the **same SQLite Durable Object transaction**.
Any alarm-write failure rolls back the reservation. It does not make network calls.

Cloudflare permits only one alarm per DO. Scheduling must scan all outstanding
receipt/audit deadlines so a new payment cannot postpone an older payment's check.
Receipt confirmation advances the alarm to the remaining audit deadline. A durable
freeze clears the alarm to avoid a retry loop; it never removes the ledger or
retries a payment. Existing initialization cannot reset stored state or alarms.

References: [SQLite storage transactions](https://developers.cloudflare.com/durable-objects/api/storage-api/),
[alarm semantics](https://developers.cloudflare.com/durable-objects/api/alarms/).
This adapter intentionally rejects Workers KV and non-SQLite storage. Cloudflare
documents that SQLite storage calls inside the transaction closure join the same
transaction; it is not a claim of generic KV transaction compatibility.

## Verification and integration

The test-only Worker under `scripts/tests/fixtures/` runs in actual local workerd
with SQLite storage through pinned Miniflare `4.20251008.0`. It verifies concurrent
writes, transaction rollback, injected alarm-write failure, exact reservation
acknowledgement, receipt-to-audit scheduling, automatic receipt/audit freezes and
restart persistence. Its state is synthetic. It has no keys, network payment
adapter, live wallet or production namespace. **Never deploy this fixture**: its
HTTP routes deliberately allow synthetic state injection for tests.

The suite is named `payment-durable-store.integration.test.mjs` and has a dedicated
CI job that installs its pinned workerd harness. It is intentionally separate from
the existing dependency-free `small-payment-*.test.mjs` policy glob. The first PR
run exposed an `ERR_MODULE_NOT_FOUND: miniflare` in that older job (229 pass/1 fail);
that failure is preserved, and no test is skipped or removed. Both suites must pass.

In the future reviewed deployment's private DO constructor:

```js
const durable = createDurablePaymentAdapters(ctx.storage);
this.ready = ctx.blockConcurrencyWhile(async () => {
  await durable.initialize();
  await durable.reconcileAlarm();
});
// Supply durable.store and durable.scheduleAudit as deployment-owned callbacks
// to createSmallPaymentService, alongside independently reviewed capabilities.
// In the actual DO alarm handler:
await this.ready;
try {
  await service.alarm();
} finally {
  await durable.reconcileAlarm();
}
// No public initialization, synthetic configuration or recovery routes.
```

No production Worker/router, registry, signing source hash, policy, trust root,
budget, A2/A3/B switch or manifest was changed. This module is not yet in an
activated release manifest. New release/source hashes and separate native-provider
review remain mandatory before production integration; old #272 approval does
not cover this code. Keeping `policy.enabled=false` is intentional.

## Remaining chain gaps

- A2: actual independent signer deployments/keys, author/check attestations and
  a real harmless-document automatic-merge receipt. A manual merge is not this proof.
- A3: selected isolated deployment target and independently observed online version.
- Payment S3: production DO deployment, independent chain settlement and audit,
  authenticated budget evidence and immutable activation publication/readback.
- Escrow B: new project testnet deposit, release and timeout-refund transactions.
  Historical Aave transfers or this synthetic DO test cannot substitute.

Local tests or PR CI are not cloud deployment, native model audits, true escrow
transactions or payment activation. `paid=false`, `tx_hash=null`; no funds move.

## Claude PR #291 follow-up (GPT implementation)

C1/C2: a DO alarm is consumed before its handler runs. A handler that observes a
not-yet-overdue deadline can perform no ledger write; it must still reconcile the
alarm. Initialization validates an existing ledger without resetting or rearming
it, so the constructor must call `reconcileAlarm()` after `initialize()`. The
handler calls reconciliation in `finally`, including when runtime processing
throws. A storage outage can still prevent rearming; this is not a guarantee
against provider-wide outages or infinite alarm retry exhaustion.

The expanded workerd suite verifies an explicitly consumed early alarm, handler
exception, deleted-alarm reconciliation, a frozen ledger returning no alarm, and
constructor recovery after a persisted ledger is reopened. Early consumption and
the exception are deliberately injected through test-only routes; the existing
receipt/audit overdue tests still exercise actual automatic workerd alarms.

C3: the never-deployable fixture can now load host-generated **synthetic** public
activation evidence and run the actual runtime `submit()` through the SQLite
adapter and actual `scheduleAudit`. The fake executor checks the committed
reservation, dispatch status and exact scheduled alarm before it increments its
persistent test counter. The test consumes the real in-process permit but performs
no chain/RPC call. Settlement `paid:true` and a repeated fixed transaction hash are
synthetic test values only. Duplicate settlement claims and an executor throwing
with unknown outcome both persist `unknown_reconcile_no_retry`, freeze the
service and clear the alarm. Reopening workerd preserves those records and does
not invoke the fake executor again. No production signing key is generated or
exported; private keys exist only in ephemeral host test fixtures.

C4: recovery deliberately fails closed. This runtime has no reconciliation,
receipt-replacement or raw unlock API. Re-enabling an overdue, unreconciled ledger
would immediately freeze it again; an unknown transfer must never be retried or
silently marked confirmed merely to restore liveness. A future recovery path
would need source/transaction reconciliation bound to the original operation,
independent review evidence and the existing dual-signature/new-release lifecycle.
It is not implemented or enabled by this PR. Until that path is separately
reviewed and proven, an affected runtime remains held. This is an unresolved
production-liveness limit, not a new owner approval requirement.

The optional audit suggestions N1–N4 remain distinct: this patch does not add
cross-component monotonic ledger enforcement, a transitive-dependency lockfile,
provider-wide alarm timing guarantees, or a production deployment-manifest guard
against fixture inclusion. Current fixture paths remain test-only and must never
be added to a production Worker main/release. No production deployment or payment
acceptance is claimed by these local tests.
