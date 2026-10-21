#!/usr/bin/env node
/**
 * Shadow-mode panel runner.
 * Reads a proposal JSON + votes JSON, runs regulator + optional breaker,
 * writes a receipt under knowledge/results/panel/.
 * NEVER applies limit changes or moves funds.
 *
 * Usage:
 *   node scripts/panel/shadow-run.mjs --proposal path.json --votes path.json
 *   node scripts/panel/shadow-run.mjs --demo
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {regulate} from './regulator.mjs';
import {evaluateBreaker} from './circuit-breaker.mjs';
import {PANEL_LIMITS} from './limits.mjs';

function parseArgs(argv) {
  const out = {demo: false, proposal: null, votes: null, evidenceIndex: null, outDir: 'knowledge/results/panel'};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') out.demo = true;
    else if (a === '--proposal') out.proposal = argv[++i];
    else if (a === '--votes') out.votes = argv[++i];
    else if (a === '--evidence-index') out.evidenceIndex = argv[++i];
    else if (a === '--out') out.outDir = argv[++i];
  }
  return out;
}

function demoBundle() {
  const receiptPath = 'knowledge/results/panel/demo-evidence.json';
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  const evidenceBody = {demo: true, at: new Date().toISOString(), note: 'shadow-only fixture'};
  fs.writeFileSync(receiptPath, JSON.stringify(evidenceBody, null, 2) + '\n');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(receiptPath)).digest('hex');
  const proposal = {
    id: 'PROP-shadow-demo-' + Date.now().toString(36),
    kind: 'rentahuman_pilot',
    proposer_seat: 'claude',
    proposer_provider: 'claude',
    requested: {amount_usd: 2, task: 'digital_public_info_dry_run'},
    evidence: [{receipt_id: 'demo-evidence', path: receiptPath, hash}],
    created_at: new Date().toISOString()
  };
  const votes = [
    {provider: 'deepseek', vote: 'pass', reason_code: 'within_pilot_cap'},
    {provider: 'doubao', vote: 'pass', reason_code: 'evidence_ok'},
    {provider: 'qianwen', vote: 'reject', reason_code: 'want_more_data'}
  ];
  return {proposal, votes, evidenceIndex: {}};
}

function main() {
  const args = parseArgs(process.argv);
  let proposal, votes, evidenceIndex = {};
  if (args.demo) {
    const d = demoBundle();
    proposal = d.proposal;
    votes = d.votes;
  } else {
    if (!args.proposal || !args.votes) {
      console.error('Need --demo or --proposal and --votes');
      process.exit(2);
    }
    proposal = JSON.parse(fs.readFileSync(args.proposal, 'utf8'));
    votes = JSON.parse(fs.readFileSync(args.votes, 'utf8'));
    if (args.evidenceIndex) {
      evidenceIndex = JSON.parse(fs.readFileSync(args.evidenceIndex, 'utf8'));
    }
  }

  const decision = regulate(proposal, votes, {
    mode: 'shadow',
    rootDir: process.cwd(),
    evidenceIndex,
    currentLimitUsd: 5,
    recentStepUps: []
  });

  const breaker = evaluateBreaker({
    funds_related_split_2_1: decision.tally?.funds_related_split === true
  });

  const report = {
    at: new Date().toISOString(),
    mode: 'shadow',
    applies: false,
    limits_snapshot: PANEL_LIMITS,
    decision,
    breaker,
    paid: false,
    funds_moved: false,
    note: 'Shadow only — no limits changed, no RentAHuman live order, no secrets.'
  };

  fs.mkdirSync(args.outDir, {recursive: true});
  const outFile = path.join(args.outDir, `shadow-${Date.now()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ok: true, outFile, decision_ok: decision.ok, breaker_tripped: breaker.tripped}, null, 2));
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
