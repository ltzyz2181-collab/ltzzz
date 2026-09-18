# LTZZZ Deployment Status

> This file records deployment state only. **No password, token, API secret, seed phrase, private key, OTP, CVV or full card number may ever be written here.**

## State meanings
- `CODE_COMMITTED` = code exists in GitHub
- `TASK_SENT` = task has been assigned to Doubao/cloud computer
- `EXECUTED` = cloud computer actually ran the task
- `DEPLOYED` = service was actually published
- `VERIFIED` = external access/function was tested successfully
- `NEEDS_CHECK` = claimed by an agent but not independently verified
- `BLOCKED` = requires a credential/permission/action that cannot be performed automatically

## Current records
| Component | State | Owner | Notes |
|---|---|---|---|
| LTZZZ AGI Roundtable UI | CODE_COMMITTED | GPT | Initial UI is in `app/agi-roundtable/index.html`; cloud deployment must be verified separately. |
| LTZZZ Web3 roadmap | CODE_COMMITTED | GPT | Planning document in `docs/web3-roadmap.md`. |
| Telegram bot basic send/receive | VERIFIED | LTZZZ | Existing conversation record reports a successful `LTZzz已收到` test. |
| Telegram webhook | NEEDS_CHECK | Doubao | Do not recreate if existing webhook works. Verify first. |
| Cloudflare Secrets | NEEDS_CHECK | Doubao | Secrets must remain only in Cloudflare secure secret storage. Never copy values into GitHub/chat/local files. |
| Daily automation | NEEDS_CHECK | GPT/Doubao | Must verify actual scheduled execution rather than assuming code equals deployment. |

## Credential persistence rule
1. Secrets are entered once into the designated secure provider secret store.
2. Local downloads are **not** the source of truth.
3. Before asking the user for any credential again, inspect the existing secure configuration and explain the exact failure reason.
4. If a credential is still valid, reuse it; do not request re-entry.
5. If a credential has expired/revoked/been deleted, stop and request only the minimum required user action; never ask the user to paste the secret into chat.
6. Every deployment task must record the non-secret existence/status of required credentials, never their values.

## No-repeat rule
A completed deployment/configuration must never be rebuilt merely because an agent lost track of it. Every agent must read this file and existing platform configuration before changing anything.

## Daily computer rule
Daily cloud-computer jobs are for **check / execute only when needed / verify / record**. They must not blindly redeploy or recreate credentials.

Last policy update: 2026-09-18