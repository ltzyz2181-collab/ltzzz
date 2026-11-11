import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { evaluateAcceptance, evaluateFromDisk } from '../lib/relay-seat-acceptance.mjs';

const spec = JSON.parse(fs.readFileSync(new URL('../../config/relay-seat-acceptance.json', import.meta.url), 'utf8'));

function callDoc(overrides = {}) {
  return {
    kind: 'relay_seat_call',
    ok: true,
    http: 200,
    finish_reason: 'stop',
    at: '2026-11-11T10:00:00.000Z',
    requested_at: '2026-11-11T09:59:34.000Z',
    request_id: 'req_' + Math.random().toString(36).slice(2, 10),
    request_id_source: 'header:x-request-id',
    model_served: 'claude-opus-5-5',
    station_model: 'claude-opus-5-5',
    model_class: 'claude',
    official_provider_api: false,
    key_transport: 'ltzzz_proxy',
    effects: {
      business_task_completed: false,
      authority_effect: 'none',
      funds_or_signature_surface: false,
      production_write: false,
    },
    usage: { prompt_tokens_billed: 8589, prompt_tokens_reported: 0, completion_tokens: 252 },
    cost_usd: 0.029799,
    duration_ms: 25913,
    ...overrides,
  };
}

function docs() {
  return {
    calls: [
      { file: 'calls/a.json', doc: callDoc() },
      { file: 'calls/b.json', doc: callDoc({ model_served: 'gpt-6.1-sol', station_model: 'gpt-6.1-sol', model_class: 'gpt', cost_usd: 0.012, usage: { prompt_tokens_billed: 8000, completion_tokens: 120 } }) },
      {
        file: 'calls/c.json',
        doc: callDoc({ ok: false, http: null, finish_reason: null, cost_usd: null, request_id: null, usage: { prompt_tokens_billed: null, completion_tokens: null }, failure: { name: 'TypeError', message: 'fetch failed', code: 'UND_ERR_SOCKET' } }),
      },
    ],
    refusals: [
      { file: 'refusals/short.json', doc: { kind: 'relay_seat_refusal', sent_http_request: false, key_transport: 'not_used_before_http', decision: { code: 'relay_short_request_forbidden', allowed: false }, official_provider_api: null } },
      { file: 'refusals/floor.json', doc: { kind: 'relay_seat_refusal', sent_http_request: false, key_transport: 'not_used_before_http', decision: { code: 'relay_balance_below_floor', allowed: false, requires_close: true } } },
    ],
  };
}

test('all criteria pass gives an accepted verdict', () => {
  const report = evaluateAcceptance({ spec, ...docs() });
  assert.equal(report.verdict, 'accepted');
  assert.equal(report.counts.fail, 0);
  assert.equal(report.counts.insufficient, 0);
});

test('a Claude-only campaign cannot claim class routing coverage', () => {
  const input = docs();
  input.calls = input.calls.filter((entry) => entry.doc.model_class !== 'gpt');
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'insufficient_evidence');
  assert.ok(report.blocked_by.includes('class_routing_verified'));
});

test('missing request id blocks request identity', () => {
  const input = docs();
  input.calls[0].doc.request_id = null;
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'insufficient_evidence');
  assert.ok(report.blocked_by.includes('request_identity_recorded'));
});

test('a call that claims business completion fails acceptance', () => {
  const input = docs();
  input.calls[0].doc.effects.business_task_completed = true;
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'not_accepted');
  assert.ok(report.blocked_by.includes('not_counted_as_business_task'));
});

test('a funds or production surface fails acceptance', () => {
  const input = docs();
  input.calls[0].doc.effects.funds_or_signature_surface = true;
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'not_accepted');
  assert.ok(report.blocked_by.includes('no_funds_signature_production'));
});

test('key material in evidence fails acceptance', () => {
  const input = docs();
  input.calls[0].doc.note = 'Authorization: Bearer sk-abcdef123456';
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'not_accepted');
  assert.ok(report.blocked_by.includes('key_boundary_respected'));
});

