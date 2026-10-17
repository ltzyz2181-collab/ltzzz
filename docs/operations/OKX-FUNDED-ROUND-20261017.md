# Fixed owner-authorized investment round

This change completes the existing `OWNER-FUNDED-20261017-01`, not a new investment round. Native GPT/Grok/Doubao/DeepSeek API calls are not needed to allocate the seats. Treasury custody remains with LTZZZ; seat accounting does not mean four independently controlled wallets.

## Capital route

1. Authenticated OKX APIs must still identify account hash `dc5657b650a7580e`, active `USDC-Base`, the native USDC contract, minimum deposit at most20USDC, and the selected funding-account deposit destination recorded in `inspection-39004684738-attempt-1.json`.
2. The Worker signs exactly one20USDC transfer to that frozen destination. It refuses arbitrary destinations, amounts, chains, paused state, pending Aave/anchor transactions or insufficient liquid liabilities reserve. The signed transaction stays in private DO storage. Aave and anchoring cannot consume its nonce while pending.
3. A deposit is confirmed only after a successful receipt with the exact native-USDC Transfer log and confirmations. Exchange credit separately requires the authenticated deposit-history entry matching hash, chain, recipient, amount and successful state.
4. A fixed `clientId` transfers exactly20USDC from funding6 to trading18 within the same account. Claims and submission-start state are committed before POST. Unknown outcomes are queried without submitting again. No exchange withdrawal, external recipient or subaccount operation is implemented.
5. A bounded USDC-USDT cash IOC sell converts the credited funds. Its actual net USDT proceeds cap the four BTC cash IOC budgets, at most20USDT total. Original reputation weights and all existing Aave intent IDs remain unchanged. Partial or zero conversion fills are never represented as20USDT available.

Capital transfer is neither revenue nor a wage. Real Aave supplies, exchange fills and the external service purchase have different settlement types. No investment return is guaranteed.

## Transport recovery

The Worker remains the sole signer. Authenticated, `Cache-Control: no-store` relay routes can hand a single already-persisted fixed signed transaction to the GitHub runner in memory. The runner independently checks chain, sender, destination, method, amount and hash before sending identical bytes to allowlisted Base RPCs. It never logs or archives raw envelopes and never signs a replacement.

The external service uses one fixed order `EXT-AI-20261017-001`. The GitHub runner obtains a free quote, the Worker validates its pinned recipient/asset/price and persists the reservation before signing, and only the first handoff can include a payment authorization. There is one paid HTTP attempt. Imported content is not proof of payment: native USDC Transfer and AuthorizationUsed logs must independently match. Failed or missing content is not accepted as delivered. Structural checks are not independent quality approval.

## Permission failures and retry

OKX permission rejection is recorded, not silently converted into success. A future run must reconcile existing IDs. Unknown submissions cannot be replaced. If a request was explicitly rejected, the record remains rejected until a reviewed recovery is provided. Enabling account-transfer permission alone is not evidence that a transfer occurred.

The existing daily cron remains dry-run. This change adds no repeating paid model or investment schedule. GitHub runner execution is not proof of the owner's Windows computer working without VPN.
