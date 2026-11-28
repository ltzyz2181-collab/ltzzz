#!/usr/bin/env node
// 每日卡发布闭环：分流单 -> 两张卡 -> 两次提交 -> 补派未消费的卡。
//
// 为什么分两次提交：队列的 workflow_dispatch 校验只接受「一次提交只新增卡文件」。
// 分流单属于输入证据，必须先单独提交；卡提交保持纯净，才能被队列接受。
// 卡已存在且未被消费时不再依赖“本次是否新增”，而由 dispatch-card-queue 按首次
// 新增提交补派——这修的是 run 46088301084 的 PUSHED=0 永久孤儿卡问题。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pushReceiptCommit} from '../tools/push-receipt-commit.mjs';
import {
  REPO_ROOT,
  businessDate,
  cardPath,
  collectEvidence,
  opsCardPath,
  writeDailyCards,
} from './dispatch-daily-card.mjs';
import {writeTriage} from './build-deep-backlog-triage.mjs';
import {
  DEFAULT_RECEIPTS_DIR,
  dispatchCards,
  findCardAddCommit,
  findInFlightRun,
  loadReceipts,
  recentQueueRuns,
} from './dispatch-card-queue.mjs';

export function commitAndPush({root, paths, message, exec = execFileSync, push = pushReceiptCommit}) {
  const existing = paths.filter((rel) => {
    try {
      return fs.statSync(path.join(root, rel)).isFile();
    } catch {
      return false;
    }
  });
  if (!existing.length) return {status: 'no_files'};
  exec('git', ['add', '--', ...existing], {cwd: root});
  try {
    exec('git', ['diff', '--staged', '--quiet'], {cwd: root, stdio: 'ignore'});
    return {status: 'unchanged'};
  } catch {
    /* 有暂存差异，继续提交。 */
  }
  exec('git', ['config', 'user.name', 'ltzzz-bot'], {cwd: root});
  exec('git', ['config', 'user.email', 'bot@ltzzz.com'], {cwd: root});
  exec('git', ['commit', '-m', message], {cwd: root, stdio: 'inherit'});
  const result = push({cwd: root});
  return {status: 'pushed', commit: result.commit};
}

// `--skip-generate` 复用的是同一 run 前一步已写盘、但还没提交的分流单。
// 只回读 summary 而不带回文件路径，会让 brief 提交拿到空路径（run 46094118691
// 的 brief=no_files），Deep 的 repo_read 里就没有 275 条逐项分流，只能编 T001…
// 所以这里必须把实际存在的文件路径和字节数一起带回去。
const reuseTriage = (root, date) => {
  const candidates = {
    latest: 'knowledge/results/deep-superagent/backlog/latest.json',
    summary: 'knowledge/results/deep-superagent/backlog/summary.json',
    dated: `knowledge/results/deep-superagent/backlog/${date}.json`,
  };
  const files = {};
  const bytes = {};
  for (const [key, rel] of Object.entries(candidates)) {
    try {
      const stat = fs.statSync(path.join(root, rel));
      if (!stat.isFile()) continue;
      files[key] = rel;
      bytes[key] = stat.size;
    } catch {
      /* 缺哪个就只提交存在的，全部缺失时退回重新生成。 */
    }
  }
  if (!files.summary && !files.latest) return null;
  let summary = null;
  for (const key of ['summary', 'latest']) {
    if (!files[key]) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(root, files[key]), 'utf8'));
      summary = key === 'summary' ? parsed : parsed.summary;
      break;
    } catch {
      /* 解析失败时退回重新生成。 */
    }
  }
  if (!summary) return null;
  return {status: 'reused', date, files, bytes, summary};
};

export async function publishDailyCards({
  root = REPO_ROOT,
  date = businessDate(),
  suffix = 1,
  env = process.env,
  fetcher = fetch,
  exec = execFileSync,
  git = execFileSync,
  push = pushReceiptCommit,
  skipGenerate = false,
} = {}) {
  const triage = (skipGenerate && reuseTriage(root, date)) || writeTriage({root, date});
  const evidence = collectEvidence(root);
  const cards = writeDailyCards({root, date, evidence, suffix, triage});
  const brief = commitAndPush({
    root,
    paths: Object.values(triage.files),
    message: `Deep backlog brief ${date}`,
    exec,
    push,
  });
  const cardCommit = commitAndPush({
    root,
    paths: cards.cards.map((item) => item.path),
    message: `Deep daily cards ${date}`,
    exec,
    push,
  });
  const list = [cardPath(date, suffix), opsCardPath(date, suffix)].map((rel) => ({
    path: rel,
    commit: findCardAddCommit(rel, {cwd: root, exec: git}),
  }));
  const receipts = loadReceipts(path.join(root, DEFAULT_RECEIPTS_DIR));
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  let inFlightRun = null;
  if (token && repository) {
    try {
      inFlightRun = findInFlightRun(await recentQueueRuns({fetcher, token, repository}));
    } catch {
      /* 读不到运行历史不阻断；补派仍受队列自身租约与幂等保护。 */
    }
  }
  const dispatch = token && repository
    ? await dispatchCards({cards: list, receipts, fetcher, token, repository, inFlightRun})
    : {cards: list.map((card) => ({card: card.path, status: 'dispatch_skipped_no_token'})), dispatched: []};
  return {
    date,
    suffix,
    triage: {status: triage.status, files: triage.files, bytes: triage.bytes, totals: triage.summary?.totals ?? null},
    cards: cards.cards.map((item) => ({path: item.path, status: item.status})),
    commits: {brief, card: cardCommit},
    dispatch,
  };
}

function main(argv = process.argv.slice(2)) {
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  const date = get('--date') || businessDate();
  const root = get('--root') || REPO_ROOT;
  const suffix = get('--suffix') ? Number(get('--suffix')) : 1;
  publishDailyCards({root, date, suffix, skipGenerate: argv.includes('--skip-generate')})
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 1) + '\n');
    })
    .catch((error) => {
      process.stderr.write(`[publish-daily-cards] ${String(error?.message || error).slice(0, 300)}\n`);
      process.exitCode = 2;
    });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main();
}
