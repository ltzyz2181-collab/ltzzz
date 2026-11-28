#!/usr/bin/env node
// 把 main 上“已存在但尚未被消费”的 Deep 队列卡补派给队列。
//
// 背景（2026-11-28 run 46088301084）：每日工作流只有在“本次提交确实新增了卡”
// 时才 dispatch 队列；卡若由更早一次运行写入却没被消费（队列失败、push 事件被
// 抑制、或人工补卡），之后每天都会判为 unchanged -> PUSHED=0 -> 永远不再派发。
// 本脚本按“卡的首次新增提交 + 公开队列回执”判断是否已消费，未消费就补派；
// 队列脚本原有的校验不变：card_commit 必须在 main 上，且该提交只新增卡文件。
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const COMMIT_RE = /^[a-f0-9]{40}$/;
export const RECEIPT_RE = /^queue-\d+-attempt-\d+\.json$/;
export const DEFAULT_RECEIPTS_DIR = 'knowledge/results/deep-superagent';
export const IN_FLIGHT_WINDOW_MS = 20 * 60 * 1000;
const TERMINAL_OK = new Set([
  'job_terminal_observed',
  'decision_recorded_verified',
  'decision_existing_verified',
]);

export function findCardAddCommit(cardPath, {cwd = process.cwd(), exec = execFileSync} = {}) {
  let out = '';
  try {
    out = String(exec('git', ['log', '--diff-filter=A', '--format=%H', '-1', '--', cardPath], {cwd, encoding: 'utf8'})).trim();
  } catch {
    return null;
  }
  return COMMIT_RE.test(out) ? out : null;
}

// 一条公开队列回执里，若该卡已经真正到达 worker（POST 已发生或复用既有 job），
// 或已到终态，就视为已消费；只在提交前被校验拦下的 blocked 不算消费，允许补派。
export function itemConsumed(item) {
  if (!item || typeof item !== 'object') return false;
  if (item.post_attempted === true || item.reused_existing === true) return true;
  if (TERMINAL_OK.has(item.status)) return true;
  if (item.job && typeof item.job === 'object') return true;
  return false;
}

export function consumedByReceipts(receipts, cardPath) {
  for (const receipt of receipts || []) {
    const items = Array.isArray(receipt?.items) ? receipt.items : [];
    if (items.some((item) => item?.path === cardPath && itemConsumed(item))) return true;
  }
  return false;
}

export function findInFlightRun(runs, {now = Date.now(), windowMs = IN_FLIGHT_WINDOW_MS} = {}) {
  for (const run of runs || []) {
    if (!run || typeof run !== 'object') continue;
    const created = Date.parse(run.created_at || '');
    if (!Number.isFinite(created)) continue;
    if (now - created > windowMs) continue;
    if (run.status !== 'completed') return run;
  }
  return null;
}

export function planDispatches({cards, receiptsByCard, inFlightRun = null}) {
  const groups = new Map();
  const results = [];
  for (const card of cards || []) {
    const {path: cardPath, commit} = card;
    if (!cardPath || !COMMIT_RE.test(commit || '')) {
      results.push({card: cardPath, status: 'no_add_commit'});
      continue;
    }
    if (receiptsByCard?.[cardPath]) {
      results.push({card: cardPath, status: 'already_consumed', commit});
      continue;
    }
    if (inFlightRun) {
      results.push({card: cardPath, status: 'already_in_flight', commit, run_id: inFlightRun.id ?? null});
      continue;
    }
    const key = commit;
    if (!groups.has(key)) {
      groups.set(key, {commit, cards: []});
      results.push({card: cardPath, status: 'dispatch', commit});
    }
    groups.get(key).cards.push(cardPath);
  }
  return {groups: [...groups.values()], cards: results};
}

async function githubJson(fetcher, token, url, {method = 'GET', body} = {}) {
  const response = await fetcher(url, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'ltzzz-dispatch-card-queue',
    },
    ...(body ? {body: JSON.stringify(body)} : {}),
  });
  if (!response.ok) throw new Error(`github_${method.toLowerCase()}_${response.status}`);
  if (method === 'POST') return null;
  return response.json();
}

