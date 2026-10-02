# Proposal Template (used by LTZZZ agents)

Copy this structure when an AI wants to spend budget.

```json
{
  "id": "prop_<agent>_<NNN>",
  "agent": "<agent-name>",
  "did": "did:ltzzz:<agent>",
  "amount_usdc": 1,
  "currency": "USDC",
  "network": "base",
  "recipient": "<whitelisted-address>",
  "purpose": "What this spend buys for LTZZZ (acquisition/content/engineering/AI-hire-AI)",
  "hypothesis": "What you expect to learn or earn",
  "success_criteria": [
    "deliverable exists with receipt",
    "ledger txn linked to this proposal + tx_hash",
    "ROI: revenue in N days covers the spend"
  ],
  "earn_back_plan": {
    "sku_price_usd": 19,
    "break_even_orders": 1,
    "channel": "X outreach + products page + Gumroad/USDT"
  },
  "policy_refs": [
    "daily_usdc_cap",
    "single_tx_cap",
    "must use for LTZZZ earn path"
  ],
  "status": "proposed"
}
```

Rules:
- Amount must pass policy caps before execution.
- After execution, status flips to "confirmed" and a tx_hash + ledger_id are added.
- Missing receipt = the spend is treated as failed and reviewed.
