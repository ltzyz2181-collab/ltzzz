import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, { ALLOWED_MODELS, MIN_INPUT_TOKENS, authorized, estimateTokens, validateRequest } from '../../workers/relay-proxy/worker.mjs';
import { estimateInputTokens } from '../lib/relay-seat-guard.mjs';

const longText = '长上下文验收文本。'.repeat(700); // > 4096 estimated tokens

function request(body, { path = '/v1/chat/completions', token = 'proxy-token', method = 'POST' } = {}) {
  return new Request('https://ltzzz-relay-proxy.example.workers.dev' + path, {
    method,
    headers: token ? { 'content-type': 'application/json', 'x-ltzzz-seat-token': token } : { 'content-type': 'application/json' },
    body: method === 'POST' ? JSON.stringify(body) : undefined,
  });
}

test('worker estimator matches the seat guard estimator', () => {
  const sample = '中文 abc 123\n' + longText;
  assert.equal(estimateTokens(sample), estimateInputTokens(sample));
});

test('proxy allowlists exactly the five seat models', () => {
  assert.deepEqual(ALLOWED_MODELS, ['claude-opus-5-5', 'claude-opus-5', 'claude-sonnet-4-6', 'claude-haiku-5-5', 'gpt-6.1-sol']);
});

test('allows a long gpt-class request', () => {
  const verdict = validateRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 512 });
  assert.equal(verdict.ok, true);
  assert.ok(verdict.estimated_input_tokens >= MIN_INPUT_TOKENS);
});

test('refuses a short request before any upstream call', () => {
  const verdict = validateRequest({ model: 'claude-opus-5-5', messages: [{ role: 'user', content: 'ping' }] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'proxy_short_request_forbidden');
});

test('refuses a model outside the allowlist', () => {
  const verdict = validateRequest({ model: 'gpt-5.5', messages: [{ role: 'user', content: longText }] });
  assert.equal(verdict.ok, false);
  assert.equal(verdict.code, 'proxy_model_not_allowlisted');
});

test('refuses streaming, malformed bodies and bad max_tokens', () => {
  assert.equal(validateRequest({ model: 'gpt-6.1-sol', stream: true, messages: [{ role: 'user', content: longText }] }).code, 'proxy_stream_not_supported');
  assert.equal(validateRequest(null).code, 'proxy_body_invalid');
  assert.equal(validateRequest({ model: 'gpt-6.1-sol', messages: [] }).code, 'proxy_messages_invalid');
  assert.equal(validateRequest({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }], max_tokens: 999999 }).code, 'proxy_max_tokens_invalid');
});

test('proxy token comparison rejects empty and mismatched tokens', () => {
  assert.equal(authorized(request({}, { token: 'proxy-token' }), 'proxy-token'), true);
  assert.equal(authorized(request({}, { token: 'wrong-token' }), 'proxy-token'), false);
  assert.equal(authorized(request({}, { token: null }), 'proxy-token'), false);
  assert.equal(authorized(request({}, { token: 'proxy-token' }), ''), false);
});

test('gateway rejects unauthenticated callers before reading the key', async () => {
  const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }] }, { token: null }), { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' });
  assert.equal(response.status, 401);
});

test('gateway answers 503 when the station key secret is absent', async () => {
  const response = await worker.fetch(request({ model: 'gpt-6.1-sol', messages: [{ role: 'user', content: longText }] }), { PROXY_ACCESS_TOKEN: 'proxy-token' });
  const body = await response.json();
  assert.equal(response.status, 503);
  assert.equal(body.error.code, 'proxy_key_missing');
});

test('gateway rejects unknown routes and methods', async () => {
  const notFound = await worker.fetch(request({}, { path: '/v1/models' }), { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' });
  assert.equal(notFound.status, 404);
  const wrongMethod = await worker.fetch(request({}, { method: 'GET', token: 'proxy-token' }), { PROXY_ACCESS_TOKEN: 'proxy-token', RELAY_STATION_KEY: 'station-key' });
  assert.equal(wrongMethod.status, 405);
});
