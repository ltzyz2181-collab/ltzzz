import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {reservation, executeReservation, loadPiSdk, stageRuntime} from './lib/pi-cloud.mjs';

export async function main({phase = process.argv[2], root = process.env.PI_RUNTIME_ROOT || process.cwd(), receiptRoot = process.env.PI_RECEIPT_ROOT || process.cwd(), env = process.env, sdkLoader = loadPiSdk} = {}) {
  if (phase === 'stage') return stageRuntime({root: receiptRoot, target: env.PI_RUNTIME_ROOT});
  const config = JSON.parse(fs.readFileSync(path.join(root, 'config/pi-cloud.json'), 'utf8'));
  const runId = env.GITHUB_RUN_ID;
  const candidate = reservation({root, config, sourceCommit: env.GITHUB_SHA, runId});
  const dir = path.join(receiptRoot, 'knowledge/results/pi-cloud');
  const file = path.join(dir, candidate.idempotency_key + '.json');
  const persist = receipt => { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(file, JSON.stringify(receipt, null, 2) + '\n'); };
  if (phase === 'prepare') {
    const exists = fs.existsSync(file);
    if (!exists) { fs.mkdirSync(dir, {recursive: true}); fs.writeFileSync(file, JSON.stringify(candidate, null, 2) + '\n', {flag: 'wx'}); }
    if (env.GITHUB_OUTPUT) fs.appendFileSync(env.GITHUB_OUTPUT, `execute=${!exists}\n`);
    return {execute: !exists, idempotency_key: candidate.idempotency_key, status: exists ? 'existing_reservation_or_result_no_replay' : candidate.status};
  }
  if (phase !== 'execute' || !fs.existsSync(file)) throw Error('pi_prepare_and_persist_required');
  const receipt = JSON.parse(fs.readFileSync(file, 'utf8'));
  const result = await executeReservation({root, config, receipt, runId, env, sdk: await sdkLoader(root), persist});
  return {status: result.status, calls_attempted: result.calls_attempted, idempotency_key: candidate.idempotency_key};
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { const result = await main(); console.log(JSON.stringify(result)); if (process.argv[2] === 'execute' && result.status !== 'two_provider_drafts_delivered_pending_independent_acceptance') process.exitCode = 1; }
  catch { console.error('pi_cloud_failed_no_automatic_retry'); process.exitCode = 1; }
}
