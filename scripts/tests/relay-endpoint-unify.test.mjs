import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..', '..');
const wfDir = path.join(root, '.github', 'workflows');
// 保留：RETIRED 是回归哨兵，故意在测试里保留旧域名字面量。
// 收口截止日 2026-12-31；到点后本文件与 workers/deep-superagent/index.js 的临时开关一并删除。
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

test('no workflow or runtime script outside tests references the retired relay host', () => {
  const roots = [path.join(root, '.github', 'workflows'), path.join(root, 'scripts')];
  const offenders = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === 'tests' || entry.name === 'node_modules') continue;
        walk(full);
        continue;
      }
      if (!/\.(mjs|js|yml|yaml)$/.test(entry.name)) continue;
      if (fs.readFileSync(full, 'utf8').includes(RETIRED)) offenders.push(path.relative(root, full));
    }
  };
  for (const dir of roots) if (fs.existsSync(dir)) walk(dir);
  assert.deepEqual(offenders, [], `runtime files still on retired relay host: ${offenders.join(', ')}`);
});
