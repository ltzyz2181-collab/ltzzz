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

In the future reviewed deployment's private DO constructor:

```js
const durable = createDurablePaymentAdapters(ctx.storage);
ctx.blockConcurrencyWhile(() => durable.initialize());
// Supply durable.store and durable.scheduleAudit as deployment-owned callbacks
// to createSmallPaymentService, alongside independently reviewed capabilities.
// The actual DO alarm() must call service.alarm(). No public initialization route.
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
