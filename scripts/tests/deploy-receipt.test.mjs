import test from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { validateReceipt, hashFiles } from '../deploy-receipt.mjs';

const base = () => ({
  schema: 'ltzzz.deploy.receipt.v1',
  receipt_id: 'DR-20261117-demo-fn',
  target: 'demo-fn',
  platform: 'tcb',
  env_id: 'env-abc',
  code_commit: 'f48fd14ad',
  code_path: 'miniprogram/cloudfunctions/order-deliver',
  deployed_at: '2026-11-17T14:42:59+08:00',
  verified: [{ kind: 'function_detail', result: 'ok', evidence: 'Status Active' }],
  blockers: [],
  next_action: null,
});

test('合法回执零问题', () => {
  assert.deepEqual(validateReceipt(base()), []);
});

test('缺必填字段要报出来', () => {
  const receipt = base();
  delete receipt.code_commit;
  const problems = validateReceipt(receipt);
  assert.ok(problems.some((p) => p.includes('code_commit')));
});

test('receipt_id 必须符合 DR-YYYYMMDD-slug', () => {
  const receipt = base();
  receipt.receipt_id = 'order-deliver-receipt';
  assert.ok(validateReceipt(receipt).some((p) => p.includes('receipt_id')));
});

test('verified 不能为空，且每条要有 kind/result/evidence', () => {
  const empty = base();
  empty.verified = [];
  assert.ok(validateReceipt(empty).some((p) => p.includes('verified 必须是非空数组')));

  const missing = base();
  missing.verified = [{ kind: 'invoke_smoke', result: 'ok' }];
  assert.ok(validateReceipt(missing).some((p) => p.includes('verified[0] 缺少 evidence')));
});

test('没验过就必须写 blockers 和 next_action', () => {
  const receipt = base();
  receipt.verified = [{ kind: 'invoke_smoke', result: 'failed', evidence: 'CAM auth failed' }];
  const problems = validateReceipt(receipt);
  assert.ok(problems.some((p) => p.includes('blockers')));
  assert.ok(problems.some((p) => p.includes('next_action')));

  receipt.blockers = ['MCP 调不起 invoke：CAM authentication failed'];
  receipt.next_action = '用桌面 tcb CLI 冒烟调用';
  assert.deepEqual(validateReceipt(receipt), []);
});

test('哈希覆盖目录内全部文件并跳过 node_modules', () => {
  const root = mkdtempSync(join(tmpdir(), 'dr-'));
  mkdirSync(join(root, 'fn', 'lib'), { recursive: true });
  mkdirSync(join(root, 'fn', 'node_modules', 'x'), { recursive: true });
  writeFileSync(join(root, 'fn', 'index.js'), 'a');
  writeFileSync(join(root, 'fn', 'lib', 'logic.js'), 'b');
  writeFileSync(join(root, 'fn', 'node_modules', 'x', 'i.js'), 'c');

  const { hashes } = hashFiles(root, 'fn');
  assert.deepEqual(Object.keys(hashes).sort(), ['index.js', 'lib/logic.js']);

  writeFileSync(join(root, 'fn', 'lib', 'logic.js'), 'b2');
  const changed = hashFiles(root, 'fn').hashes;
  assert.notEqual(changed['lib/logic.js'], hashes['lib/logic.js']);
});

test('目录不存在时返回错误而不是空哈希', () => {
  const root = mkdtempSync(join(tmpdir(), 'dr-'));
  assert.match(hashFiles(root, 'missing').error, /不存在/);
});
