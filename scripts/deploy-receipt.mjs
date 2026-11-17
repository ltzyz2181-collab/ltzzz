#!/usr/bin/env node
// 部署回执（deploy receipt）：每次部署必须留一张可回读的回执，避免“下次裁决又重来一遍”。
// 只记录部署事实与证据引用，不存凭据、不存密钥、不替部署动作本身背书。
// 用法：
//   node scripts/deploy-receipt.mjs record <draft.json>   校验草稿并落 ops/deploy-receipts/<receipt_id>.json
//   node scripts/deploy-receipt.mjs verify <receipt_id>   回读回执并按仓库当前代码重算哈希，检出漂移
//   node scripts/deploy-receipt.mjs latest [target]       列出最近回执（某目标只看最近一张）
//   node scripts/deploy-receipt.mjs list                  列出全部回执摘要

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCHEMA = 'ltzzz.deploy.receipt.v1';
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT_DIR = join(ROOT, 'ops', 'deploy-receipts');

const REQUIRED = [
  'schema',
  'receipt_id',
  'target',
  'platform',
  'env_id',
  'code_commit',
  'code_path',
  'deployed_at',
  'verified',
  'blockers',
  'next_action',
];

const RECEIPT_ID_RE = /^DR-\d{8}-[a-z0-9][a-z0-9-]{0,40}$/;
const COMMIT_RE = /^[0-9a-f]{7,40}$/;
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

export function validateReceipt(receipt) {
  const problems = [];
  if (!receipt || typeof receipt !== 'object') return ['回执必须是对象'];
  for (const key of REQUIRED) {
    if (!(key in receipt)) problems.push(`缺少必填字段 ${key}`);
  }
  if (receipt.schema !== SCHEMA) problems.push(`schema 必须是 ${SCHEMA}`);
  if (typeof receipt.receipt_id === 'string' && !RECEIPT_ID_RE.test(receipt.receipt_id)) {
    problems.push('receipt_id 格式应为 DR-YYYYMMDD-<slug>');
  }
  if (typeof receipt.code_commit === 'string' && !COMMIT_RE.test(receipt.code_commit)) {
    problems.push('code_commit 必须是 git 提交 SHA（7-40 位十六进制）');
  }
  if (typeof receipt.deployed_at === 'string' && !ISO_RE.test(receipt.deployed_at)) {
    problems.push('deployed_at 必须是带时区的 ISO 时间');
  }
  if (receipt.verified !== undefined) {
    if (!Array.isArray(receipt.verified) || receipt.verified.length === 0) {
      problems.push('verified 必须是非空数组（至少一条部署后回读证据）');
    } else {
      receipt.verified.forEach((entry, index) => {
        for (const key of ['kind', 'result', 'evidence']) {
          if (!entry || typeof entry[key] !== 'string' || !entry[key].trim()) {
            problems.push(`verified[${index}] 缺少 ${key}`);
          }
        }
      });
    }
  }
  if (receipt.blockers !== undefined && !Array.isArray(receipt.blockers)) {
    problems.push('blockers 必须是数组（无阻碍时写空数组）');
  }
  const ok = Array.isArray(receipt.verified)
    ? receipt.verified.every((entry) => entry && entry.result === 'ok')
    : false;
  if (!ok && (!Array.isArray(receipt.blockers) || receipt.blockers.length === 0)) {
    problems.push('非全绿回执必须写 blockers，说明卡在哪一步');
  }
  if (!ok && (receipt.next_action === null || receipt.next_action === undefined)) {
    problems.push('非全绿回执必须写 next_action（下一手动作）');
  }
  return problems;
}

