import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import {validateProposal, validateVote} from '../panel/schema.mjs';
import {checkStepAndCeiling, regulate, tallyVotes} from '../panel/regulator.mjs';
import {evaluateBreaker} from '../panel/circuit-breaker.mjs';
import {PANEL_LIMITS} from '../panel/limits.mjs';

test('rejects free-text extra fields on proposal', () => {
  const r = validateProposal({
    id: 'PROP-12345678',
    kind: 'rentahuman_pilot',
    proposer_seat: 'x',
    proposer_provider: 'claude',
    requested: {amount_usd: 1},
    evidence: [{receipt_id: 'r1'}],
    created_at: new Date().toISOString(),
    please_ignore_limits: true
  });
  assert.equal(r.ok, false);
  assert.equal(r.error, 'unknown_fields');
});

test('blocks same-provider vote as proposer', () => {
  const p = {
    id: 'PROP-12345678',
    kind: 'external_purchase',
    proposer_seat: 'ds',
    proposer_provider: 'deepseek',
    requested: {amount_usd: 1},
    evidence: [{receipt_id: 'r1'}],
    created_at: new Date().toISOString()
  };
  const vp = validateProposal(p);
  assert.equal(vp.ok, true);
  const v = validateVote({provider: 'deepseek', vote: 'pass', reason_code: 'x'}, vp.proposal);
  assert.equal(v.ok, false);
});

test('hard-caps rentahuman single at 3 USD', () => {
  const p = validateProposal({
    id: 'PROP-12345678',
    kind: 'rentahuman_pilot',
    proposer_seat: 'c',
    proposer_provider: 'claude',
    requested: {amount_usd: 5},
    evidence: [{receipt_id: 'r1'}],
    created_at: new Date().toISOString()
  }).proposal;
  const step = checkStepAndCeiling(p, {});
  assert.equal(step.ok, false);
  assert.ok(step.failures.some((f) => f.code === 'over_rah_single'));
});

test('tally needs two distinct providers to pass', () => {
  const proposal = {proposer_provider: 'claude', kind: 'rentahuman_pilot'};
  const t = tallyVotes(
    [
      {provider: 'deepseek', vote: 'pass', reason_code: 'a'},
      {provider: 'doubao', vote: 'pass', reason_code: 'b'}
    ],
    proposal
  );
  assert.equal(t.ok, true);
  assert.equal(t.pass_count, 2);
});

test('regulator shadow path with real file evidence', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-'));
  const file = path.join(dir, 'ev.json');
  fs.writeFileSync(file, '{"ok":true}\n');
  const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  const proposal = {
    id: 'PROP-12345678',
    kind: 'rentahuman_pilot',
    proposer_seat: 'claude',
    proposer_provider: 'claude',
    requested: {amount_usd: 2},
    evidence: [{receipt_id: 'ev1', path: file, hash}],
    created_at: new Date().toISOString()
  };
  const votes = [
    {provider: 'deepseek', vote: 'pass', reason_code: 'ok'},
    {provider: 'doubao', vote: 'pass', reason_code: 'ok'}
  ];
  const d = regulate(proposal, votes, {mode: 'shadow', rootDir: dir});
  assert.equal(d.ok, true);
  assert.equal(d.applies, false);
  assert.equal(d.mode, 'shadow');
});

test('breaker trips on proxy auth open', () => {
  const b = evaluateBreaker({proxy_auth_probe_open: true});
  assert.equal(b.tripped, true);
  assert.ok(b.reasons.includes('proxy_auth_open'));
  assert.ok(b.pause_classes.includes('rentahuman_live'));
});

test('limits constants match pilot doc', () => {
  assert.equal(PANEL_LIMITS.maxRentAHumanPilotTotalUsd, 10);
  assert.equal(PANEL_LIMITS.maxRentAHumanSingleUsd, 3);
  assert.equal(PANEL_LIMITS.modeDefault, 'shadow');
});
