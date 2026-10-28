import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { endpoint, selectConfiguration, probe, runLocal } from './workbuddy-kimi-probe.mjs';
const key = 'sk-' + 'local_synthetic_fixture_'.repeat(2);
const fixture = { models: [{ id: 'kimi-k3', name: 'Kimi K3', vendor: 'Kimi 中国版', url: 'https://api.moonshot.cn/v1/chat/completions', apiKey: key }] };
const fresh = () => ({ model_calls_attempted: 0, connection_verified: false });

test('never sends a credential to another host, HTTP, query, userinfo or redirect URL', () => {
  for (const u of ['http://api.moonshot.cn/v1', 'https://api.moonshot.cn.evil.test/v1', 'https://api.moonshot.cn@evil.test/v1', 'https://user@api.moonshot.cn/v1', 'https://api.moonshot.cn/v1?token=private', 'https://api.moonshot.cn/v1/other', 'https://api.moonshot.cn:8443/v1']) assert.throws(() => endpoint(u));
  assert.equal(endpoint('https://api.moonshot.ai/v1').region, 'ai');
});
test('official WorkBuddy record shape and named environment reference are supported without mixing model keys', () => {
  assert.equal(selectConfiguration(fixture).model, 'kimi-k3');
  const c = structuredClone(fixture); c.models[0].apiKey = '${LOCAL_KIMI_KEY}';
  assert.equal(selectConfiguration(c, { LOCAL_KIMI_KEY: key }).ok, true);
  delete c.models[0].apiKey; c.models.push({ id: 'deepseek-v4-pro', apiKey: key });
  assert.equal(selectConfiguration(c).ok, false);
});
test('ambiguous accounts are not guessed or called in both regions', () => {
  const c = structuredClone(fixture); c.models.push({ ...c.models[0], url: 'https://api.moonshot.ai/v1' });
  assert.equal(selectConfiguration(c).status, 'multiple_Kimi_configurations_select_in_UI');
});
test('known unavailable configured model stops before a paid request', async () => {
  let calls = 0; const r = await probe(fresh(), selectConfiguration(fixture), { fetcher: async () => { calls++; return { ok: true, status: 200, json: async () => ({ data: [{ id: 'kimi-k2.6' }] }) }; } });
  assert.equal(r.status, 'configured_model_not_in_official_catalogue'); assert.equal(calls, 1); assert.equal(r.model_calls_attempted, 0);
});
test('credential rejection is distinguished and raw error messages are not exported', async () => {
  const r = await probe(fresh(), selectConfiguration(fixture), { fetcher: async () => ({ ok: false, status: 401, json: async () => ({ error: { message: key } }) }) });
  assert.equal(r.status, 'authentication_or_region_mismatch'); assert.equal(JSON.stringify(r).includes(key), false); assert.equal(r.model_calls_attempted, 0);
});
test('nonce, official model, finish reason, one-call limit and prior durable reservation are all required', async () => {
  let calls = 0, reserved = false;
  const r = await probe(fresh(), selectConfiguration(fixture), { save: async v => { if (v.status === 'generation_started_completion_unknown_no_retry') reserved = true; }, fetcher: async (url, options) => {
    assert.equal(options.redirect, 'error'); calls++;
    if (url.endsWith('/models')) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'kimi-k3' }] }) };
    assert.equal(reserved, true); const body = JSON.parse(options.body); assert.equal(body.max_tokens, 16384); assert.equal(body.temperature, 1);
    const nonce = body.messages[0].content.split(': ').at(-1);
    return { ok: true, status: 200, headers: new Headers({ 'x-request-id': 'fixture-request-1' }), json: async () => ({ model: 'kimi-k3', choices: [{ message: { content: nonce }, finish_reason: 'stop' }], usage: { total_tokens: 70 } }) };
  } });
  assert.equal(calls, 2); assert.equal(r.connection_verified, true); assert.equal(r.model_calls_attempted, 1); assert.equal(JSON.stringify(r).includes(key), false);
});
test('HTTP 200 with empty or truncated output is not accepted', async () => {
  for (const [content, finish] of [['', 'length'], ['something else', 'stop']]) {
    let i = 0;
    const r = await probe(fresh(), selectConfiguration(fixture), { fetcher: async () => ++i === 1 ? { ok: true, status: 200, json: async () => ({ data: [{ id: 'kimi-k3' }] }) } : { ok: true, status: 200, headers: new Headers(), json: async () => ({ model: 'kimi-k3', choices: [{ message: { content }, finish_reason: finish }] }) } });
    assert.equal(r.connection_verified, false);
  }
});
test('an uncertain paid request is never retried and does not echo exception secrets', async () => {
  let calls = 0;
  const r = await probe(fresh(), selectConfiguration(fixture), { fetcher: async () => { if (++calls === 1) return { ok: true, status: 200, json: async () => ({ data: [{ id: 'kimi-k3' }] }) }; throw new Error(key); } });
  assert.equal(calls, 2); assert.equal(r.status, 'generation_outcome_unknown_do_not_retry'); assert.equal(JSON.stringify(r).includes(key), false);
});
test('persistent one-use receipt prevents repeated requests and leaves configuration untouched', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-kimi-fixture-'));
  try {
    fs.mkdirSync(path.join(dir, '.workbuddy')); const file = path.join(dir, '.workbuddy/models.json');
    const bytes = JSON.stringify(fixture); fs.writeFileSync(file, bytes); const outputFile = path.join(dir, 'out/probe.json');
    let calls = 0; const fetcher = async () => { calls++; return { ok: false, status: 429 }; };
    await runLocal({ home: dir, outputFile, fetcher, env: {} }); const first = fs.readFileSync(outputFile, 'utf8');
    const retry = await runLocal({ home: dir, outputFile, fetcher, env: {} });
    assert.equal(calls, 1); assert.equal(retry.status, 'existing_receipt_do_not_repeat'); assert.equal(fs.readFileSync(outputFile, 'utf8'), first); assert.equal(fs.readFileSync(file, 'utf8'), bytes); assert.equal(first.includes(key), false);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
