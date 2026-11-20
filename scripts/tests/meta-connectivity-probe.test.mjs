import test from 'node:test';
import assert from 'node:assert/strict';
import {classifyVerdict, probe, resolveWorkerUrl} from '../meta-connectivity-probe.mjs';

const json = (status, body) => new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json'}});

test('classifyVerdict separates reachability, auth and inference failures', () => {
  const okHealth = {http: 200, json: {service: 'ltzzz-meta-hosted', auth_configured: true}};
  const okAuth = {http: 200, json: {authorized: true}};
  const okProbe = {http: 200, json: {output: 'x'}};
  assert.equal(classifyVerdict({health: okHealth, authCheck: okAuth, probe: okProbe, echoOk: true}), 'ok');
  assert.equal(classifyVerdict({health: {http: 0, error: 'timeout'}, authCheck: null, probe: null, echoOk: false}), 'network_unreachable');
  assert.equal(classifyVerdict({health: {http: 404, json: {error: 'not_found'}}, authCheck: null, probe: null, echoOk: false}), 'worker_not_found');
  assert.equal(classifyVerdict({health: {http: 200, json: {service: 'other'}}, authCheck: null, probe: null, echoOk: false}), 'unexpected_health_response');
  assert.equal(classifyVerdict({health: {http: 200, json: {service: 'ltzzz-meta-hosted', auth_configured: false}}, authCheck: null, probe: null, echoOk: false}), 'auth_not_configured');
  assert.equal(classifyVerdict({health: okHealth, authCheck: {http: 401, json: {error: 'unauthorized'}}, probe: null, echoOk: false}), 'deployed_auth_not_ready');
  assert.equal(classifyVerdict({health: okHealth, authCheck: okAuth, probe: {http: 502, json: {error: 'upstream_inference_failed'}}, echoOk: false}), 'deployed_inference_failed');
  assert.equal(classifyVerdict({health: okHealth, authCheck: okAuth, probe: okProbe, echoOk: false}), 'probe_echo_mismatch');
});

test('resolveWorkerUrl derives the workers.dev host from the Cloudflare account', async () => {
  const fromApi = await resolveWorkerUrl({
    apiToken: 'token-value',
    accountId: 'acct',
    fetchImpl: async () => json(200, {result: {subdomain: 'example-sub'}}),
  });
  assert.equal(fromApi.url, 'https://ltzzz-meta-hosted.example-sub.workers.dev');
  assert.equal(fromApi.source, 'cloudflare_api');

  const fromInput = await resolveWorkerUrl({workerUrl: 'https://custom.example.dev/'});
  assert.equal(fromInput.url, 'https://custom.example.dev');
  assert.equal(fromInput.source, 'input');

  const missing = await resolveWorkerUrl({});
  assert.equal(missing.source, 'missing_credentials');
});

test('probe runs health, auth-check and one channel_probe without leaking credentials', async () => {
  const apiToken = 'cf_fake_token_do_not_leak';
  const fakeFetch = async (url, options = {}) => {
    const target = String(url);
    if (target.endsWith('/health')) return json(200, {service: 'ltzzz-meta-hosted', provider: 'cloudflare-workers-ai', auth_configured: true, ai_binding: true});
    if (target.endsWith('/auth-check')) return json(200, {ok: true, authorized: true, model_calls: 0});
    if (target.endsWith('/task')) {
      const body = JSON.parse(options.body);
      return json(200, {ok: true, output: body.nonce, executor: 'did:ltzzz:meta', provider: 'cloudflare-workers-ai', model: 'test-model', status: 'proposal_completed'});
    }
    return json(404, {error: 'not_found'});
  };
  const receipt = await probe({workerUrl: 'https://ltzzz-meta-hosted.example.workers.dev', apiToken, fetchImpl: fakeFetch});
  assert.equal(receipt.verdict, 'ok');
  assert.equal(receipt.ok, true);
  assert.equal(receipt.boundaries.model_calls, 1);
  assert.equal(receipt.boundaries.financial_execution, false);
  assert.equal(receipt.evidence.echo_matched, true);
  assert.ok(!JSON.stringify(receipt).includes(apiToken), 'credential must not appear in the receipt');
});

test('probe reports unauthorized deployments without calling the model', async () => {
  let modelCalls = 0;
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/health')) return json(200, {service: 'ltzzz-meta-hosted', auth_configured: true, ai_binding: true});
    if (target.endsWith('/auth-check')) return json(401, {error: 'unauthorized'});
    modelCalls += 1;
    return json(500, {error: 'should_not_be_called'});
  };
  const receipt = await probe({workerUrl: 'https://ltzzz-meta-hosted.example.workers.dev', apiToken: 'token', fetchImpl: fakeFetch});
  assert.equal(receipt.verdict, 'deployed_auth_not_ready');
  assert.equal(receipt.ok, false);
  assert.equal(modelCalls, 0);
  assert.equal(receipt.boundaries.model_calls, 0);
});
test('probe records sanitized upstream diagnostics when inference fails', async () => {
  const apiToken = 'cf_secret_not_in_receipt';
  const fakeFetch = async (url) => {
    const target = String(url);
    if (target.endsWith('/health')) return json(200, {service: 'ltzzz-meta-hosted', auth_configured: true, ai_binding: true, model: '@cf/meta/dead-model'});
    if (target.endsWith('/auth-check')) return json(200, {authorized: true});
    if (target.endsWith('/task')) return json(502, {error: 'upstream_inference_failed'});
    if (target.includes('/ai/run/')) return json(404, {success: false, errors: [{code: 5007, message: 'No such model'}]});
    if (target.includes('/ai/models/search')) return json(200, {result: [{name: '@cf/meta/llama-3.1-8b-instruct'}]});
    return json(404, {});
  };
  const receipt = await probe({workerUrl: 'https://ltzzz-meta-hosted.example.workers.dev', apiToken, accountId: 'acct', fetchImpl: fakeFetch});
  assert.equal(receipt.verdict, 'deployed_inference_failed');
  assert.equal(receipt.checks.inference_diagnosis.run.http, 404);
  assert.match(receipt.checks.inference_diagnosis.run.error, /No such model/);
  assert.deepEqual(receipt.checks.inference_diagnosis.meta_models, ['@cf/meta/llama-3.1-8b-instruct']);
  assert.ok(!JSON.stringify(receipt).includes(apiToken), 'credential must not appear in diagnostics');
});