export async function recentQueueRuns({fetcher = fetch, token, repository} = {}) {
  const data = await githubJson(fetcher, token, `https://api.github.com/repos/${repository}/actions/workflows/deep-superagent-queue.yml/runs?event=workflow_dispatch&per_page=10`);
  return Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
}

export async function dispatchCommit({fetcher = fetch, token, repository, commit, cards = [], pollAttempts = 18, pollIntervalMs = 10000, sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms)), now = Date.now} = {}) {
  if (!token) throw new Error('dispatch_token_missing');
  if (!COMMIT_RE.test(commit || '')) throw new Error('invalid_card_commit');
  const base = `https://api.github.com/repos/${repository}/actions/workflows/deep-superagent-queue.yml`;
  const since = now() - 5000;
  const response = await fetcher(`${base}/dispatches`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'ltzzz-dispatch-card-queue',
    },
    body: JSON.stringify({ref: 'main', inputs: {card_commit: commit}}),
  });
  if (response.status !== 204) throw new Error(`queue_dispatch_failed:${response.status}`);
  for (let attempt = 0; attempt < pollAttempts; attempt += 1) {
    const data = await githubJson(fetcher, token, `${base}/runs?event=workflow_dispatch&per_page=10`);
    const run = (data?.workflow_runs || []).find((item) => Date.parse(item.created_at) >= since);
    if (run) return {commit, cards, run_id: run.id, status: run.status, url: run.html_url || null};
    await sleep(pollIntervalMs);
  }
  throw new Error('queue_dispatch_run_not_observed');
}

export async function dispatchCards({cards, receipts = [], fetcher = fetch, token, repository, receiptsByCard = null, inFlightRun = null, now = Date.now, ...options} = {}) {
  const consumed = receiptsByCard || Object.fromEntries(
    (cards || []).map((card) => [card.path, consumedByReceipts(receipts, card.path)]),
  );
  const plan = planDispatches({cards, receiptsByCard: consumed, inFlightRun});
  const dispatched = [];
  for (const group of plan.groups) {
    dispatched.push(await dispatchCommit({fetcher, token, repository, commit: group.commit, cards: group.cards, now, ...options}));
  }
  return {cards: plan.cards, dispatched};
}

export function loadReceipts(dir) {
  const receipts = [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => RECEIPT_RE.test(name)).sort();
  } catch {
    return receipts;
  }
  for (const name of names) {
    try {
      receipts.push(JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8')));
    } catch {
      /* 跳过损坏回执；补派仍受队列自身的幂等/租约保护。 */
    }
  }
  return receipts;
}

export async function main({env = process.env, argv = process.argv.slice(2), fetcher = fetch, git = execFileSync} = {}) {
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  const cardArgs = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--card') cardArgs.push(argv[i + 1]);
    if (argv[i] === '--cards') cardArgs.push(...String(argv[i + 1] || '').split(',').map((value) => value.trim()).filter(Boolean));
  }
  const cards = [...new Set(cardArgs.filter(Boolean))].map((cardPath) => ({path: cardPath, commit: findCardAddCommit(cardPath, {exec: git})}));
  if (!cards.length) throw new Error('card_path_required');
  const receiptDir = get('--receipts-dir') || DEFAULT_RECEIPTS_DIR;
  const receipts = loadReceipts(receiptDir);
  const token = env.GH_TOKEN || env.GITHUB_TOKEN;
  const repository = env.GITHUB_REPOSITORY;
  if (!repository) throw new Error('repository_missing');
  let inFlightRun = null;
  if (token) {
    try {
      inFlightRun = findInFlightRun(await recentQueueRuns({fetcher, token, repository}));
    } catch {
      /* 读不到最近运行不阻断；队列自身的租约与幂等仍在。 */
    }
  }
  return dispatchCards({cards, receipts, fetcher, token, repository, inFlightRun});
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main()
    .then((result) => {
      process.stdout.write(JSON.stringify(result, null, 1) + '\n');
    })
    .catch((error) => {
      process.stderr.write(`[dispatch-card-queue] ${String(error?.message || error).slice(0, 300)}\n`);
      process.exitCode = 2;
    });
}
