// Agent Mail（agently-cli）定位与失败分类。
//
// 背景：CI 的 intake job 没有 agently-cli，也没有 Agent Mail 会话；旧实现直接
// execFileSync('agently-cli')，ENOENT 被当成普通异常，产物里既没有 BLOCKED_EVIDENCE，
// 也可能把上一次的 ok 结果继续留在 latest.json。这里把“找不到可执行文件”与
// “找到了但执行失败”分开，供三个调用方共用。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const AGENTLY_BLOCK_CODE = 'BLOCKED_EVIDENCE';
export const DEFAULT_AGENTLY_BIN = 'agently-cli';

const BIN_NAMES = process.platform === 'win32'
  ? ['agently-cli.cmd', 'agently-cli.exe', 'agently-cli']
  : ['agently-cli'];

/**
 * 纯函数：按 env → 已知 npm 全局目录 → PATH 的顺序定位 agently-cli。
 * 不执行文件、不验证登录态；只回答“这个二进制在不在”。
 */
export function resolveAgentlyCli({
  env = process.env,
  home = env.HOME || os.homedir(),
  exists = fs.existsSync,
  platform = process.platform,
} = {}) {
  if (env.AGENTLY_CLI) return {bin: env.AGENTLY_CLI, source: 'env', found: true};

  const names = platform === 'win32' ? BIN_NAMES : ['agently-cli'];
  const dirs = ['/home/user/.npm-global/bin', path.join(home, '.npm-global/bin')];
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      if (exists(candidate)) return {bin: candidate, source: 'npm-global', found: true};
    }
  }

  for (const dir of String(env.PATH || '').split(path.delimiter)) {
    const trimmed = dir.trim();
    if (!trimmed) continue;
    for (const name of names) {
      const candidate = path.join(trimmed, name);
      if (exists(candidate)) return {bin: candidate, source: 'path', found: true};
    }
  }

  return {bin: DEFAULT_AGENTLY_BIN, source: 'unresolved', found: false};
}

/**
 * 纯函数：把 agently-cli 的异常折成可落盘的失败分类。
 * ENOENT 是“缺证据/缺运行环境”，不是“没有邮件”；必须显式 BLOCKED_EVIDENCE。
 */
export function classifyAgentlyError(error, {bin = DEFAULT_AGENTLY_BIN} = {}) {
  const code = String(error?.code || error?.cause?.code || '');
  const message = String(error?.message || error || '');
  if (code === 'ENOENT' || /\bENOENT\b/.test(message)) {
    return {
      status: 'blocked',
      block_code: AGENTLY_BLOCK_CODE,
      error_class: 'ENOENT',
      error: `agently-cli unavailable (ENOENT): ${bin}`,
      install_hint: 'agently-cli is not in the public npm registry (npm view agently-cli -> 404) and is not on PATH; obtain the binary or private package source from the Agent Mail administrator and set AGENTLY_CLI. Do not fake the channel.',
      retryable: false,
    };
  }
  if (code === 'ETIMEDOUT' || error?.killed === true || /ETIMEDOUT|timed?\s*out/i.test(message)) {
    return {
      status: 'failed',
      block_code: null,
      error_class: 'timeout',
      error: message.slice(0, 200) || 'agently-cli timeout',
      install_hint: null,
      retryable: true,
    };
  }
  return {
    status: 'failed',
    block_code: null,
    error_class: code || error?.name || 'Error',
    error: message.slice(0, 200) || 'agently-cli failed',
    install_hint: null,
    retryable: true,
  };
}
