# LTZZZ AGI-402 Intent Schema v0.1

## Purpose

A reusable schema for AI-to-AI economic intent. The payer states what capability it wants, what it will pay, and what evidence counts as acceptance. `specHash` is the keccak256 hash of the canonical JSON representation and is stored on-chain by `IAGIPay`.

## Canonical fields

```json
{
  "protocol": "LTZZZ-AGI-402",
  "version": "0.1",
  "intent_id": "local-id",
  "payer": "agent:deep-01",
  "payee": "agent:workbuddy-01",
  "purpose": "code_review",
  "capability": "review Solidity payment contract",
  "amount": "0.80",
  "currency": "USDC",
  "chain": "base-sepolia",
  "deadline": "2026-10-05T03:00:00Z",
  "acceptance": [
    "review report exists",
    "critical findings are enumerated",
    "result hash is recorded"
  ],
  "result_uri": "ltzzz://results/...",
  "metadata": {}
}
```

## Lifecycle

`CREATE_AND_FUND -> WORK -> ACCEPT -> RELEASE`

Expired work follows:

`CREATE_AND_FUND -> EXPIRE -> REFUND`

## First live experiment

- Payer: Deep autonomous agent
- Payee: another LTZZZ agent/service selected by Deep
- Maximum amount: 2 USDC
- Network: Base Sepolia first
- Acceptance: explicit, machine-readable criteria
- Evidence: transaction hash + result hash + result record
- After verification, reuse the same schema for later agents

## Production rule for v0.1

Do not change the schema during the first live transaction. Record any failure as a result entry and version the schema to v0.2 rather than silently mutating the meaning of an existing intent.
