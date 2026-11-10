// 回归：小额支付离线验证 manifest 的校验契约。
//
// 覆盖 GPT 派单 B 单（PAYMENT-MANIFEST-DRIFT）要求的两种能力：
//   1. 支付发布件被改动必须被拒绝（红线不放宽）；
//   2. 快照漂移必须可检测且被显式报告（不跳过、不掩盖），
//      但非发布件（例如 scripts/tests/*.test.mjs）的漂移不得阻断 CI。
//
// 失败 run 42765485627 的真实路径：PR 只对
// scripts/tests/financial-exit-guard.test.mjs 加了 90 行，就触发
// manifest_source_bytes_changed —— 因为该测试文件落在快照集合里却被当成逐字节红线。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256, canonical} from '../lib/patchgate.mjs';
import {
  verifyPaymentManifest,
  MANIFEST_REL_PATH,
  MANIFEST_SCHEMA,
  MANIFEST_TASK_ID,
  VERIFIER_SELF_PATH,
} from '../verify-small-payment-manifest.mjs';

const RELEASE_SCHEMA = 'ltzzz.small-payment.release.v1';

const BASE_FILES = {
  'lib/financial-exit-guard.js': 'module.exports = 1;\n',
  'scripts/tests/financial-exit-guard.test.mjs': 'test one\n',
  'docs/note.md': 'note\n',
};

function hashRow(base, rel) {
  const bytes = fs.readFileSync(path.join(base, rel));
  return {path: rel, bytes: bytes.length, sha256: sha256(bytes)};
}

// 必须先按**原始内容**建立 manifest，再施加 mutations，
// 否则 manifest 会记录改动后的哈希，永远测不出漂移。
function buildFixture(mutations = {}, {selfInRelease = false} = {}) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'p271-'));
  for (const [rel, body] of Object.entries(BASE_FILES)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), {recursive: true});
    fs.writeFileSync(full, body);
  }

  const snapshot = Object.keys(BASE_FILES).map((rel) => hashRow(base, rel));
  const releaseFiles = [snapshot.find((r) => r.path === 'lib/financial-exit-guard.js')];
  if (selfInRelease) {
    // 故意写入一个与真实文件不符的记录：模拟“校验器被锁进 release”的自指状态。
    releaseFiles.push({path: VERIFIER_SELF_PATH, bytes: 1974, sha256: '0'.repeat(64)});
  }

  const release = {schema: RELEASE_SCHEMA, files: releaseFiles};
  const manifest = {
    schema: MANIFEST_SCHEMA,
    task_id: MANIFEST_TASK_ID,
    files: snapshot,
    small_payment_release: {...release, sha256: sha256(canonical(release))},
  };

  const mf = path.join(base, MANIFEST_REL_PATH);
  fs.mkdirSync(path.dirname(mf), {recursive: true});
  fs.writeFileSync(mf, JSON.stringify(manifest, null, 2));

  for (const [rel, body] of Object.entries(mutations)) {
    const full = path.join(base, rel);
    fs.mkdirSync(path.dirname(full), {recursive: true});
    fs.writeFileSync(full, body);
  }
  return {base, manifest, manifestPath: mf};
}

function rewrite(manifestPath, manifest) {
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
}

test('全部一致时通过，且不产生漂移', () => {
  const {base} = buildFixture();
  const r = verifyPaymentManifest(base);
  assert.equal(r.status, 'manifest_verified_not_payment_authorization');
  assert.equal(r.source_files, 1);
  assert.equal(r.snapshot_files, 3);
  assert.equal(r.snapshot_drift_count, 0);
  assert.deepEqual(r.verifier_self_excluded, []);
});

test('非发布件（测试文件）改动：不阻断，但漂移必须被报出来', () => {
  const {base} = buildFixture({'scripts/tests/financial-exit-guard.test.mjs': 'test one\nplus 90 lines\n'});
  const r = verifyPaymentManifest(base);
  assert.equal(r.snapshot_drift_count, 1);
  assert.deepEqual(r.snapshot_drift.map((d) => d.path), ['scripts/tests/financial-exit-guard.test.mjs']);
  assert.equal(r.snapshot_drift[0].reason, 'bytes_changed');
});

test('支付发布件被改动：必须拒绝（红线不放宽）', () => {
  const {base} = buildFixture({'lib/financial-exit-guard.js': 'module.exports = 2;\n'});
  assert.throws(() => verifyPaymentManifest(base), /manifest_source_bytes_changed:lib\/financial-exit-guard\.js/);
});

test('发布件被删：必须拒绝', () => {
  const {base} = buildFixture();
  fs.unlinkSync(path.join(base, 'lib/financial-exit-guard.js'));
  assert.throws(() => verifyPaymentManifest(base), /manifest_source_missing:lib\/financial-exit-guard\.js/);
});

test('发布件记录被改写而不重算摘要：必须拒绝', () => {
  const {base, manifest, manifestPath} = buildFixture();
  // 改文件内容，并把 row 同步成新字节 —— 字节比对因此通过，只剩摘要这一道门
  const rel = 'lib/financial-exit-guard.js';
  fs.writeFileSync(path.join(base, rel), 'module.exports = 9;\n');
  const bytes = fs.readFileSync(path.join(base, rel));
  manifest.small_payment_release.files[0] = {path: rel, bytes: bytes.length, sha256: sha256(bytes)};
  // 刻意不重算 manifest.small_payment_release.sha256
  rewrite(manifestPath, manifest);
  assert.throws(() => verifyPaymentManifest(base), /release_digest_mismatch/);
});

test('路径穿越仍被拒绝', () => {
  const {base, manifest, manifestPath} = buildFixture();
  manifest.files[0] = {...manifest.files[0], path: '../outside.js'};
  rewrite(manifestPath, manifest);
  assert.throws(() => verifyPaymentManifest(base), /manifest_path_not_public_source/);
});

test('快照文件缺失只记为漂移，不阻断', () => {
  const {base} = buildFixture();
  fs.unlinkSync(path.join(base, 'docs/note.md'));
  const r = verifyPaymentManifest(base);
  assert.equal(r.snapshot_drift_count, 1);
  assert.equal(r.snapshot_drift[0].reason, 'missing');
});

test('manifest 身份不符必须拒绝', () => {
  const {base, manifest, manifestPath} = buildFixture();
  manifest.task_id = 'SOMETHING-ELSE';
  rewrite(manifestPath, manifest);
  assert.throws(() => verifyPaymentManifest(base), /manifest_identity_invalid/);
});

test('校验器自身被锁进 release 时不造成死锁，且显式标注排除', () => {
  const {base} = buildFixture({}, {selfInRelease: true});
  const r = verifyPaymentManifest(base);
  assert.deepEqual(r.verifier_self_excluded, [VERIFIER_SELF_PATH]);
  assert.equal(r.source_files, 1);
});
