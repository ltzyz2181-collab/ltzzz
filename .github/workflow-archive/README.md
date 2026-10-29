# Archived workflow source

Files here are historical source, outside GitHub's executable `.github/workflows/` directory. They are not scheduled or callable workflows. The three retired entries uploaded fixed October 5/12 videos; one called YouTube directly without the current shared-queue idempotency checks.

Current operator entry points remain:

- `.github/workflows/queue-video-only.yml`: prepare a queue item without publication.
- `.github/workflows/youtube-daily-publish.yml`: existing daily prepared-media path.
- `.github/workflows/upload-video-s3-2026-10-15.yml`: retained operator compatibility path using the authenticated queue.

Original bytes, paths, Git blobs and recovery commit are recorded in `knowledge/results/repository-maintenance/cleanup-20261029.json`. Historical Actions runs and publication receipts are retained. Archiving an entry point does not close its original business task or prove a public delivery.