export function hashFiles(rootDir, codePath) {
  const dir = join(rootDir, codePath);
  if (!existsSync(dir)) return { error: `代码目录不存在：${codePath}` };
  const hashes = {};
  const walk = (sub) => {
    for (const entry of readdirSync(join(dir, sub), { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue;
      const rel = sub ? `${sub}/${entry.name}` : entry.name;
      if (entry.isDirectory()) walk(rel);
      else if (entry.isFile()) {
        hashes[rel] = createHash('sha256')
          .update(readFileSync(join(dir, rel)))
          .digest('hex');
      }
    }
  };
  walk('');
  return { hashes };
}

function receiptPath(id) {
  return join(OUT_DIR, `${id}.json`);
}

function listReceipts() {
  if (!existsSync(OUT_DIR)) return [];
  return readdirSync(OUT_DIR)
    .filter((name) => name.endsWith('.json'))
    .map((name) => JSON.parse(readFileSync(join(OUT_DIR, name), 'utf8')))
    .sort((a, b) => String(a.deployed_at).localeCompare(String(b.deployed_at)));
}

function summarize(receipt) {
  const green = receipt.verified.every((entry) => entry.result === 'ok');
  const line = [
    receipt.receipt_id,
    receipt.target,
    receipt.env_id,
    receipt.code_commit.slice(0, 10),
    green ? 'GREEN' : `BLOCKED(${receipt.blockers.length})`,
    receipt.deployed_at,
  ];
  return line.join(' | ');
}

function record(draftPath) {
  const draft = JSON.parse(readFileSync(draftPath, 'utf8'));
  const problems = validateReceipt(draft);
  if (problems.length) {
    console.error('回执校验未通过：');
    for (const p of problems) console.error(` - ${p}`);
    return 1;
  }
  const computed = hashFiles(ROOT, draft.code_path);
  if (computed.error) {
    console.error(computed.error);
    return 1;
  }
  draft.code_sha256 = computed.hashes;
  if (!existsSync(OUT_DIR)) mkdirSync(OUT_DIR, { recursive: true });
  const file = receiptPath(draft.receipt_id);
  if (existsSync(file)) {
    console.error(`回执已存在，不覆盖：${file}（一次部署事件一张回执，新部署请换新 receipt_id）`);
    return 1;
  }
  writeFileSync(file, `${JSON.stringify(draft, null, 2)}\n`);
  console.log(`已落回执 ${file}`);
  console.log(summarize(draft));
  return 0;
}

function verify(receiptId) {
  const file = receiptPath(receiptId);
  if (!existsSync(file)) {
    console.error(`找不到回执：${file}`);
    return 1;
  }
  const receipt = JSON.parse(readFileSync(file, 'utf8'));
  const problems = validateReceipt(receipt);
  if (problems.length) {
    console.error('回执本身不合规：');
    for (const p of problems) console.error(` - ${p}`);
    return 1;
  }
  const computed = hashFiles(ROOT, receipt.code_path);
  if (computed.error) {
    console.error(computed.error);
    return 1;
  }
  const drift = [];
  for (const [rel, sha] of Object.entries(receipt.code_sha256 || {})) {
    if (computed.hashes[rel] !== sha) drift.push(`变更：${rel}`);
  }
  for (const rel of Object.keys(computed.hashes)) {
    if (!(rel in (receipt.code_sha256 || {}))) drift.push(`新增：${rel}`);
  }
  if (drift.length) {
    console.log(`回执 ${receiptId} 与仓库当前代码不一致（部署漂移，需要重新部署并出新回执）：`);
    for (const d of drift) console.log(` - ${d}`);
    return 1;
  }
  console.log(`回执一致：${summarize(receipt)}`);
  console.log(`回读依据：`);
  for (const entry of receipt.verified) console.log(` - [${entry.kind}] ${entry.evidence}`);
  if (receipt.blockers.length) {
    console.log(`未清阻碍：${receipt.blockers.join('；')}；下一手：${receipt.next_action}`);
  }
  return 0;
}

function latest(target) {
  const all = listReceipts();
  const filtered = target ? all.filter((r) => r.target === target) : all;
  if (!filtered.length) {
    console.log(target ? `没有 ${target} 的部署回执` : '没有任何部署回执');
    return 0;
  }
  const picked = target ? [filtered[filtered.length - 1]] : filtered.slice(-10);
  for (const receipt of picked) console.log(summarize(receipt));
  return 0;
}

function runCli() {
  const [, , command, arg] = process.argv;
  try {
    if (command === 'record' && arg) {
      process.exit(record(resolve(arg)));
    } else if (command === 'verify' && arg) {
      process.exit(verify(arg));
    } else if (command === 'latest') {
      process.exit(latest(arg));
    } else if (command === 'list') {
      for (const receipt of listReceipts()) console.log(summarize(receipt));
      process.exit(0);
    }
    console.log('用法：record <draft.json> | verify <receipt_id> | latest [target] | list');
    process.exit(1);
  } catch (err) {
    console.error(err.message);
    process.exit(1);
  }
}

// 仅在被直接执行时进入 CLI；被 import（含测试）时不执行。
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCli();
}
