// 凭据检查测试：只报状态与键名，任何情况下都不得输出密码值。
// 对应工单 §四：密码不得发给 AI、不得进入仓库或 Actions 日志。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {
  REQUIRED_KEYS,
  checkCredentials,
  defaultEnvFile,
  parseArgs,
} from '../check-gmail-credentials.mjs';

const SCRIPT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../check-gmail-credentials.mjs");

const SECRET = 'abcd efgh ijkl mnop';

function tmpEnv(contents, mode = 0o600) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-cred-'));
  const file = path.join(dir, 'gmail-imap.env');
  fs.writeFileSync(file, contents);
  fs.chmodSync(file, mode);
  return file;
}

test('文件缺失时 fail-closed，且提示不索要密码', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-cred-'));
  const result = checkCredentials({envFile: path.join(dir, 'none.env'), env: {}, platform: 'linux'});
  assert.equal(result.status, 'file_missing');
  assert.deepEqual(result.missing_keys, REQUIRED_KEYS);
  assert.match(result.hint, /不接收密码/);
  assert.equal(result.values_printed, false);
});

test('权限过宽直接判不安全，不继续谈可用', () => {
  const file = tmpEnv(`GMAIL_IMAP_USER=ltzyz2181@gmail.com\nGMAIL_IMAP_APP_PASSWORD=${SECRET}\n`, 0o644);
  const result = checkCredentials({envFile: file, env: {}, platform: 'linux'});
  assert.equal(result.status, 'insecure_permissions');
  assert.equal(result.mode, '644');
});

test('600 权限且键齐全时 ready，只报键名', () => {
  const file = tmpEnv(`GMAIL_IMAP_USER=ltzyz2181@gmail.com\nGMAIL_IMAP_APP_PASSWORD=${SECRET}\n`);
  const result = checkCredentials({envFile: file, env: {}, platform: 'linux'});
  assert.equal(result.status, 'ready');
  assert.deepEqual(result.keys_present.sort(), [...REQUIRED_KEYS].sort());
  assert.equal(result.values_printed, false);
  assert.equal(result.password_value_emitted, false);
  const text = JSON.stringify(result);
  assert.ok(!text.includes(SECRET), '输出不得包含密码值');
  assert.ok(!text.includes('ltzyz2181@gmail.com'), '输出不得包含邮箱值');
});

test('缺键时明确指出缺哪几个', () => {
  const file = tmpEnv('GMAIL_IMAP_USER=ltzyz2181@gmail.com\n');
  const result = checkCredentials({envFile: file, env: {}, platform: 'linux'});
  assert.equal(result.status, 'missing_keys');
  assert.deepEqual(result.missing_keys, ['GMAIL_IMAP_APP_PASSWORD']);
});

test('环境变量已注入时不再读文件，也不回显值', () => {
  const result = checkCredentials({
    envFile: '/nonexistent/should-not-be-read',
    env: {GMAIL_IMAP_USER: 'ltzyz2181@gmail.com', GMAIL_IMAP_APP_PASSWORD: SECRET},
    platform: 'linux',
  });
  assert.equal(result.status, 'ready');
  assert.equal(result.source, 'environment');
  assert.ok(!JSON.stringify(result).includes(SECRET));
});

test('默认路径遵循 GMAIL_IMAP_ENV_FILE 覆盖', () => {
  assert.equal(defaultEnvFile({GMAIL_IMAP_ENV_FILE: '/x/y.env', HOME: '/home/u'}), '/x/y.env');
  assert.equal(defaultEnvFile({HOME: '/home/u'}), '/home/u/.config/ltzzz/gmail-imap.env');
});

test("parseArgs 支持 --credentials-file 的两种写法", () => {
  assert.equal(parseArgs(["--credentials-file", "/a/b.env"]).envFile, "/a/b.env");
  assert.equal(parseArgs(["--credentials-file=/a/b.env"]).envFile, "/a/b.env");
  assert.equal(parseArgs([]).envFile, defaultEnvFile());
});

test("CLI 真实调用：文件缺失时退出码 2，参数没有被 Node 吞掉", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ltzzz-cred-"));
  const absent = path.join(dir, "absent.env");
  const run = spawnSync(process.execPath, [SCRIPT, "--credentials-file", absent, "--json"], {
    encoding: "utf8",
    env: {...process.env, GMAIL_IMAP_APP_PASSWORD: "", GMAIL_IMAP_ENV_FILE: ""},
  });
  assert.equal(run.signal, null, "进程不得因参数解析失败而异常退出");
  assert.equal(run.status, 2, `期望 2（blocked），实际 ${run.status}: ${run.stderr}`);
  const parsed = JSON.parse(run.stdout);
  assert.equal(parsed.status, "file_missing");
  assert.equal(parsed.values_printed, false);
});

test("CLI 真实调用：--credentials-file=<path> 等号写法同样可用", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ltzzz-cred-"));
  const absent = path.join(dir, "absent.env");
  const run = spawnSync(process.execPath, [SCRIPT, `--credentials-file=${absent}`, "--json"], {
    encoding: "utf8",
    env: {...process.env, GMAIL_IMAP_APP_PASSWORD: "", GMAIL_IMAP_ENV_FILE: ""},
  });
  assert.equal(run.status, 2, `期望 2（blocked），实际 ${run.status}: ${run.stderr}`);
});

test("CLI 真实调用：600 权限齐全时退出码 0，输出不含密码", () => {
  const file = tmpEnv(`GMAIL_IMAP_USER=ltzyz2181@gmail.com
GMAIL_IMAP_APP_PASSWORD=${SECRET}
`);
  const run = spawnSync(process.execPath, [SCRIPT, "--credentials-file", file, "--json"], {
    encoding: "utf8",
    env: {...process.env, GMAIL_IMAP_APP_PASSWORD: "", GMAIL_IMAP_ENV_FILE: ""},
  });
  assert.equal(run.status, 0, `期望 0（ready），实际 ${run.status}: ${run.stderr}`);
  assert.ok(!run.stdout.includes(SECRET), "stdout 不得包含密码值");
  assert.ok(!run.stderr.includes(SECRET), "stderr 不得包含密码值");
});
