# YouTube automatic publication — 2026-10-13

> Current recovery: [youtube-recovery-current.json](../../results/publishing/youtube-recovery-current.json). The original task remains open. On 2026-10-26 UTC, a fresh public status read returned `GOOGLE_OAUTH_INVALID_GRANT`, `connected=false`, `reauth_required=true` for the expected LTZZZ channel. This is Google reauthorization required, not successful reconnection or publication.
>
> Owner action: open https://ltzzz-youtube-upload.ltzyz2181.workers.dev/auth/youtube and complete Google authorization for LTZZZ. No passwords, verification codes, tokens or private account material belong in chat or receipts.
>
> Controller sequence: confirm current channel/authentication, reconcile existing day/hash receipts, run one existing workflow acceptance with a fresh public/processed/channel-matched verification, then observe one later `event=schedule` run. Preserve the original failure. Do not enable a second publishing cron or treat a manual rerun as scheduled acceptance. `localhost:8093` in another sandbox is not a persistent video source.
>
> Schedule correction: current workflow cron is `17 15 * * *` UTC; receipt business dates currently use `America/Tijuana`. The original text below described an older UTC date policy and older role/wallet states; use the current seat registry, authority configuration and wallet registry for those matters.

Owner: GPT integration; Doubao supplies future polished video artifacts; DeepSeek supplies evidence and scripts. Existing uploader performs publication with existing OAuth, without Manus or R2. Daily 15:17 UTC; one publication key per UTC date. Immediate first run triggered by [run-youtube-daily]. Successful acceptance requires video ID, public privacy, processed upload status, matching LTZZZ channel and receipt in results/publishing/youtube-daily-YYYY-MM-DD.json. A failed or uncertain upload must not be called published or blindly retried. Four animated infographic scenes, English synthetic narration, 30 seconds; not Manus's missing original video. Product link included. No paid model calls for rendering.

Claude: all paid external execution stopped. Free-only discussion via Hub manual conversation; do not use paid Anthropic API or restore signing seat.

Wallet: new Base treasury exists and is controlled by Worker signer, but last verified funds zero. Safe withdrawal needs actual threshold signatures; old Aave vault withdrawal needs its guardian signing channel. No claim of executed migration without transaction hashes.
