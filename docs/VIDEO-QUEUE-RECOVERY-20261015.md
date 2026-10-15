# YouTube queue recovery — 2026-10-15

## Observed failure

- Direct R2 object upload run `38699562925` failed with HTTP 403 / Cloudflare authentication error 10000.
- S3 run `38700397947` had neither R2 access-key variable set and failed with “Unable to locate credentials”. Repeating either unchanged cannot enqueue the video.
- YouTube OAuth is connected to channel `UCnKqseQ7uivSc7FN38ccRUA`. Fresh verification of `yl6sZdGzY0A` confirmed public and processed. This is evidence that earlier automatic publication worked; it is not proof that the prepared October 15 file was published.
- `dmnEObXlHU4` was private at inspection, despite the older status label “published”. It is a different asset and is outside this recovery publication.

## Recovery

Use the scheduler's **existing** R2 binding for authenticated queue ingress. This does not add R2 permissions to `CLOUDFLARE_API_TOKEN` and does not create S3 credentials. A private service binding forwards the actual stored bytes to the existing YouTube uploader; public R2 URLs and cross-Worker public fetches are unnecessary.

The canonical one-off workflow remains `.github/workflows/upload-video-s3-2026-10-15.yml` for existing operator links, but it now uses this authenticated queue API, not S3. The former direct-R2 workflow is a manual compatibility entry that calls the same workflow. Existing `LTZZZ_AGENT_TOKEN` is read inside CI; no credential value is printed or requested in chat.

The prepared MP4 is reused unchanged: `videos/ltzzz-daily-2026-10-15.mp4`, 3,770,873 bytes, 720×1280, audio present, duration 15.071995 seconds, SHA-256 `ff7a539ed796b05db2d54416e59362ad50784738f6c54afcd7efbd5b76a215ab`. Its supplied title and description are retained as historical pipeline-test content. No rendering or model call is needed.

## Success and retries

- Queue ingress verifies the content hash and writes the metadata pointer after the video.
- R2 conditional claims prevent concurrent new uploads of the same content. All retry paths use the same content-hash publication key.
- An uncertain response is held for reconciliation against the uploader receipt, never blindly reuploaded.
- A returned video ID means uploaded, not publicly published. Fresh Google-backed verification must show **public**, **processed**, and the expected channel.
- Both MP4 and metadata archive only after verification. Confirmation is persisted before cleanup, so a cleanup failure does not create another upload.
- Every actual one-off attempt archives a run/attempt-specific JSON receipt on success or failure. Missing verification is a failed or pending result.

## Existing automatic operation

The scheduler retains `0 14 * * *` UTC. The existing GitHub daily workflow retains `17 15 * * *` UTC (currently 07:00 and 08:17 in America/Tijuana, respectively). No cron or paid-model schedule is added. The daily job prefers an already prepared video; its existing free renderer runs only when that day's ready file is absent. It uses the same queue and can process a newly queued file immediately, so a file arriving after the scheduler's daily tick does not wait another day.

Deployment readiness checks upload nothing. They check version/capabilities, anonymous denial, and authenticated receipt lookup, with bounded retries for Cloudflare propagation.

## Verification boundaries

20 automated tests cover queue authorization, private/processing/wrong-channel rejection, content claims, uncertain responses, cleanup recovery, and client receipt handling. These use mocked network responses and are not real YouTube publication evidence. Actual run receipts and the verified public URL must be recorded separately after the prepared-file workflow runs. TikTok, wallets, funds, and model-provider configuration are not changed by this work.
