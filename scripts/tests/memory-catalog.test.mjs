// Memory library archive -> canonical mapping.
// Run: node --test scripts/tests/memory-catalog.test.mjs
//
// Data side: archive variants in the catalog carry a canonical_target.
// Rule side: the target is recomputed from the filename, so a hand edit that
// disagrees with the rule fails here instead of silently mis-pointing.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {archiveCanonicalTarget, CANONICAL_FILES} from '../lib/memory-catalog.mjs';

const catalog = JSON.parse(fs.readFileSync(new URL('../../knowledge/results/memory-library/catalog-20261113.json', import.meta.url), 'utf8'));
const canonical = new Set(catalog.canonical_set);
const archives = () => catalog.items.filter(i => i.class === 'version_or_archive');

test('catalog canonical set matches the indexed canonical files', () => {
  assert.deepEqual([...canonical].sort(), [...CANONICAL_FILES].sort());
});

test('no archive variant is left without a canonical target', () => {
  assert.deepEqual(archives().filter(i => i.canonical_target == null).map(i => i.path), []);
});

test('every target exists in the catalog and an archive never points at itself', () => {
  for (const item of catalog.items.filter(i => i.canonical_target != null)) {
    assert.ok(canonical.has(item.canonical_target), item.path + ' -> ' + item.canonical_target);
  }
  for (const item of archives()) assert.notEqual(item.path, item.canonical_target);
});

test('stored targets equal the filename rule result', () => {
  for (const item of archives()) {
    assert.equal(archiveCanonicalTarget(item.path, catalog.canonical_set), item.canonical_target, item.path);
  }
});

test('suffix handling is explicit and conservative', () => {
  assert.equal(archiveCanonicalTarget('魄-入档.md'), '魄.md');
  assert.equal(archiveCanonicalTarget('识神-入档.md'), '识神.md');
  assert.equal(archiveCanonicalTarget('梦境数据库-v1.md'), '梦境数据库.md');
  assert.equal(archiveCanonicalTarget('梦境数据库-入档.md'), '梦境数据库.md');
  assert.equal(archiveCanonicalTarget('重要事件-v1.md'), '重要事件.md');
  assert.equal(archiveCanonicalTarget('重要事件-入档.md'), '重要事件.md');
  assert.equal(archiveCanonicalTarget('重要事件-补录-20261016-1023.md'), '重要事件.md');
  assert.equal(archiveCanonicalTarget('文明研究-v1.md'), '文明研究.md');
  assert.equal(archiveCanonicalTarget('文明研究-入档.md'), '文明研究.md');
  assert.equal(archiveCanonicalTarget('文明研究-DeepSeek提炼.md'), '文明研究.md');
});

test('unknown suffixes, canonical files and nested paths stay null', () => {
  assert.equal(archiveCanonicalTarget('daily-3nums.md'), null);
  assert.equal(archiveCanonicalTarget('装备论.md'), null);
  assert.equal(archiveCanonicalTarget('未知-v1.md'), null);
  assert.equal(archiveCanonicalTarget('未知-入档.md'), null);
  assert.equal(archiveCanonicalTarget('tasks/control/2026-11-16.md'), null);
  assert.equal(archiveCanonicalTarget(null), null);
});

test('the mapping record matches what was written', () => {
  const mapped = catalog.archive_mapping;
  assert.equal(mapped.implementation, 'scripts/lib/memory-catalog.mjs');
  assert.deepEqual(mapped.unresolved, []);
  const actual = catalog.items.filter(i => i.canonical_rule === 'suffix_strip_to_canonical').map(i => i.path).sort();
  assert.deepEqual(actual, [...mapped.mapped_paths].sort());
});

test('core-memory CI enforces the strict manifest check on manifest changes', () => {
  const workflow = fs.readFileSync(new URL('../../.github/workflows/core-memory-integrity.yml', import.meta.url), 'utf8');
  assert.match(workflow, /node scripts\/check-memory-manifest-consistency\.mjs --strict/);
  assert.match(workflow, /ltzzz-memory\/manifest\.json/);
});
