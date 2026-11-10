// 回归：Pages artifact 唯一性契约。
//
// 对应 GPT 派单 A 单（PAGES-ARTIFACT-DUP，失败 run 42765758716）。
// 该 run 的实况：同一个 job 被重跑（attempt 2），两次各上传一份同名 github-pages，
// run 内累计 2 份，deploy-pages 报
//   Multiple artifacts named "github-pages" were unexpectedly found ... count is 2.
import test from 'node:test';
import assert from 'node:assert/strict';
import {analyzePagesArtifacts, renderDiagnostics, PAGES_ARTIFACT_NAME} from '../lib/pages-artifact-contract.mjs';

const a = (id, name = PAGES_ARTIFACT_NAME, extra = {}) => ({id, name, size_in_bytes: 51616153, expired: false, ...extra});

test('上传前：本 run 无 Pages artifact 时应上传', () => {
  const r = analyzePagesArtifacts([a(1, 'other-artifact')], {mode: 'pre-upload'});
  assert.equal(r.ok, true);
  assert.equal(r.action, 'upload');
  assert.equal(r.count, 0);
});

test('上传前：本 run 已有一份时应复用，不再二次上传（重跑场景）', () => {
  const r = analyzePagesArtifacts([a(13739905380)], {mode: 'pre-upload'});
  assert.equal(r.ok, true);
  assert.equal(r.action, 'reuse');
  assert.equal(r.count, 1);
});

test('上传前：已有多份同名 artifact 必须失败，不得静默选一个', () => {
  // 复现失败 run 的真实形态：两个 id，创建时间相差 59 秒（两次 attempt 各一份）
  const r = analyzePagesArtifacts([a(13738609668), a(13739905380)], {mode: 'pre-upload'});
  assert.equal(r.ok, false);
  assert.equal(r.action, 'fail');
  assert.equal(r.reason, 'multiple_pages_artifacts');
  assert.equal(r.count, 2);
  assert.deepEqual(r.artifact_ids, [13738609668, 13739905380]);
});

test('部署前：恰好一份时放行', () => {
  const r = analyzePagesArtifacts([a(13739905380)], {mode: 'pre-deploy'});
  assert.equal(r.ok, true);
  assert.equal(r.action, 'deploy');
});

test('部署前：零份时必须失败（否则 deploy-pages 会自己报错且信息更差）', () => {
  const r = analyzePagesArtifacts([], {mode: 'pre-deploy'});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_pages_artifact');
});

test('部署前：多份时必须失败', () => {
  const r = analyzePagesArtifacts([a(1), a(2)], {mode: 'pre-deploy'});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'multiple_pages_artifacts');
});

test('同名不同大小也算重名冲突（判定只看名字）', () => {
  const r = analyzePagesArtifacts([a(1, PAGES_ARTIFACT_NAME, {size_in_bytes: 1}), a(2, PAGES_ARTIFACT_NAME, {size_in_bytes: 2})], {
    mode: 'pre-deploy',
  });
  assert.equal(r.ok, false);
  assert.equal(r.count, 2);
});

test('名称不完全匹配的不计入（github-pages-v2 不是重名）', () => {
  const r = analyzePagesArtifacts([a(1, 'github-pages-v2')], {mode: 'pre-deploy'});
  assert.equal(r.ok, false);
  assert.equal(r.reason, 'no_pages_artifact');
});

test('非法入参与非法 mode 必须报错', () => {
  assert.throws(() => analyzePagesArtifacts(null), /pages_artifact_list_invalid/);
  assert.throws(() => analyzePagesArtifacts([], {mode: 'nope'}), /pages_artifact_mode_invalid/);
});

test('诊断文本包含 run 上下文与成因说明', () => {
  const r = analyzePagesArtifacts([a(1), a(2)], {mode: 'pre-deploy'});
  const text = renderDiagnostics(r, {mode: 'pre-deploy', repository: 'ltzyz2181-collab/ltzzz', run_id: '42765758716', run_attempt: '2'});
  assert.match(text, /pages_artifact_contract: violated/);
  assert.match(text, /multiple_pages_artifacts/);
  assert.match(text, /run_id=42765758716/);
  assert.match(text, /run_attempt=2/);
  assert.match(text, /不是删除多余 artifact/);
});
