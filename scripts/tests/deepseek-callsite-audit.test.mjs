import test from 'node:test';
import assert from 'node:assert/strict';
import {scanSource} from '../deepseek-callsite-audit.mjs';

test('scanSource marks an explicit thinking key as explicit', () => {
  const rows = scanSource("import { callAgent } from './call-deepseek.mjs';\nawait callAgent({apiKey, prompt, thinking: 'disabled'});\n", 'a.mjs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].explicit_thinking, true);
  assert.equal(rows[0].line, 2);
});

test('scanSource accepts shorthand thinking and reports a missing key', () => {
  const explicit = scanSource("import {callAgent as deepseek} from './call-deepseek.mjs';\ndeepseek({apiKey, prompt, thinking});\n", 'b.mjs');
  assert.equal(explicit[0].explicit_thinking, true);
  const implicit = scanSource("import {callAgent as deepseek} from './call-deepseek.mjs';\ndeepseek({apiKey, prompt, maxTokens: 400});\n", 'c.mjs');
  assert.equal(implicit[0].explicit_thinking, false);
  assert.equal(implicit[0].alias, 'deepseek');
});

test('scanSource handles nested calls, strings with parentheses and templates', () => {
  const source = [
    "import {callAgent} from './call-deepseek.mjs';",
    "await callAgent({apiKey, prompt: build(')('), maxTokens: pick(1, 2)});",
  ].join('\n');
  const rows = scanSource(source, 'd.mjs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].explicit_thinking, false);
});

test('scanSource falls back to callAgent for dynamic module loading', () => {
  const source = "res = await (await import(path.resolve(p.module))).callAgent({apiKey, prompt, maxTokens});";
  const rows = scanSource(source, 'e.mjs');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].alias, 'callAgent');
  assert.equal(rows[0].explicit_thinking, false);
});

test('scanSource ignores files that do not import call-deepseek', () => {
  assert.deepEqual(scanSource("import {callAgent} from './call-doubao.mjs';\ncallAgent({prompt});", 'f.mjs'), []);
});