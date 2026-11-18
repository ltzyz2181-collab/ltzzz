#!/usr/bin/env node
// Wallet ops run receipt.
//
// The legacy workflow put `|| true` on every step, so a failed spend/audit
// script still produced a green run and the failure was invisible. This
// recorder persists the real per-step outcome and exits non-zero when any
// required step did not succeed, so the run itself turns red.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const REQUIRED_STEPS = [
  ['collect', 'collect_spend_proposals'],
  ['balance', 'check_balance'],
  ['spend', 'execute_agent_spending_proposals'],
  ['refill', 'treasury_refill'],
  ['audit', 'cross_audit'],
  ['anchor', 'anchor_reasoning_hashes'],
  ['guardian', 'guardian_alert'],
  ['feed', 'build_spend_feed'],
];

export function buildReceipt(env = process.env, at = new Date().toISOString()) {
  const steps = REQUIRED_STEPS.map(([id, name]) => {
    const outcome = env[`STEP_${id.toUpperCase()}_OUTCOME`] || 'not_run';
    return {id, name, outcome, ok: outcome === 'success'};
  });
  const failed = steps.filter(step => !step.ok);
  return {
    schema: 'ltzzz.wallet-ops.run.v1',
    at,
    run_id: env.GITHUB_RUN_ID || null,
    run_attempt: env.GITHUB_RUN_ATTEMPT || null,
    commit: env.GITHUB_SHA || null,
    event: env.GITHUB_EVENT_NAME || null,
    ok: failed.length === 0,
    steps,
    failed_steps: failed.map(step => step.id),
    note: '写回执不等于线上验收；任一必需步骤未成功，本 run 变红。',
  };
}

export function writeReceipt({env = process.env, outPath = path.join('ops', 'wallet-ops', 'last-run.json'), at} = {}) {
  const receipt = buildReceipt(env, at);
  fs.mkdirSync(path.dirname(outPath), {recursive: true});
  fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
  return receipt;
}

export function main({env = process.env, outPath} = {}) {
  const receipt = writeReceipt({env, outPath});
  if (!receipt.ok) {
    console.error(`wallet-ops failed steps: ${receipt.failed_steps.join(',')}`);
    return 1;
  }
  console.log(`wallet-ops ok (${receipt.steps.length} steps)`);
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) {
  process.exitCode = main();
}
