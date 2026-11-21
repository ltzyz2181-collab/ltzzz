# GPT-authorized relay paid-lane close

- Task ID: `RELAY-BUDGET-POSTCALL-CAP-20261120-01`
- Existing decision: `GPT-DECISION-20261121-RELAY-PAID-LANE-CLOSE-01`
- Primary issue: https://github.com/ltzyz2181-collab/ltzzz/issues/522
- Date: 2026-11-21 UTC

## Decision

Keep the paid relay lane on HOLD and close the Durable Object seat. This is a funds-spend control action already authorized by the GPT decision seat. It does not authorize any new paid calls, top-up, cap changes, fallback provider, or replay.

## Evidence after the 2026-11-20T19:39Z HOLD

The current main tree contains three later call receipts:

1. `20261121T025402Z-desktop_claude-gpt-6.1-sol-f8bea7f8.json`
   - request_id: `20261121025337187694903UZhgMjak`
   - HTTP 200; `model_served=gpt-6.1-sol`; actual provider/model unavailable
   - reported usage 1,396 prompt + 980 completion = 2,376 tokens
   - public-price usage estimate USD 0.009934; duration 27,112 ms
2. `20261121T025502Z-desktop_claude-claude-sonnet-4-6-57ebe4ef.json`
   - request_id: `20261121025501155096640iIhx69NM`
   - HTTP 503; `model_served`, actual provider/model, reported usage, and cost unavailable
   - no replay is authorized
3. `20261121T025543Z-desktop_claude-claude-opus-5-5-57ebe4ef.json`
   - request_id: `20261121025542949732574crNGJmjD`
   - HTTP 503; `model_served`, actual provider/model, reported usage, and cost unavailable
   - no replay is authorized

All three are recorded as third-party relay traffic (`official_provider_api=false`). The two 503 attempts must not be assumed free. The balance ledger was last updated at 02:54:02Z and does not include both 503 receipts. The repository seat mirror still said `status=open`; the last confirmed provider-console balance is stale (2026-11-12) and is not a current balance or official bill.

## Authorized execution boundary

- Use only the existing protected `RELAY_PROXY_ACCESS_TOKEN` GitHub Actions secret to authenticate to the already-deployed Worker.
- Read live `/v1/budget/state`; if open, issue one idempotent `POST /v1/budget/close`; read live state again.
- Send one synthetic, valid-shaped request to `/v1/chat/completions`. Acceptance requires the exact pre-upstream refusal `proxy_budget_refused_relay_seat_closed`, followed by a final state read showing `closed=true` and `active_reservations=0`.
- Update the local seat mirror to `status=closed` only after live close/readback is verified. Preserve the prior open snapshot in `last_open`; set the current balance field to null because no current provider-console balance is verified.
- Append a receipt with HTTP status, request identifiers, state readbacks, source SHA and workflow run. Never write the token value.

## Prohibited

No paid model generation, no provider fallback, no top-up, no unlimited key, no cap/floor changes, no automatic retry of an outcome-unknown request, and no claim that internal relay estimates are an official provider balance or bill.

## Reopen conditions

A separate GPT decision is required after a current provider-console balance is obtained and confirmed at or above the USD 3 reserve floor, all call receipts are reconciled (including the two 503 outcomes), and missing `actual_provider`/`actual_model` fields remain explicitly `unavailable` unless trusted upstream evidence exists. Existing caps remain USD 0.05/call, USD 0.50/day, USD 10/project; auto-top-up remains false.
