// 正文按需读取（BODY.PEEK）的入口测试：调用 Python 单测，并在 Node 侧再做一次
// 源文件纪律检查，保证即使 CI 只有 Node 也会拦住「把只读改成可写」的改动。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PY_FILE = path.join(ROOT, 'scripts/tests/test_gmail_imap_body.py');
const COLLECTOR = path.join(ROOT, 'scripts/collect-gmail-imap.py');

function hasPython() {
  const probe = spawnSync('python3', ['--version'], {encoding: 'utf8'});
  return probe.status === 0;
}

test('Python 正文读取单测通过（31 项）', {skip: !hasPython() && 'python3 不可用'}, () => {
  const run = spawnSync('python3', [PY_FILE], {cwd: ROOT, encoding: 'utf8', timeout: 120000});
  const output = `${run.stdout || ''}\n${run.stderr || ''}`;
  assert.equal(run.status, 0, `python unittest 失败：\n${output.slice(-4000)}`);
  assert.match(output, /Ran \d+ tests/);
  assert.match(output, /\nOK\b/);
});

test('采集脚本没有可写邮箱的命令路径', () => {
  const source = fs.readFileSync(COLLECTOR, 'utf8');
  for (const pattern of [/\.store\(/i, /\.expunge\(/i, /\.copy\(/i, /\.move\(/i, /uid\(\s*['"]STORE/i]) {
    assert.ok(!pattern.test(source), `collect-gmail-imap.py 不得出现 ${pattern}`);
  }
});

test('正文读取只允许 BODY.PEEK，SELECT 必须 readonly', () => {
  const source = fs.readFileSync(COLLECTOR, 'utf8');
  assert.ok(!/BODY\[(?!PEEK)/.test(source), '不得出现非 PEEK 的 BODY[...]');
  assert.match(source, /select\('INBOX', readonly=True\)/);
  assert.match(source, /BODY\.PEEK\[TEXT\]/);
  assert.match(source, /BODY\.PEEK\[HEADER\.FIELDS/);
});

test('正文落盘前有隐私自检，且产物声明不含正文', () => {
  const source = fs.readFileSync(COLLECTOR, 'utf8');
  assert.match(source, /def assert_privacy\(/);
  assert.match(source, /contains_mail_body': False/);
  assert.match(source, /bodies_persisted': False/);
  // 写盘函数必须先过 assert_privacy。
  const writeBody = source.slice(source.indexOf('def write(payload):'), source.indexOf('def base('));
  assert.ok(writeBody.indexOf('assert_privacy(payload)') >= 0);
  assert.ok(writeBody.indexOf('assert_privacy(payload)') < writeBody.indexOf('json.dump(payload'));
});