test('a relay call marked as official provider fails acceptance', () => {
  const input = docs();
  input.calls[1].doc.official_provider_api = true;
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'not_accepted');
  assert.ok(report.blocked_by.includes('key_boundary_respected'));
});

test('failure-mode coverage needs refusal, floor and network evidence', () => {
  const input = docs();
  input.refusals = input.refusals.filter((entry) => !entry.file.includes('floor'));
  const report = evaluateAcceptance({ spec, ...input });
  assert.equal(report.verdict, 'insufficient_evidence');
  assert.ok(report.blocked_by.includes('failure_modes_verified'));
});

test('an empty evidence directory fails closed with no free pass', () => {
  const report = evaluateAcceptance({ spec, calls: [], refusals: [] });
  assert.equal(report.verdict, 'not_accepted');
  assert.equal(report.counts.pass, 0);
});

test('evaluateFromDisk reads the real spec and returns not_accepted on an empty repo fixture', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-acceptance-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.writeFileSync(path.join(root, 'config/relay-seat-acceptance.json'), JSON.stringify(spec));
  fs.mkdirSync(path.join(root, 'knowledge/results/relay-seat/calls'), { recursive: true });
  fs.mkdirSync(path.join(root, 'knowledge/results/relay-seat/refusals'), { recursive: true });
  const report = evaluateFromDisk(root);
  assert.equal(report.verdict, 'not_accepted');
  fs.rmSync(root, { recursive: true });
});

function execFixture(verdict) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-relay-gate-'));
  fs.mkdirSync(path.join(root, 'config'), { recursive: true });
  fs.mkdirSync(path.join(root, 'knowledge/results/relay-seat'), { recursive: true });
  fs.copyFileSync(new URL('../../config/relay-seat-policy.json', import.meta.url), path.join(root, 'config/relay-seat-policy.json'));
  fs.writeFileSync(path.join(root, 'knowledge/results/relay-seat/balance-ledger.json'), JSON.stringify({ baseline: { balance_usd: 13, confirmed_at: 'fixture' }, entries: [] }));
  fs.writeFileSync(path.join(root, 'knowledge/results/relay-seat/seat-state.json'), JSON.stringify({ status: 'open', balance_usd: 13, floor_usd: 3, closed_at: null }));
  fs.writeFileSync(path.join(root, 'prompt.txt'), 'x'.repeat(5000));
  if (verdict) fs.writeFileSync(path.join(root, 'knowledge/results/relay-seat/acceptance-verdict.json'), JSON.stringify({ verdict }));
  return root;
}

function runExecutor(root, purpose, model) {
  const script = new URL('../relay-seat.mjs', import.meta.url).pathname;
  const result = spawnSync(process.execPath, [script, '--call', '--prompt-file', './prompt.txt', '--model', model, '--purpose', purpose], { cwd: root, encoding: 'utf8' });
  return { code: result.status, out: result.stdout || '', err: result.stderr || '' };
}

test('generation without an accepted verdict is refused before any HTTP request', () => {
  const root = execFixture(null);
  const { code, out } = runExecutor(root, 'generation', 'claude-opus-5-5');
  assert.equal(code, 2);
  assert.ok(out.includes('relay_acceptance_not_passed'), out);
  assert.equal(fs.existsSync(path.join(root, 'knowledge/results/relay-seat/calls')), false);
  fs.rmSync(root, { recursive: true });
});

test('an accepted verdict opens the gate and the routing guard still applies', () => {
  const root = execFixture('accepted');
  const { code, out } = runExecutor(root, 'generation', 'gpt-6-sol');
  assert.equal(code, 2);
  assert.ok(out.includes('relay_model_not_allowlisted'), out);
  fs.rmSync(root, { recursive: true });
});

test('acceptance probes bypass the verdict gate but are stamped as probes', () => {
  const root = execFixture(null);
  const { code, out } = runExecutor(root, 'acceptance_probe', 'gpt-6-sol');
  assert.equal(code, 2);
  assert.ok(out.includes('relay_model_not_allowlisted'), out);
  assert.ok(!out.includes('relay_acceptance_not_passed'), out);
  fs.rmSync(root, { recursive: true });
});
