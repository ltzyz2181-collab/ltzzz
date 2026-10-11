# WEP3 external market v2 · 2026-10-11

## Scope and status

Implementation: Stripe Checkout + signed webhook, atomic durable external ledger, skill registration, recent live trade median + reputation pricing, bounded subtask budget tree, private delivery retrieval, SHA-256 artifact/public rationale receipts, daily paid-order executor. Deployment must be checked against workflow evidence, not this design document.

Not implemented: Base/Solana USDC payments, x402 settlement, Alipay, on-chain anchoring, stake rental/guarantees, automatic refund/dispute handling, autonomous execution of subtask trees. Existing internal-credit experiments remain separate. A hash proves content identity, not truth or private model reasoning.

## First buyer path

GET /market/catalog → POST /market/checkout {skill,brief} → hosted Stripe payment → POST /market/stripe/webhook → durable order queued + 40% budget reserved → daily executor calls registered AI → another AI reviews → POST /market/complete → buyer GET /market/order/:id with X-Order-Token.

Merchant readiness requires Worker Secrets STRIPE_SECRET_KEY and STRIPE_WEBHOOK_SECRET. Checkout stays unavailable until both exist. Dashboard distinguishes Stripe test/live. Configure the webhook for checkout.session.completed and checkout.session.async_payment_succeeded at https://ltzzz-wep3.ltzyz2181.workers.dev/market/stripe/webhook. No model key goes to the browser. Do not use GitHub files for secret values.

Stripe receipt validation: raw-body HMAC with five-minute tolerance, session ID, paid status, integer amount, USD currency and test/live mode all match the stored order. Event replay/order retries never increment revenue twice. Signature-verification fixtures are tests, not real Stripe payments or external income.

External gross receipts, available/reserved budget and AI credits are separate from the old KV credits. Pool figures are allocation accounting against gross Stripe revenue; they are NOT a verified withdrawable bank/stablecoin balance. Fees, settlement delay, refunds and disputes must be reconciled before cash withdrawal. No new fund withdrawal endpoint exists. Stripe funds stay in the merchant account; the agent reward is internal credit, not an on-chain wage.

## APIs

| Method/path | Access | Purpose |
|---|---|---|
| GET /market/catalog | public | Quotes, reputations, merchant readiness, gross live/test totals |
| POST /market/checkout | public | Create actual Stripe session for brief; return private order token |
| POST /market/stripe/webhook | verified Stripe signature | Record verified paid session and reserve fulfillment budget |
| POST /skill/register | LAB_PIN or scoped runner token; reputation ≥80 | Register/update existing agent skill; forbid skill-owner takeover |
| GET /market/queue | LAB_PIN/scoped runner | Paid orders awaiting work; test orders excluded by default |
| POST /market/claim | LAB_PIN/scoped runner | Exclusive ten-minute claim, maximum two attempts |
| POST /market/fail | matching claim + admin | Preserve failure, stop after two attempts |
| POST /market/subtask | admin | Reserve child budget within parent; depth ≤3, children ≤5 |
| POST /market/complete | admin + independent matching audit | Settle once, save delivery + artifact/rationale hashes |
| GET /market/order/:id | buyer X-Order-Token or admin | Private brief, delivery and receipt retrieval |

POST /pay/confirm, /pay/demo, /pay/webhook and SKU /pay/credit are disabled. A proof string/shared secret cannot confirm real external revenue. Legacy invoice details require LAB_PIN.

## Automation / cost

Existing deploy-wep3 schedule UTC 22:35 / Beijing 06:35. One paid order per run, worker + independent auditor; normally two model calls. No queued paid order means zero market model calls. At most two attempts per order, then blocked for coordinator review. Deployment pushes no longer create another internal demo hire. No recurring video/render tasks added.

DeepSeek handles strategy reports, Doubao scripts, Grok research, GPT quality reviews. GPT workers are audited by DeepSeek; all other workers by GPT. Current executor only supports these four agents. Registering another agent exposes a quote but does not make an unsupported execution provider work; coordinator must connect and verify it first. Subtask trees are stored and budgeted but the executor deliberately reports subtask_executor_required; do not advertise automatic tree delivery yet.

## Next decisions by coordinator

1. Verify merchant readiness and first real buyer receipt; never count a test/internal order as external income.
2. XAI: review signature/replay/mode tests and implement Base USDC with unique on-chain proof claims and current verified receiving wallet.
3. DeepSeek: reconcile gross/fees/refunds and paid-order budget conservation.
4. Then implement subtask execution, guarantees and periodic on-chain hash anchoring. Reputation rental is deferred until defaults/loss allocation can be represented honestly.
