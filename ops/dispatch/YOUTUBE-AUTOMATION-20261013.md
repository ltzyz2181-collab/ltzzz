# YouTube automatic publication — 2026-10-13

> Current readback: expected LTZZZ channel OAuth is connected. Owner-requested deletion of `6FZYG2_TLzE` succeeded in Actions run `40813717899`, attempt 1, source `f220c07df626f2d5ee93c4b615b35c12d64f7a4e`: Google DELETE 204 plus a fresh absent readback. Proof: `results/publishing/youtube-removal-40813717899-1.json`. The earlier OAuth and edge-runtime failures remain in their original receipts; they are not the current deletion state.
>
> Controller sequence: confirm current channel/authentication, reconcile existing day/hash receipts, run one existing workflow acceptance with a fresh public/processed/channel-matched verification, then observe one later `event=schedule` run. Preserve the original failure. Do not enable a second publishing cron or treat a manual rerun as scheduled acceptance. `localhost:8093` in another sandbox is not a persistent video source.
>
> Schedule correction: current workflow cron is `17 15 * * *` UTC; receipt business dates currently use `America/Tijuana`. The original text below described an older UTC date policy and older role/wallet states; use the current seat registry, authority configuration and wallet registry for those matters.

Owner: GPT integration; Doubao supplies future polished video artifacts; DeepSeek supplies evidence and scripts. Existing uploader performs publication with existing OAuth, without Manus or R2. Daily 15:17 UTC; one publication key per UTC date. Immediate first run triggered by [run-youtube-daily]. Successful acceptance requires video ID, public privacy, processed upload status, matching LTZZZ channel and receipt in results/publishing/youtube-daily-YYYY-MM-DD.json. A failed or uncertain upload must not be called published or blindly retried. Four animated infographic scenes, English synthetic narration, 30 seconds; not Manus's missing original video. Product link included. No paid model calls for rendering.

Claude: all paid external execution stopped. Free-only discussion via Hub manual conversation; do not use paid Anthropic API or restore signing seat.

Wallet: new Base treasury exists and is controlled by Worker signer, but last verified funds zero. Safe withdrawal needs actual threshold signatures; old Aave vault withdrawal needs its guardian signing channel. No claim of executed migration without transaction hashes.

## Owner-requested removal and template-repeat correction

Owner explicitly requested removal of Shorts `6FZYG2_TLzE` (expected LTZZZ channel `UCnKqseQ7uivSc7FN38ccRUA`); original publication remains recorded in `results/publishing/youtube-daily-2026-10-28.json`. Operation card: `YOUTUBE-AUTOMATION-20261013-REMOVE-6FZYG2_TLzE.json` in this directory. Only that video is authorized by this operation; historical receipts are not rewritten as if it never existed.

The authenticated exact-target removal checked the Google channel and recorded DELETE 204 with fresh absent readback. A source patch, queued job or HTTP 200 alone is not deletion proof. Actual outcome belongs in `results/publishing/youtube-removal-<run>-<attempt>.json`. Original asset bytes are blocked from re-upload by hash.

The existing daily workflow now requires a fresh prepared asset. It skips without one, records the blocker and no longer renders another generic ANS-template video as fallback. The original single cron remains; no second publisher/schedule is introduced. Prepared media whose bytes were already used is rejected even under a new date/name.

WorkBuddy's reported `ltzzz-daily-2026-10-29.mp4` is a media artifact label, not a statement of the user's local date. Publication business dates remain America/Tijuana. The script exists in Git. The share page was unreadable, but an authenticated R2 read later located the actual MP4/meta. Run `40814866842` verified the original hash and measured 768×1344, 15.083333 seconds, H.264 plus AAC; admission stopped on aspect ratio before any publication. Do not substitute the old renderer, label the new media published, or claim native DeepSeek/Kimi review without executor evidence.

Manus handoff remains separate from production acceptance. Latest inspected `results/publishing/manus-dispatch/2026-10-28.json` records `blocked_manus_api_not_configured`, remote_task_created=false and publication_verified=false. A share URL/local file or written inbox card cannot stand in for a Manus task ID and platform permalink.

The follow-up normalizes this exact source to 720×1280 with scale and padding, preserves the complete frame/AI label and copies AAC audio. Original MP4 and JSON are kept in R2. The original content hash is reserved before replacement to prevent a concurrent cron from publishing it; queue byte and metadata replacements use ETag checks. No AI rendering, `queue/run`, second cron, or Manus task is triggered. Admission still requires an actual deploy receipt and queue readback; automatic publication requires a later genuine cron and public/processed/channel-matched Google readback.
