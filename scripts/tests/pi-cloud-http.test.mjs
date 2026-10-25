import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {loadPiSdk, callPi} from '../lib/pi-cloud.mjs';

// Actual pinned SDK + loopback HTTP, no external model service or real credential.
const root = fileURLToPath(new URL('../../', import.meta.url));
const sdk = await loadPiSdk(root);

async function fixture({provider, model, content = 'local fixture answer', finish = 'stop', reasoning = ''}) {
  const requests = [];
  const server = http.createServer(async (req, res) => {
    let body = ''; for await (const part of req) body += part;
    requests.push({path: req.url, body: JSON.parse(body)});
    res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache'});
    const base = {id: 'loopback-only-no-real-provider', object: 'chat.completion.chunk', created: 1, model};
    res.write('data: ' + JSON.stringify({...base, choices: [{index: 0, delta: {role: 'assistant', content, ...(reasoning ? {reasoning_content: reasoning} : {})}, finish_reason: null}]}) + '\n\n');
    res.write('data: ' + JSON.stringify({...base, choices: [{index: 0, delta: {}, finish_reason: finish}],
      usage: {prompt_tokens: 10, completion_tokens: reasoning ? 4096 : 5, total_tokens: reasoning ? 4106 : 15,
        completion_tokens_details: {reasoning_tokens: reasoning ? 4096 : 0}}}) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  try {
    const result = await callPi({sdk, root, selected: {provider, route_id: 'ltzzz-loopback-' + provider, model,
      base: 'http://127.0.0.1:' + server.address().port + '/v1', key: 'dummy-loopback-only-not-a-provider-key'},
      prompt: 'Return a short local fixture response; do not execute anything.', timeoutMs: 10000});
    return {requests, result};
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
}

test('real Pi SDK sends DeepSeek V4 explicit thinking disabled without inflating max_tokens', async () => {
  const {requests, result} = await fixture({provider: 'deepseek', model: 'deepseek-v4-pro'});
  assert.equal(requests.length, 1);
  assert.equal(requests[0].path, '/v1/chat/completions');
  assert.equal(requests[0].body.model, 'deepseek-v4-pro');
  assert.deepEqual(requests[0].body.thinking, {type: 'disabled'});
  assert.equal(requests[0].body.max_tokens, 4096);
  assert.equal('reasoning_effort' in requests[0].body, false);
  assert.equal(result.ok, true); assert.equal(result.output, 'local fixture answer');
  assert.equal(result.usage_cost_is_verified, false);
});

test('real Pi SDK sends native DashScope enable_thinking false', async () => {
  const {requests, result} = await fixture({provider: 'aliyun_dashscope', model: 'qwen-plus'});
  assert.equal(requests.length, 1); assert.equal(requests[0].body.enable_thinking, false);
  assert.equal('thinking' in requests[0].body, false);
  assert.equal(result.ok, true);
});

test('real SDK length finish with reasoning-only content is rejected and never retried', async () => {
  const {requests, result} = await fixture({provider: 'deepseek', model: 'deepseek-v4-pro', content: '', finish: 'length', reasoning: 'local synthetic reasoning only'});
  assert.equal(requests.length, 1);
  assert.deepEqual(requests[0].body.thinking, {type: 'disabled'});
  assert.equal(result.ok, false); assert.equal(result.finish_reason, 'length'); assert.equal(result.output, '');
});

test('real SDK stop with empty body is rejected and never retried', async () => {
  const {requests, result} = await fixture({provider: 'deepseek', model: 'deepseek-v4-pro', content: ''});
  assert.equal(requests.length, 1); assert.equal(result.ok, false);
  assert.equal(result.finish_reason, 'stop'); assert.equal(result.output, '');
});
