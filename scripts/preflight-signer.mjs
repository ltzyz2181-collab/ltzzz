// Read-only signer capability preflight for the funded-order workflow.
//
// Purpose: run 42453653984 attempted the Aave/anchor funding step with no
// treasury signer configured (HTTP 422 treasury_signer_missing) after order
// fulfilment had already succeeded. This step proves capability BEFORE any
// funding request is sent, so nothing is retried and nothing is silently green.
//
// It performs one GET, writes an evidence receipt, and exports the state for the
// workflow so the funding steps can be skipped explicitly.
import fs from 'node:fs';
import crypto from 'node:crypto';
import { probeSignerCapability, fundingGate } from './lib/signer-readiness.mjs';

const origin = process.env.WEP3_ORIGIN || 'https://ltzzz-wep3.ltzyz2181.workers.dev';
const pin = process.env.WEP3_RUNNER_TOKEN
  || (process.env.CLOUDFLARE_API_TOKEN
    ? crypto.createHmac('sha256', process.env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex')
    : '');
const runId = process.env.GITHUB_RUN_ID || 'local';
const attempt = process.env.GITHUB_RUN_ATTEMPT || '1';

const evidence = await probeSignerCapability({ origin, pin });
const gate = fundingGate(evidence);
const receiptPath = `knowledge/results/wep3/signer-preflight-${runId}-attempt-${attempt}.json`;
const receipt = {
  ...evidence,
  run_id: runId,
  run_attempt: attempt,
  gate_allowed: gate.allowed,
  blocked_status: gate.blocked_status,
  note: 'Read-only capability check. No funding request was sent by this step.',
};

fs.mkdirSync('knowledge/results/wep3', { recursive: true });
fs.writeFileSync(receiptPath, JSON.stringify(receipt, null, 2) + '\n');

if (process.env.GITHUB_OUTPUT) {
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `state=${gate.state}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `blocked_status=${gate.blocked_status || 'none'}\n`);
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `path=${receiptPath}\n`);
}

console.log(JSON.stringify({ signer_state: gate.state, allowed: gate.allowed, receipt: receiptPath }));
