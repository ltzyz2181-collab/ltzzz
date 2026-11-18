#!/usr/bin/env node
// 按原 Task ID 逐条裁决历史 warning；一次只处理一个 case_id。
//
// 设计约束（2026-11-18 业主口径「按原 Task ID 清理历史 warning，不批量关闭」）：
// - 不接受批量参数，没有 --all；每个 case 必须单独给出证据文件与理由；
// - 证据必须哈希绑定，并且能在原任务日期用规范检查器复查出「已进入封闭阶段」；
// - 只解决这条历史 warning 本身，不改变生产状态、不补造认领、不宣称部署或验收；
// - 落盘后由 runDispatchOversight 在每次巡检时重新核验并应用，避免与哨兵写入竞态。
//
// 用法：
//   node scripts/adjudicate-oversight-warning.mjs --case <case_id> --task <task_id> \
//     --evidence knowledge/results/... --evidence ... --reason "证据说明"
//   node scripts/adjudicate-oversight-warning.mjs ... --write
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildAdjudication} from './lib/dispatch-oversight.mjs';

export function main(argv = process.argv.slice(2), root = '.') {
  const values = name => argv.flatMap((arg, i) => (arg === name && argv[i + 1] ? [argv[i + 1]] : []));
  const arg = name => values(name)[0] || null;
  const caseId = arg('--case'), taskId = arg('--task'), reason = arg('--reason');
  const evidence = values('--evidence');
  const reviewedAt = arg('--reviewed-at') || new Date().toISOString();
  root = arg('--root') || root;
  if (!caseId || !taskId || !reason || evidence.length === 0) {
    console.error('用法：--case <case_id> --task <task_id> --evidence <path> [--evidence <path>] --reason "..." [--reviewed-at ISO] [--write]');
    return 2;
  }
  let built;
  try {
    built = buildAdjudication({root, caseId, taskId, evidence, reason, reviewedAt});
  } catch (error) {
    console.error(JSON.stringify({error: error.message, case_id: caseId, task_id: taskId}));
    return 1;
  }
  const full = path.join(root, built.path);
  if (fs.existsSync(full)) {
    const existing = fs.readFileSync(full, 'utf8');
    const same = JSON.stringify(JSON.parse(existing)) === JSON.stringify(built.record);
    console.log(JSON.stringify({status: same ? 'already_recorded' : 'conflict_refused', path: built.path}));
    return same ? 0 : 1;
  }
  if (!argv.includes('--write')) {
    console.log(JSON.stringify({status: 'dry_run', path: built.path, record: built.record}, null, 2));
    return 0;
  }
  fs.mkdirSync(path.dirname(full), {recursive: true});
  fs.writeFileSync(full, JSON.stringify(built.record, null, 2) + '\n');
  console.log(JSON.stringify({status: 'written', path: built.path}));
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath === import.meta.url) process.exitCode = main();
