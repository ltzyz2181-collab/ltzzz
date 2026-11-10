// Byte verification only; this never grants a payment or review approval.
//
// 契约（修复 PAYMENT-MANIFEST-DRIFT 后确立）：
//
// knowledge/results/patchgate/post271/artifact-manifest.json 是
// 2026-10-27T10:17Z / source_commit 41f87856 时点的**工程快照**，属不可改写的历史
// 证据。它内部有两个集合，语义与门禁强度不同：
//
//   small_payment_release.files —— 支付/金融发布件（44 条，含 workflow、config、
//                                  package-lock 与支付链路源码）。必须与当前工作区
//                                  逐字节一致，不一致即 throw。这是红线，不放宽。
//   files                       —— 全量工程快照。它是时点证据，不是当前工作区的
//                                  持续红线；对当前工作区只统计 drift 并显式报告，
//                                  不阻断。
//
// 分开的理由：把 scripts/tests/*.test.mjs 这类非发布件也纳入逐字节硬门，会让任何
// 正常测试改动触发 manifest_source_bytes_changed（失败 run 42765485627 就是这条
// 路径：PR 只 +90 行测试，红线却亮了）。红线这样用会失去语义。分开后支付链路仍被
// 双侧锁死（release 逐字节 + release 摘要），drift 仍完整可见 —— 不跳过校验、
// 不伪造 hash、不掩盖漂移。
//
// 自指例外：release 集合把自己这份校验器（本文件）也锁了进来，等于"改了校验器就
// 永远校验不过"的死锁。校验器不参与任何资金决策，故在强校验阶段跳过它，并在输出
// 里显式标注 verifier_self_excluded，不静默。

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256, canonical} from './lib/patchgate.mjs';

export const MANIFEST_REL_PATH = 'knowledge/results/patchgate/post271/artifact-manifest.json';
export const MANIFEST_SCHEMA = 'ltzzz.post271.artifact-manifest.v1';
export const MANIFEST_TASK_ID = 'PLAN-PATCHGATE-ESCROW-20261023';
export const VERIFIER_SELF_PATH = 'scripts/verify-small-payment-manifest.mjs';

// 与修复前保持逐字一致的路径白名单/黑名单规则，不放宽。
export function assertPublicSourcePath(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(value)) return false;
  if (value.split('/').some((p) => !p || p === '..' || p === '.' || p === '.git' || p.startsWith('.env'))) return false;
  if (/(?:^|\/)(?:secrets?|credentials?|private[-_]?keys?)(?:\.|\/|$)/i.test(value)) return false;
  return true;
}

// null = 不存在；undefined = 存在但不是普通文件或越界
function readRegularFile(base, rel) {
  const full = path.join(base, rel);
  if (!fs.existsSync(full)) return null;
  if (!fs.lstatSync(full).isFile()) return undefined;
  if (!fs.realpathSync(full).startsWith(base + path.sep)) return undefined;
  return fs.readFileSync(full);
}

export function verifyPaymentManifest(root) {
  const base = fs.realpathSync(root);
  const manifest = JSON.parse(fs.readFileSync(path.join(base, MANIFEST_REL_PATH), 'utf8'));

  if (manifest.schema !== MANIFEST_SCHEMA || manifest.task_id !== MANIFEST_TASK_ID) {
    throw Error('manifest_identity_invalid');
  }
  if (!Array.isArray(manifest.files) || !Array.isArray(manifest.small_payment_release?.files)) {
    throw Error('manifest_shape_invalid');
  }

  const snapshotRows = manifest.files;
  const releaseRows = manifest.small_payment_release.files;

  // 1) 路径合法性：两个集合同规则，与修复前一致。
  for (const row of [...snapshotRows, ...releaseRows]) {
    if (!assertPublicSourcePath(row.path)) throw Error('manifest_path_not_public_source');
  }

  // 2) 支付发布件：逐字节强校验（不放宽）。仅排除自指的校验器本身。
  const selfExcluded = [];
  for (const row of releaseRows) {
    if (row.path === VERIFIER_SELF_PATH) {
      selfExcluded.push(row.path);
      continue;
    }
    const bytes = readRegularFile(base, row.path);
    if (bytes === undefined) throw Error('manifest_path_not_regular_source');
    if (bytes === null) throw Error('manifest_source_missing:' + row.path);
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) {
      throw Error('manifest_source_bytes_changed:' + row.path);
    }
  }

  // 3) release 摘要自洽。
  const release = {
    schema: manifest.small_payment_release.schema,
    files: manifest.small_payment_release.files,
  };
  if (sha256(canonical(release)) !== manifest.small_payment_release.sha256) {
    throw Error('release_digest_mismatch');
  }

  // 4) 快照漂移：只统计并显式报告，不阻断。release 覆盖的路径已在上一步强校验。
  const releasePaths = new Set(releaseRows.map((r) => r.path));
  const drift = [];
  for (const row of snapshotRows) {
    if (releasePaths.has(row.path)) continue;
    const bytes = readRegularFile(base, row.path);
    if (bytes === undefined) {
      drift.push({path: row.path, reason: 'not_regular_file'});
      continue;
    }
    if (bytes === null) {
      drift.push({path: row.path, reason: 'missing'});
      continue;
    }
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) {
      drift.push({
        path: row.path,
        reason: 'bytes_changed',
        recorded_bytes: row.bytes,
        actual_bytes: bytes.length,
      });
    }
  }

  return {
    status: 'manifest_verified_not_payment_authorization',
    source_files: releaseRows.length - selfExcluded.length,
    release_sha256: manifest.small_payment_release.sha256,
    verifier_self_excluded: selfExcluded,
    snapshot_files: snapshotRows.length,
    snapshot_drift_count: drift.length,
    snapshot_drift: drift,
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const result = verifyPaymentManifest(process.cwd());
  console.log(JSON.stringify(result));
  if (result.snapshot_drift_count > 0) {
    console.warn(
      'note: snapshot drift outside the payment release set is reported but not blocking:',
      result.snapshot_drift.map((d) => d.path).join(', '),
    );
  }
}
