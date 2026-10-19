import fs from 'node:fs';
import crypto from 'node:crypto';
import {pathToFileURL} from 'node:url';
export const TARGET = Object.freeze({name: '2026-10-19-rejection-is-evidence',
  sha256: '7d5e1809507e3cf80c581ab3cbf267b77412703ff1a913d63ddabfa782674a65', bytes: 1844718,
  title: 'LTZZZ: Rejection Is Evidence, Not Failure', channel: 'UCnKqseQ7uivSc7FN38ccRUA'});
const SCHEDULER = 'https://ltzzz-video-scheduler.ltzyz2181.workers.dev';
const UPLOADER = 'https://ltzzz-youtube-upload.ltzyz2181.workers.dev';
export async function publishExistingTarget({token, fetchImpl = fetch, sleep = ms => new Promise(r => setTimeout(r, ms)), polls = 24, save = () => {}} = {}) {
  const receipt = {name: TARGET.name, video_sha256: TARGET.sha256, bytes: TARGET.bytes, title: TARGET.title,
    source_producer_commit: '01e11a1ba74e1deacfb63e0261d0eadc060e3c00', run_id: process.env.GITHUB_RUN_ID || null,
    source_commit: process.env.GITHUB_SHA || null, at: new Date().toISOString(), published: false,
    model_calls: 0, new_wallet_payments: 0, queue_upload_requests: 0, queue_processing_requests: 0, new_upload_attempts: 0};
  const request = async (base, path, body) => {
    const response = await fetchImpl(base + path, {method: body ? 'POST' : 'GET', redirect: 'error',
      signal: AbortSignal.timeout(body ? 240000 : 30000),
      headers: base === SCHEDULER ? {Authorization: 'Bearer ' + token, ...(body ? {'Content-Type': 'application/json'} : {})} : {},
      ...(body ? {body: JSON.stringify(body)} : {})});
    let data; try {data = await response.json();} catch {throw Error('non_json_http_' + response.status);}
    if (!response.ok) throw Error('endpoint_http_' + response.status);
    return data;
  };
  const status = () => request(SCHEDULER, '/queue/status?sha256=' + TARGET.sha256);
  const verify = async prior => {
    if (!prior?.video_id) return false;
    if (!/^[A-Za-z0-9_-]{11}$/.test(prior.video_id)) throw Error('invalid_video_id');
    const v = await request(UPLOADER, '/youtube/verify?video_id=' + encodeURIComponent(prior.video_id));
    if (v.channel_id && v.channel_id !== TARGET.channel) throw Error('wrong_channel_do_not_publish');
    receipt.video_id = prior.video_id; receipt.url = 'https://www.youtube.com/watch?v=' + prior.video_id; receipt.verification = v;
    if (v.ok && v.published === true && v.channel_id === TARGET.channel && v.privacyStatus === 'public' && v.uploadStatus === 'processed') {
      receipt.published = true; receipt.phase = 'public_verified'; receipt.verified_at = new Date().toISOString();
      save(receipt); return true;
    }
    save(receipt); return false;
  };
  save(receipt);
  try {
    if (!token) throw Error('LTZZZ_AGENT_TOKEN_missing');
    let prior = (await status()).receipt;
    if (prior && prior.video_sha256 !== TARGET.sha256) throw Error('receipt_hash_mismatch');
    if (await verify(prior)) {receipt.resumed_existing_publication = true; save(receipt); return receipt;}
    const connected = await request(UPLOADER, '/youtube/status');
    if (!connected.connected || connected.channel_id !== TARGET.channel) throw Error('expected_channel_not_connected');
    const item = await request(SCHEDULER, '/queue/item?name=' + TARGET.name);
    if (!item.ok || item.queued !== true || item.video_sha256 !== TARGET.sha256 || item.bytes !== TARGET.bytes || item.metadata?.title !== TARGET.title)
      throw Error('exact_queue_item_not_verified_no_reupload');
    receipt.queue_readback_verified = true; receipt.phase = 'selected_queue_processing_requested'; receipt.queue_processing_requests = 1; save(receipt);
    const run = await request(SCHEDULER, '/queue/run', {name: TARGET.name});
    if (run.scanned !== 1 || !Array.isArray(run.results) || run.results.some(x => x.name !== TARGET.name)) throw Error('unexpected_queue_selection');
    if (!Number.isInteger(run.new_upload_attempts) || run.new_upload_attempts < 0 || run.new_upload_attempts > 1) throw Error('unexpected_upload_count');
    receipt.queue_run = run; receipt.new_upload_attempts = run.new_upload_attempts; save(receipt);
    for (let i = 0; i < polls; i++) {
      prior = (await status()).receipt;
      if (prior && prior.video_sha256 !== TARGET.sha256) throw Error('receipt_hash_mismatch');
      if (await verify(prior)) return receipt;
      if (['upload_uncertain', 'upload_started'].includes(prior?.state) && !prior.video_id) throw Error('upload_uncertain_reconcile_without_reupload');
      receipt.phase = prior?.state || 'waiting_for_receipt'; save(receipt);
      if (i + 1 < polls) await sleep(5000);
    }
    throw Error('public_state_not_verified_no_second_upload');
  } catch (error) {
    receipt.error = String(error.message).replaceAll(token || '__no_key__', '[redacted]').slice(0, 180);
    receipt.failed_at = new Date().toISOString(); save(receipt); throw error;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const destination = 'results/publishing/youtube-manual-2026-10-19-rejection-is-evidence.json';
  const save = receipt => {fs.mkdirSync('results/publishing', {recursive: true}); fs.writeFileSync(destination, JSON.stringify(receipt, null, 2) + '\n');};
  try {
    const bytes = fs.readFileSync('videos/' + TARGET.name + '.mp4');
    if (bytes.length !== TARGET.bytes || crypto.createHash('sha256').update(bytes).digest('hex') !== TARGET.sha256) throw Error('local_original_video_mismatch');
    const result = await publishExistingTarget({token: process.env.LTZZZ_AGENT_TOKEN, save});
    console.log('MANUAL_PUBLICATION_RECEIPT=' + JSON.stringify(result));
  } catch (error) {console.error('Manual publication not verified: ' + String(error.message).slice(0, 180)); process.exitCode = 1;}
}
