import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import {
  buildBindingsForDay,
  appendOnly,
  ensureAppendOnlyText,
  dedupeKey,
  SCHEMA,
  REVISION,
} from '../ans-binding-index.mjs';

function sha(text) {
  return createHash('sha256').update(text, 'utf8').digest('hex');
}

function makeFixture({ tamper = false } = {}) {
  const root = mkdtempSync(path.join(tmpdir(), 'ans-bind-'));
  const dir = path.join(root, 'knowledge/results/ans-cycle');
  mkdirSync(dir, { recursive: true });
  const workerBody = JSON.stringify({ finding: 'wd', evidence_paths: [] });
  const reviewerBody = JSON.stringify({ accepted: true, artifact_sha256: sha(workerBody) });
  const workerPath = 'knowledge/results/ans-cycle/2026-11-07-worker.json';
  const reviewerPath = 'knowledge/results/ans-cycle/2026-11-07-reviewer.json';
  writeFileSync(path.join(root, workerPath), workerBody);
  writeFileSync(path.join(root, reviewerPath), reviewerBody);
  const receipt = {
    date: '2026-11-07',
    run_id: '42278486764',
    source_commit: '469da0a996b5',
    status: 'draft_independently_reviewed',
    artifacts: [
      { role: 'worker', task_id: 'ANS-2026-11-07-deepseek', executed_by: 'DeepSeek', sha256: tamper ? sha('tampered') : sha(workerBody), path: workerPath },
      { role: 'reviewer', task_id: 'ANS-2026-11-07-doubao', executed_by: 'Doubao', sha256: sha(reviewerBody), path: reviewerPath },
    ],
  };
  writeFileSync(path.join(dir, '2026-11-07.json'), JSON.stringify(receipt));
  return { root, workerPath, reviewerPath };
}

test('从主回执派生绑定记录，继承 run_id 与 source_commit', () => {
  const { root } = makeFixture();
  const recs = buildBindingsForDay({ repoRoot: root, day: '2026-11-07' });
  assert.equal(recs.length, 2);
  for (const r of recs) {
    assert.equal(r.schema, SCHEMA);
    assert.equal(r.revision, REVISION);
    assert.equal(r.run_id, '42278486764');
    assert.equal(r.source_commit, '469da0a996b5');
    assert.equal(r.original_sidecar_rewritten, false);
    assert.equal(r.binding, 'match');
  }
  assert.deepEqual(recs.map((r) => r.artifact_role).sort(), ['reviewer', 'worker']);
});

test('声称哈希与复算不符时记 mismatch，不掩盖', () => {
  const { root } = makeFixture({ tamper: true });
  const recs = buildBindingsForDay({ repoRoot: root, day: '2026-11-07' });
  const worker = recs.find((r) => r.artifact_role === 'worker');
  assert.equal(worker.binding, 'mismatch');
  assert.notEqual(worker.artifact_sha256_claimed, worker.artifact_sha256_recomputed);
  assert.equal(recs.find((r) => r.artifact_role === 'reviewer').binding, 'match');
});

test('append-only：同一绑定重复构建不追加，既有行逐字保留', () => {
  const { root } = makeFixture();
  const first = buildBindingsForDay({ repoRoot: root, day: '2026-11-07' });
  const text1 = appendOnly('', first).text;
  const second = buildBindingsForDay({ repoRoot: root, day: '2026-11-07' });
  const res = appendOnly(text1, second);
  assert.equal(res.appended, 0);
  assert.equal(res.text, text1);
  assert.ok(res.text.startsWith(text1));
});

test('append-only 护栏：新内容不是既有索引的字节前缀时拒绝', () => {
  const text = '{"a":1}\n';
  assert.throws(() => ensureAppendOnlyText(text, '{"a":2}\n'), /append-only 护栏触发/);
  assert.equal(ensureAppendOnlyText(text, text + '{"b":2}\n'), true);
});

test('去重键包含 artifact 路径、复算哈希与 run_id', () => {
  const { root } = makeFixture();
  const recs = buildBindingsForDay({ repoRoot: root, day: '2026-11-07' });
  const keys = new Set(recs.map(dedupeKey));
  assert.equal(keys.size, 2);
  assert.ok(recs.every((r) => dedupeKey(r).includes(r.run_id)));
});

test('构建过程不改写原件（大小与 mtime 不变）', () => {
  const { root, workerPath, reviewerPath } = makeFixture();
  const before = [workerPath, reviewerPath].map((p) => {
    const st = statSync(path.join(root, p));
    return { p, size: st.size, mtimeMs: st.mtimeMs, sha: sha(readFileSync(path.join(root, p), 'utf8')) };
  });
  buildBindingsForDay({ repoRoot: root, day: '2026-11-07' });
  for (const b of before) {
    const st = statSync(path.join(root, b.p));
    assert.equal(st.size, b.size);
    assert.equal(st.mtimeMs, b.mtimeMs);
    assert.equal(sha(readFileSync(path.join(root, b.p), 'utf8')), b.sha);
  }
});
