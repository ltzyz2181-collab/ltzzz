import test from 'node:test';
import assert from 'node:assert/strict';
import { classifySignerResponse, probeSignerCapability, fundingGate } from '../lib/signer-readiness.mjs';

const origin = 'https://fixture.example';
const pin = 'fixture-private-pin';
const json = body => new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });

test('ready requires the explicit contract: configured AND control_verified', async () => {
  const e = await probeSignerCapability({
    origin, pin,
    fetcher: async () => json({
      ok: true, schema: 'ltzzz.treasury-signer-status.v1', revision: 'wep3-signer-status-v1',
      signer: { configured: true, control_verified: true, scope: 'aave_supply', chain_id: 8453 },
    }),
  });
  assert.equal(e.state, 'ready');
  assert.equal(e.reason, 'explicit_contract_ready');
  assert.equal(fundingGate(e).allowed, true);
  assert.equal(e.funding_attempted, false);
  assert.equal(e.on_chain_executed, false);
  assert.equal(e.tx_hash, null);
});

test('control not verified keeps the gate shut even when configured', () => {
  const e = classifySignerResponse({ http: 200, body: { ok: true, schema: 'ltzzz.treasury-signer-status.v1', signer: { configured: true } } });
  assert.equal(e.state, 'unknown');
  assert.equal(e.reason, 'signer_control_unverified');
  assert.equal(fundingGate(e).allowed, false);
});

test('legacy alias alone can never open the gate without the contract', () => {
  for (const flag of ['treasury_signer_configured', 'signer_configured', 'signer_ready']) {
    const e = classifySignerResponse({ http: 200, body: { ok: true, [flag]: true } });
    assert.equal(e.state, 'unknown');
    assert.equal(e.reason, 'signer_capability_declared_without_contract');
    assert.equal(fundingGate(e).allowed, false);
  }
});

// 2026-11-08 GPT 复现的两条真实反例：本地纯函数调用，零网络、零资金。
test('a failing service response with signer_ready:true is NOT ready', () => {
  const e = classifySignerResponse({ http: 200, body: { ok: false, error: 'synthetic_service_failure', signer_ready: true } });
  assert.equal(e.state, 'unknown');
  assert.equal(e.reason, 'signer_status_reports_failure');
  assert.equal(fundingGate(e).allowed, false);
});

test('contradictory capability flags (configured:false + ready:true) are NOT ready', () => {
  const e = classifySignerResponse({ http: 200, body: { ok: true, signer_configured: false, signer_ready: true } });
  assert.equal(e.state, 'unknown');
  assert.equal(e.reason, 'conflicting_signer_flags');
  assert.equal(fundingGate(e).allowed, false);
});

test('a contract that says configured:false is missing, not ready', () => {
  const e = classifySignerResponse({ http: 200, body: { ok: true, schema: 'ltzzz.treasury-signer-status.v1', signer: { configured: false, control_verified: true } } });
  assert.equal(e.state, 'missing');
  assert.equal(fundingGate(e).blocked_status, 'blocked_missing_signer');
});

test('HTTP 422 treasury_signer_missing is missing, never retried', async () => {
  let calls = 0;
  const e = await probeSignerCapability({
    origin, pin,
    fetcher: async () => { calls++; return new Response(JSON.stringify({ ok: false, error: 'treasury_signer_missing' }), { status: 422 }); },
  });
  assert.equal(calls, 1);
  assert.equal(e.http, 422);
  assert.equal(e.state, 'unknown');
  // A 422 on the read-only status route is not a capability declaration.
  assert.equal(fundingGate(e).allowed, false);
  assert.equal(fundingGate(e).blocked_status, 'blocked_signer_unverified');
});

test('explicit absence of every readiness flag is missing and blocks the step', () => {
  const e = classifySignerResponse({ http: 200, body: { ok: true, treasury_signer_configured: false } });
  assert.equal(e.state, 'missing');
  assert.equal(fundingGate(e).blocked_status, 'blocked_missing_signer');
});

test('declared blocked_missing_signer is missing', () => {
  assert.equal(classifySignerResponse({ http: 200, body: { status: 'blocked_missing_signer' } }).state, 'missing');
  assert.equal(classifySignerResponse({ http: 200, body: { ok: false, error: 'treasury_signer_missing' } }).state, 'missing');
});

test('401/403 is auth_blocked and does not pretend capability', () => {
  for (const http of [401, 403]) {
    const e = classifySignerResponse({ http, body: { ok: true, treasury_signer_configured: true } });
    assert.equal(e.state, 'auth_blocked');
    assert.equal(fundingGate(e).allowed, false);
    assert.equal(fundingGate(e).blocked_status, 'blocked_signer_auth');
  }
});

test('unknown outcomes fail closed instead of guessing', () => {
  for (const http of [200, 204, 500, 503, null]) {
    const e = classifySignerResponse({ http, body: undefined });
    assert.equal(e.state, 'unknown');
    assert.equal(fundingGate(e).allowed, false);
  }
  assert.equal(classifySignerResponse({ http: 200, body: [] }).state, 'unknown');
  assert.equal(classifySignerResponse({ http: 200, body: { ok: true, unrelated: 1 } }).state, 'unknown');
});

test('transport loss stays unknown, single call, no raw error text or pin leak', async () => {
  let calls = 0;
  const e = await probeSignerCapability({
    origin, pin,
    fetcher: async () => { calls++; throw Error('boom ' + pin + ' internal detail'); },
  });
  assert.equal(calls, 1);
  assert.equal(e.retries, 0);
  assert.equal(e.state, 'unknown');
  assert.equal(e.reason, 'signer_status_transport_unavailable');
  assert.equal(JSON.stringify(e).includes(pin), false);
  assert.equal(JSON.stringify(e).includes('internal detail'), false);
});

test('missing origin never touches the network', async () => {
  let called = false;
  const e = await probeSignerCapability({ origin: null, fetcher: () => { called = true; return json({}); } });
  assert.equal(called, false);
  assert.equal(e.state, 'unknown');
  assert.equal(e.reason, 'origin_not_configured');
  assert.equal(fundingGate(e).allowed, false);
});

test('only whitelisted non-secret keys are retained as evidence', async () => {
  const e = await probeSignerCapability({
    origin, pin,
    fetcher: async () => json({
      ok: true, treasury_signer_configured: true,
      private_key: 'leak-me', api_secret: 'leak-me-too', aave_runtime_revision: 'aave-guard-v9',
    }),
  });
  assert.deepEqual(e.observed_keys, ['aave_runtime_revision', 'ok', 'treasury_signer_configured']);
  assert.equal(JSON.stringify(e).includes('leak-me'), false);
  assert.equal(e.state, 'unknown');
  assert.equal(e.reason, 'signer_capability_declared_without_contract');
});

test('non-JSON body is unknown, not a silent pass', async () => {
  const e = await probeSignerCapability({ origin, pin, fetcher: async () => new Response('<html>oops</html>', { status: 200 }) });
  assert.equal(e.state, 'unknown');
  assert.equal(e.http, 200);
});
