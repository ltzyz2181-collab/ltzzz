// 标题脱敏回归测试：collect-gmail-imap.py 的 redact() 必须同时打码
// 「数字在前的金额」「符号在前的金额」「长令牌」三类，且不动普通标题。
// 背景：2026-11-17 首轮实跑发现 ¥9.90 这种符号在前写法未被 AMOUNT 命中（漏脱敏）。
import {test} from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// 从测试文件位置推导仓库根目录：本机、CI、任意 worktree 都能跑，不写死云主机路径。
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const COLLECTOR = path.join(ROOT, 'scripts/collect-gmail-imap.py');

function redact(subject) {
  const py = `
import importlib.util, json
spec = importlib.util.spec_from_file_location('cg', ${JSON.stringify(COLLECTOR)})
m = importlib.util.module_from_spec(spec)
spec.loader.exec_module(m)
print(json.dumps(m.redact(${JSON.stringify(subject)}), ensure_ascii=False))
`;
  const r = spawnSync('python3', ['-c', py], {cwd: ROOT, encoding: 'utf8'});
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout.trim());
}

test('符号在前的金额也要打码（¥9.90）', () => {
  const out = redact('部分退款 ¥9.90 已到账');
  assert.ok(out.includes('<amount>'), out);
  assert.ok(!out.includes('9.90'), out);
});

test('符号在前的金额也要打码（$12.34）', () => {
  const out = redact('Payment $12.34 done');
  assert.ok(out.includes('<amount>'), out);
  assert.ok(!out.includes('12.34'), out);
});

test('数字在前的金额继续打码（128.50 USDT）', () => {
  const out = redact('Invoice 128.50 USDT due');
  assert.ok(out.includes('<amount>'), out);
  assert.ok(!out.includes('128.50'), out);
});

test('长令牌打码', () => {
  const out = redact('key sk-ant-abcdefghijklmnopqrstuvwxyz0123 here');
  assert.ok(out.includes('<token>'), out);
  assert.ok(!out.includes('sk-ant-abcdefghijklmnopqrstuvwxyz0123'), out);
});

test('普通标题不被改动', () => {
  const s = '【LTZZZ】周报 2026-11-17';
  assert.equal(redact(s), s);
});
