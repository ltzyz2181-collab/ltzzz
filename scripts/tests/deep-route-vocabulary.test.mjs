import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function readRoutes(file) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  const block = /export const ROUTES = Object\.freeze\(\[([\s\S]*?)\]\)/.exec(source);
  assert.ok(block, 'ROUTES block not found in ' + file);
  return [...block[1].matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
}

test('controlled route vocabulary carries execute_authorized exactly once', () => {
  const routes = readRoutes('deepseek-shadow-routing.mjs');
  assert.ok(routes.includes('execute_authorized'));
  assert.ok(routes.includes('needs_gpt_decision'));
  assert.ok(routes.includes('coordinator_close_with_receipt'));
  assert.equal(new Set(routes).size, routes.length, 'routes must not repeat');
});

test('dispatch card offers execute_authorized only after the funds guard', () => {
  const source = fs.readFileSync(path.join(root, 'dispatch-daily-card.mjs'), 'utf8');
  assert.match(source, /execute_authorized \/ needs_gpt_decision/);
  const guard = source.indexOf('涉及资金、签名、放款、生产部署、权限、Secrets');
  const authorized = source.indexOf('2b 已有 Owner 或 GPT 书面授权');
  assert.ok(guard > 0, 'funds guard rule missing');
  assert.ok(authorized > guard, 'execute_authorized must be introduced after the funds guard');
  assert.match(source, /理由必须写出授权来源/);
});
