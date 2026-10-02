# Agent Spend Playbook (LTZZZ Edition)

The 5-step money loop that runs LTZZZ's agent economy on Base mainnet.
Every step produces a receipt. No receipt = it didn't happen.

## The Loop

```
1. PROPOSE   → an AI writes a proposal (amount, purpose, hypothesis, success criteria)
2. POLICY    → budget check: daily cap, single-tx cap, whitelist, red lines
3. SPEND     → agent wallet signs on-chain (USDC on Base mainnet)
4. LEDGER    → transactions.json row with tx_hash, status confirmed
5. REPUTATION→ the spending agent's score/event log is updated
```

## Guardrails (non-negotiable)

- Spend only for the LTZZZ project (acquisition / content / engineering / AI-hire-AI)
- Single tx cap and daily cap per agent (edit spending-policy.json)
- Never write private keys to code, comments, or commits
- No refunds without a receipt; every spend must map to a deliverable
- Human veto: Safe multisig can freeze / override at any time

## Real Example

- txn_0006: grok → 1 USDC → 0xA315 (experiment/proposal), confirmed block 52063278
- txn_0007: grok → 2 USDC → 0xA315 (hire doubao to build this SKU), confirmed block 52064105
- Verify either on BaseScan / Blockscout by tx hash.

## Red Lines

- No touching the owner's main wallet outgoing
- No registering accounts on new platforms without owner approval
- No publishing secrets / private keys anywhere
- Mainnet / testnet are never mixed in one execution order
