#!/usr/bin/env node
// 重要任务多席派单：把「Deep 主办 + Claude 中转 + GPT 中转复核」变成可校验的任务卡约束。
// 政策来源：config/dispatch-seat-policy-20261117.json（owner 2026-11-17 口述）。
//
// 用法：
//   node scripts/dispatch-seat-policy.mjs template --task-id X --package-id Y --importance high
//   node scripts/dispatch-seat-policy.mjs check [--dir ops/deep-superagent/tasks]
//
// check 只校验「显式声明了 importance 或 seats」的卡（新政策卡），历史卡计入 legacy 统计但不判错。

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
export const POLICY_PATH = 'config/dispatch-seat-policy-20261117.json';

export function loadPolicy(root = ROOT) {
  const abs = path.join(root, POLICY_PATH);
  if (!existsSync(abs)) throw new Error(`策略不存在：${POLICY_PATH}`);
  const policy = JSON.parse(readFileSync(abs, 'utf8'));
  if (policy.schema !== 'ltzzz.dispatch.seat-policy.v1') throw new Error('策略 schema 不匹配');
  return policy;
}

export function requiredSeats(policy, importance) {
  const level = policy.importance_levels[importance];
  if (!level) throw new Error(`未知 importance：${importance}`);
  return level.seats.filter((s) => s.required).map((s) => ({ seat: s.seat, role: s.role }));
}

export function buildCard({ policy, taskId, packageId, importance, prompt = '' }) {
  if (!taskId || !packageId) throw new Error('task_id 与 package_id 必填');
  const seats = requiredSeats(policy, importance).map((s) => ({ ...s, decision_authority: false }));
  return {
    task_id: taskId,
    package_id: packageId,
    prompt,
    data_classification: 'public_distributable',
    platform: 'internal',
    importance,
    seats,
  };
}

// 返回问题列表；空数组表示合规。
export function checkCard(policy, card, file = '<inline>') {
  const problems = [];
  if (!card || typeof card !== 'object') return [`${file}: 不是对象`];
  const declared = card.importance ?? null;
  const hasSeats = Array.isArray(card.seats);
  if (!declared && !hasSeats) return []; // legacy 卡，不计错
  if (!declared) problems.push(`${file}: 有 seats 但缺 importance`);
  if (declared && !policy.importance_levels[declared]) problems.push(`${file}: 非法 importance=${declared}`);
  if (declared && policy.importance_levels[declared]) {
    const need = requiredSeats(policy, declared);
    for (const n of need) {
      const got = (card.seats || []).find((s) => s && s.seat === n.seat);
      if (!got) problems.push(`${file}: 缺必需席位 ${n.seat}(${n.role})`);
      else if (got.role !== n.role) problems.push(`${file}: ${n.seat} 角色应为 ${n.role}，实为 ${got.role}`);
      else if (got.decision_authority === true) problems.push(`${file}: ${n.seat} 不得持有裁决权（decision_authority=true）`);
    }
  }
  return problems;
}

function cmdTemplate(args) {
  const get = (k) => {
    const i = args.indexOf(`--${k}`);
    return i >= 0 ? args[i + 1] : '';
  };
  const policy = loadPolicy();
  const card = buildCard({
    policy,
    taskId: get('task-id'),
    packageId: get('package-id'),
    importance: get('importance') || 'high',
    prompt: get('prompt'),
  });
  process.stdout.write(JSON.stringify(card, null, 1) + '\n');
  return 0;
}

function cmdCheck(args) {
  const dirArg = args.indexOf('--dir') >= 0 ? args[args.indexOf('--dir') + 1] : 'ops/deep-superagent/tasks';
  const policy = loadPolicy();
  const dir = path.join(ROOT, dirArg);
  if (!existsSync(dir)) throw new Error(`目录不存在：${dirArg}`);
  const files = readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  const problems = [];
  let checked = 0;
  let legacy = 0;
  for (const f of files) {
    let card;
    try {
      card = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    } catch (err) {
      problems.push(`${f}: JSON 非法（${err.message}）`);
      continue;
    }
    const p = checkCard(policy, card, f);
    if (!card.importance && !Array.isArray(card.seats)) legacy += 1;
    else checked += 1;
    problems.push(...p);
  }
  process.stdout.write(JSON.stringify({ checked, legacy, problems }, null, 1) + '\n');
  return problems.length ? 1 : 0;
}

function main(argv) {
  const [cmd, ...args] = argv;
  try {
    if (cmd === 'template') return cmdTemplate(args);
    if (cmd === 'check') return cmdCheck(args);
    console.error('用法：template --task-id X --package-id Y --importance high | check [--dir ...]');
    return 2;
  } catch (err) {
    console.error(`[dispatch-seat-policy] ${err.message}`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exit(main(process.argv.slice(2)));
}
