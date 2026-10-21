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
import {validateProposal,proposalHash} from './schema.mjs';
import {evaluateBreaker} from './circuit-breaker.mjs';
import {PANEL_LIMITS} from './limits.mjs';

function parseArgs(argv) {
  const out = {demo: false, proposal: null, votes: null, evidenceIndex: null, spendState: null, outDir: 'knowledge/results/panel'};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--demo') out.demo = true;
    else if (a === '--proposal') out.proposal = argv[++i];
    else if (a === '--votes') out.votes = argv[++i];
    else if (a === '--evidence-index') out.evidenceIndex = argv[++i];
    else if (a === '--spend-state') out.spendState=argv[++i];
    else if (a === '--out') out.outDir = argv[++i];
    else throw Error('unknown_shadow_option');
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
  const bound=validateProposal(proposal).proposal;
  const binding={proposal_id:bound.id,proposal_sha256:proposalHash(bound),at:new Date().toISOString()};
  const votes = [
    {...binding,provider: 'deepseek', vote: 'pass', reason_code: 'within_pilot_cap'},
    {...binding,provider: 'doubao', vote: 'pass', reason_code: 'evidence_ok'},
    {...binding,provider: 'qianwen', vote: 'reject', reason_code: 'want_more_data'}
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
    recentStepUps: [],
    spendState:args.demo?{pilot_total_usd:0,daily_external_usd:0,daily_outbound_usd:0}:args.spendState?JSON.parse(fs.readFileSync(args.spendState,'utf8')):undefined
  });

  const breaker = evaluateBreaker({
    funds_related_split_2_1: decision.tally?.funds_related_split === true,
    evidence_missing:decision.stage==='evidence',
    over_daily_external_cap:decision.step?.failures?.some(f=>['over_daily_external','over_daily_outbound','over_rah_pilot_total'].includes(f.code))===true
  });

  const report = {
    at: new Date().toISOString(),
    mode: 'shadow',
    applies: false,
    spending_authorized:false,
    provider_execution_verified:false,
    model_calls:0,
    limits_snapshot: PANEL_LIMITS,
    decision,
    breaker,
    paid: false,
    funds_moved: false,
    note: 'Shadow only — no limits changed, no RentAHuman live order, no secrets.'
  };

  fs.mkdirSync(args.outDir, {recursive: true});
  const outFile = path.join(args.outDir, `shadow-${Date.now()}-${crypto.randomUUID()}.json`);
  fs.writeFileSync(outFile, JSON.stringify(report, null, 2) + '\n',{flag:'wx'});
  console.log(JSON.stringify({execution_ok: true, outFile, decision_ok: decision.ok, breaker_tripped: breaker.tripped}, null, 2));
}

try {
  main();
} catch (e) {
  console.error(e);
  process.exit(1);
}
