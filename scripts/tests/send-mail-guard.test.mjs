import test from 'node:test';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SCRIPT = path.join(ROOT, 'scripts', 'send-mail.py');

// Every case here must fail BEFORE any network call: a guard test that could
// actually connect would risk sending real mail from CI.
function run(env) {
  const merged = {PATH: process.env.PATH, ...env};
  for (const key of ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS', 'MAIL_TO', 'MAIL_SUBJECT', 'MAIL_BODY_PATH', 'MAIL_PORT']) {
    if (!(key in env)) delete merged[key];
  }
  try {
    execFileSync('python3', [SCRIPT], {env: merged, encoding: 'utf8', stdio: 'pipe', timeout: 10000});
    return {code: 0, err: ''};
  } catch (error) {
    return {code: error.status ?? -1, err: String(error.stderr || '')};
  }
}

const BODY = path.join(os.tmpdir(), 'ltzzz-mail-body.txt');
fs.writeFileSync(BODY, 'body');
const EMPTY = path.join(os.tmpdir(), 'ltzzz-mail-empty.txt');
fs.writeFileSync(EMPTY, '');

test('缺少凭据时拒绝发送，不降级为日志', () => {
  const r = run({MAIL_TO: 'x@y.z', MAIL_SUBJECT: 's', MAIL_BODY_PATH: BODY});
  assert.equal(r.code, 2);
  assert.match(r.err, /缺少凭据/);
  assert.match(r.err, /MAIL_HOST/);
});

test('任一项凭据缺失都拒绝，不部分发送', () => {
  for (const missing of ['MAIL_HOST', 'MAIL_USER', 'MAIL_PASS']) {
    const env = {MAIL_HOST: 'h', MAIL_USER: 'u', MAIL_PASS: 'p', MAIL_TO: 'x@y.z', MAIL_SUBJECT: 's', MAIL_BODY_PATH: BODY};
    delete env[missing];
    const r = run(env);
    assert.equal(r.code, 2, `${missing} 缺失时应拒绝`);
    assert.match(r.err, new RegExp(missing));
  }
});

test('收件地址无效或未设置时拒绝', () => {
  for (const to of ['', 'not-an-address']) {
    const r = run({MAIL_HOST: 'h', MAIL_USER: 'u', MAIL_PASS: 'p', MAIL_TO: to, MAIL_SUBJECT: 's', MAIL_BODY_PATH: BODY});
    assert.equal(r.code, 2);
    assert.match(r.err, /MAIL_TO/);
  }
});

test('正文文件不存在时拒绝', () => {
  const r = run({MAIL_HOST: 'h', MAIL_USER: 'u', MAIL_PASS: 'p', MAIL_TO: 'x@y.z', MAIL_SUBJECT: 's', MAIL_BODY_PATH: path.join(os.tmpdir(), 'ltzzz-does-not-exist.md')});
  assert.equal(r.code, 3);
  assert.match(r.err, /不存在/);
});

test('正文为空时拒绝，避免发出一封空白邮件', () => {
  const r = run({MAIL_HOST: 'h', MAIL_USER: 'u', MAIL_PASS: 'p', MAIL_TO: 'x@y.z', MAIL_SUBJECT: 's', MAIL_BODY_PATH: EMPTY});
  assert.equal(r.code, 3);
  assert.match(r.err, /为空/);
});

test('成功路径的判定只在服务器接受之后输出 SENT', () => {
  const source = fs.readFileSync(SCRIPT, 'utf8');
  const sentAt = source.indexOf('print(f"SENT');
  const sendAt = source.indexOf('server.send_message(msg)');
  assert.notEqual(sendAt, -1, '必须实际调用 send_message');
  assert.ok(sentAt > sendAt, 'SENT 只能出现在 send_message 之后');
  assert.equal(/print\(.*MAIL_PASS/.test(source), false, '不得打印密码');
});
