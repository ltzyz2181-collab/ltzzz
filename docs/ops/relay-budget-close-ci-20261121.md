# Relay close CI verification note

This note is part of Task ID `RELAY-BUDGET-POSTCALL-CAP-20261120-01` and existing decision `GPT-DECISION-20261121-RELAY-PAID-LANE-CLOSE-01`.

The test suite intentionally checks only mocked state transitions and a synthetic pre-upstream refusal. It does not call a provider, read a secret value, top up, change caps, or release the paid-call HOLD.

The final PR head must pass the existing `Relay proxy guard tests (no models)` workflow, including `node --check scripts/relay-budget-close.mjs` and `node --test scripts/tests/relay-budget-close.test.mjs`, before merge. After merge, the separate issue-comment-gated workflow runs the same tests again before it can use the protected token to close the live seat.
