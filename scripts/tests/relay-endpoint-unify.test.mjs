import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const wfDir = path.join(root, '.github', 'workflows');
const RETIRED = 'ltzzz-relay-proxy.ltzyz2181.workers.dev';

test('no workflow still points at the retired relay host', () => {
  const files = fs.readdirSync(wfDir).filter(f => f.endsWith('.yml') || f.endsWith('.yaml'));
  assert.ok(files.length > 0, 'no workflow files found');
  const offenders = files.filter(f => fs.readFileSync(path.join(wfDir, f), 'utf8').includes(RETIRED));
  assert.deepEqual(offenders, [], `workflows still on retired relay host: ${offenders.join(', ')}`);
});

test('relay budget close script defaults to the public relay domain', () => {
  const src = fs.readFileSync(path.join(root, 'scripts', 'relay-budget-close.mjs'), 'utf8');
  assert.match(src, /https:\/\/relay\.ltzzz\.com\/v1/);
});