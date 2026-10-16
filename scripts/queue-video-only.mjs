import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';

const scheduler = 'https://ltzzz-video-scheduler.ltzyz2181.workers.dev';
const name = 'ltzzz-daily-2026-10-16';
const file = process.env.VIDEO_FILE || `videos/${name}.mp4`;
const metaFile = process.env.VIDEO_META || `videos/${name}.meta.json`;
const receiptPath = `results/publishing/video-queue-upload-${name}.json`;
const token = process.env.LTZZZ_AGENT_TOKEN;
const receipt = {
  name,
  file,
  meta_file: metaFile,
  uploaded_to_queue: false,
  published: false,
  model_calls: 0,
  at: new Date().toISOString(),
};

function save() {
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');
}

function withinRepository(filePath) {
  const root = process.cwd() + path.sep;
  return path.resolve(filePath).startsWith(root);
}

async function main() {
  if (!token) throw Error('LTZZZ_AGENT_TOKEN_missing');
  if (!withinRepository(file) || !withinRepository(metaFile)) throw Error('asset_outside_repository');
  if (!fs.existsSync(file) || !fs.existsSync(metaFile)) throw Error('video_or_metadata_missing');

  const bytes = fs.readFileSync(file);
  if (!bytes.length || bytes.length > 25 * 1024 * 1024) throw Error('invalid_video_size');
  const hash = crypto.createHash('sha256').update(bytes).digest('hex');
  const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
  if (meta.video_sha256 !== hash) throw Error('video_hash_mismatch');
  if (meta.generation_method !== 'ffmpeg-local-fallback' || meta.model_calls !== 0) {
    throw Error('unexpected_generation_metadata');
  }

  const probe = JSON.parse(execFileSync('ffprobe', [
    '-v', 'error', '-show_streams', '-show_format', '-of', 'json', file,
  ], {encoding: 'utf8'}));
  const video = probe.streams.find(stream => stream.codec_type === 'video');
  const audio = probe.streams.find(stream => stream.codec_type === 'audio');
  const duration = Number(probe.format.duration);
  if (!video || !audio || video.width * 16 !== video.height * 9 || duration < 15 || duration > 30) {
    throw Error('video_specs_invalid');
  }
  Object.assign(receipt, {
    video_sha256: hash,
    bytes: bytes.length,
    media: {width: video.width, height: video.height, duration_seconds: duration},
  });
  save();

  const healthResponse = await fetch(scheduler + '/health', {signal: AbortSignal.timeout(30000)});
  const health = await healthResponse.json();
  if (!healthResponse.ok || !health.ok || health.service !== 'ltzzz-video-scheduler' ||
      health.version !== 'v3-verified-queue' || !health.cron_configured ||
      !health.queue_upload_authenticated) {
    throw Error('scheduler_health_not_ready');
  }
  receipt.scheduler_health = {
    ok: health.ok,
    version: health.version,
    cron_configured: health.cron_configured,
    queue_upload_authenticated: health.queue_upload_authenticated,
  };

  const form = new FormData();
  form.set('video', new Blob([bytes], {type: 'video/mp4'}), path.basename(file));
  form.set('meta', JSON.stringify({...meta, video_sha256: hash}));
  receipt.phase = 'queue_upload_started';
  save();
  const uploadResponse = await fetch(`${scheduler}/queue/upload/${name}`, {
    method: 'POST',
    headers: {Authorization: `Bearer ${token}`},
    body: form,
    signal: AbortSignal.timeout(180000),
  });
  let upload;
  try {
    upload = await uploadResponse.json();
  } catch {
    throw Error(`queue_upload_non_json_http_${uploadResponse.status}`);
  }
  receipt.queue_upload_response = upload;
  if (!uploadResponse.ok || !upload.ok || upload.status !== 'queued' ||
      upload.name !== name || upload.video_sha256 !== hash || upload.bytes !== bytes.length) {
    receipt.phase = 'queue_upload_not_confirmed';
    save();
    throw Error(`queue_upload_not_confirmed_http_${uploadResponse.status}`);
  }

  receipt.uploaded_to_queue = true;
  receipt.phase = 'queued';
  receipt.queue_keys = [`queue/${name}.mp4`, `queue/${name}.meta.json`];

  const statusResponse = await fetch(`${scheduler}/queue/status?sha256=${hash}`, {
    headers: {Authorization: `Bearer ${token}`},
    signal: AbortSignal.timeout(30000),
  });
  let status;
  try {
    status = await statusResponse.json();
  } catch {
    throw Error(`queue_status_non_json_http_${statusResponse.status}`);
  }
  if (!statusResponse.ok || !status.ok) throw Error(`queue_status_failed_http_${statusResponse.status}`);
  receipt.read_only_queue_status = status.receipt || null;
  receipt.published = status.receipt?.state === 'published';
  receipt.at = new Date().toISOString();
  save();

  if (receipt.published) {
    throw Error('video_published_before_cron_check');
  }
  console.log(JSON.stringify({
    uploaded_to_queue: receipt.uploaded_to_queue,
    published: receipt.published,
    video_sha256: hash,
    queue_keys: receipt.queue_keys,
    receipt: receiptPath,
  }));
}

try {
  await main();
} catch (error) {
  receipt.error = String(error.message || error).slice(0, 250);
  receipt.failed_at = new Date().toISOString();
  save();
  console.error(receipt.error);
  process.exitCode = 1;
}
