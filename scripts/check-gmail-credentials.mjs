#!/usr/bin/env node
// Phase 1 凭据就绪检查：只看「文件在不在、权限对不对、键名齐不齐」，绝不读取或打印密码值。
//
// 依据工单 §四：Owner 在本机自行配置 Gmail IMAP 应用专用密码；密码不得发给任何 AI、
// 不得进入仓库或 Actions 日志。因此本脚本的输出只允许出现键名与状态。
//
// 用法：
//   node scripts/check-gmail-credentials.mjs [--write <status.json>] [--json]
// 退出码：0 = ready；2 = blocked（缺文件/权限过宽/缺键）；3 = 检查自身失败

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';

export const REQUIRED_KEYS = ['GMAIL_IMAP_USER', 'GMAIL_IMAP_APP_PASSWORD'];
export const SCHEMA = 'ltzzz.gmail-credential-check.v1';

export function defaultEnvFile(env = process.env) {
  return env.GMAIL_IMAP_ENV_FILE
    || path.join(env.HOME || os.homedir() || '', '.config/ltzzz/gmail-imap.env');
}

function parseKeys(text) {
  const names = [];
  let malformed = 0;
  for (const line of String(text).split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=/);
    if (match) names.push(match[1]);
    else malformed += 1;
  }
  return {names, malformed};
}

/**
 * 检查凭据文件。返回值只含键名和状态，绝不含值。
 */
export function checkCredentials({envFile = defaultEnvFile(), env = process.env, platform = process.platform} = {}) {
  const base = {
    schema: SCHEMA,
    checked_at: new Date().toISOString(),
    file: envFile,
    values_printed: false,
    password_value_emitted: false,
  };
  if (env.GMAIL_IMAP_APP_PASSWORD) {
    // 环境变量已注入（例如 CI secret 或 systemd EnvironmentFile）：不再读文件。
    return {
      ...base,
      status: 'ready',
      source: 'environment',
      keys_present: REQUIRED_KEYS.filter((key) => Boolean(env[key])),
      missing_keys: REQUIRED_KEYS.filter((key) => !env[key]),
      permissions_checked: false,
    };
  }

  let stat;
  try {
    stat = fs.statSync(envFile);
  } catch {
    return {
      ...base,
      status: 'file_missing',
      source: 'file',
      hint: 'Owner 需在本机自行创建 600 权限凭据文件；本工单不要求、也不接收密码。',
      missing_keys: REQUIRED_KEYS,
    };
  }
  if (!stat.isFile()) {
    return {...base, status: 'not_a_file', source: 'file', missing_keys: REQUIRED_KEYS};
  }

  const mode = stat.mode & 0o777;
  const permissionsChecked = platform !== 'win32';
  const insecure = permissionsChecked && (mode & 0o077) !== 0;
  if (insecure) {
    return {
      ...base,
      status: 'insecure_permissions',
      source: 'file',
      mode: mode.toString(8).padStart(3, '0'),
      permissions_checked: true,
      hint: '凭据文件不得对同组或其他用户可读：chmod 600',
      missing_keys: [],
    };
  }

  let text;
  try {
    text = fs.readFileSync(envFile, 'utf8');
  } catch {
    return {...base, status: 'unreadable', source: 'file', missing_keys: REQUIRED_KEYS};
  }
  const {names, malformed} = parseKeys(text);
  const missing = REQUIRED_KEYS.filter((key) => !names.includes(key));
  return {
    ...base,
    status: missing.length ? 'missing_keys' : 'ready',
    source: 'file',
    mode: permissionsChecked ? mode.toString(8).padStart(3, '0') : null,
    permissions_checked: permissionsChecked,
    keys_present: names.filter((name) => REQUIRED_KEYS.includes(name)),
    missing_keys: missing,
    extra_keys_count: names.filter((name) => !REQUIRED_KEYS.includes(name)).length,
    malformed_lines: malformed,
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const get = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    write: get('--write', null),
    json: argv.includes('--json'),
    envFile: get('--env-file', defaultEnvFile()),
  };
}

function main() {
  const args = parseArgs();
  let result;
  try {
    result = checkCredentials({envFile: args.envFile});
  } catch (error) {
    console.error(JSON.stringify({status: 'check_failed', error_class: error?.name || 'Error', note: String(error?.message || error).slice(0, 160)}));
    process.exitCode = 3;
    return;
  }
  if (args.write) {
    fs.mkdirSync(path.dirname(args.write), {recursive: true});
    fs.writeFileSync(args.write, JSON.stringify(result, null, 1) + '\n');
  }
  if (args.json || args.write) {
    console.log(JSON.stringify(result, null, 1));
  } else {
    console.log(`status=${result.status} file=${result.file} keys=${(result.keys_present || []).join(',') || '-'} missing=${(result.missing_keys || []).join(',') || '-'}`);
  }
  process.exitCode = result.status === 'ready' ? 0 : 2;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();
