import test from 'node:test';
import assert from 'node:assert/strict';
import {DAILY_DOUBAO_MAX_TOKENS, dailyCallOptions} from '../lib/daily-call-options.mjs';

test('日课 Doubao 显式有界输出并关闭 thinking', () => {
  const options = dailyCallOptions({agent: 'doubao', apiKey: 'k', prompt: 'p'});
  assert.equal(options.maxTokens, 4096);
  assert.equal(options.thinking, 'disabled');
  assert.equal(options.apiKey, 'k');
  assert.equal(options.prompt, 'p');
  assert.ok(options.maxTokens <= DAILY_DOUBAO_MAX_TOKENS);
});

test('日课 Doubao 不接受超过 4096 的隐式上限', () => {
  assert.equal(dailyCallOptions({agent: 'doubao', apiKey: 'k', prompt: 'p', maxTokens: 8192}).maxTokens, 4096);
  assert.equal(dailyCallOptions({agent: 'doubao', apiKey: 'k', prompt: 'p', maxTokens: 120}).maxTokens, 256);
  assert.equal(dailyCallOptions({agent: 'doubao', apiKey: 'k', prompt: 'p', maxTokens: 'nope'}).maxTokens, 4096);
});

test('其他席位保持原调用参数，不被注入 thinking', () => {
  for (const agent of ['deepseek', 'qwen', 'grok', 'kimi']) {
    const options = dailyCallOptions({agent, apiKey: 'k', prompt: 'p'});
    assert.deepEqual(options, {apiKey: 'k', prompt: 'p'});
  }
});
