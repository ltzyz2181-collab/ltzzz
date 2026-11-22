/**
 * 自动合并闸门执行器。
 * 触发：check_suite completed（CI 跑完即评估，不依赖 cron）或手动 workflow_dispatch。
 * 判定逻辑全在 scripts/lib/auto-merge-gate.mjs，本文件只负责取证与调用 API。
 */
import fs from 'node:fs';
import path from 'node:path';
import {evaluateAutoMerge, renderDecisionComment} from './lib/auto-merge-gate.mjs';

const API = 'https://api.github.com';
const TOKEN = process.env.AUTO_MERGE_TOKEN || process.env.GH_TOKEN || '';
const REPO = process.env.GITHUB_REPOSITORY || 'ltzyz2181-collab/ltzzz';
const MANUAL_PR = process.env.TARGET_PR || '';
const MAX_MERGES = Math.max(1, Math.min(5, Number(process.env.MAX_MERGES || 3)));
const OUT_DIR = process.env.RECEIPT_DIR || 'knowledge/results/automation/auto-merge';

if (!TOKEN) {
  console.error('missing_token: AUTO_MERGE_TOKEN / GH_TOKEN 都没有');
  process.exit(1);
}

function readEvent() {
  const p = process.env.GITHUB_EVENT_PATH;
  if (!p) return {};
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

async function api(method, route, body) {
  const res = await fetch(API + '/repos/' + REPO + '/' + route, {
    method,
    headers: {
      Authorization: 'Bearer ' + TOKEN,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json',
      'User-Agent': 'ltzzz-auto-merge-gate',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) {
    const err = new Error(method + ' ' + route + ' -> ' + res.status);
    err.status = res.status;
    err.body = text.slice(0, 400);
    throw err;
  }
  return text ? JSON.parse(text) : null;
}

function targetPrNumbers(event) {
  const set = new Set();
  const manual = Number(MANUAL_PR);
  if (Number.isFinite(manual) && manual > 0) set.add(manual);
  const attached = event?.check_suite?.pull_requests;
  if (Array.isArray(attached)) {
    for (const p of attached) if (p && Number(p.number) > 0) set.add(Number(p.number));
  }
  return [...set];
}

async function listFiles(number) {
  const all = [];
  for (let page = 1; page <= 3; page += 1) {
    const batch = await api('GET', 'pulls/' + number + '/files?per_page=100&page=' + page);
    all.push(...batch);
    if (batch.length < 100) break;
  }
  return all;
}

async function listChecks(sha) {
  const runs = [];
  for (let page = 1; page <= 3; page += 1) {
    const data = await api('GET', 'commits/' + sha + '/check-runs?per_page=100&page=' + page);
    runs.push(...(data.check_runs || []));
    if ((data.check_runs || []).length < 100) break;
  }
  return runs;
}

function writeReceipt(payload) {
  fs.mkdirSync(OUT_DIR, {recursive: true});
  const name = payload.pr + '-' + payload.headSha.slice(0, 8) + '-' + Date.now() + '.json';
  fs.writeFileSync(path.join(OUT_DIR, name), JSON.stringify(payload, null, 2));
  return name;
}

async function comment(number, body) {
  try {
    await api('POST', 'issues/' + number + '/comments', {body});
  } catch (e) {
    console.error('comment_failed #' + number + ': ' + e.message);
  }
}

const event = readEvent();
const numbers = targetPrNumbers(event);

if (numbers.length === 0) {
  console.log('no_pull_request_in_event: 无事可做（push 触发的 check_suite 不关 PR）');
  process.exit(0);
}

let merges = 0;
for (const number of numbers) {
  if (merges >= MAX_MERGES) {
    console.log('merge_budget_exhausted at #' + number);
    break;
  }

  const pr = await api('GET', 'pulls/' + number);
  const files = await listFiles(number);
  const checks = await listChecks(pr.head.sha);
  const verdict = evaluateAutoMerge({pr, files, checkRuns: checks});

  const receipt = {
    ts: new Date().toISOString(),
    repo: REPO,
    pr: number,
    headSha: pr.head.sha,
    taskId: verdict.taskId,
    decision: verdict.decision,
    reasons: verdict.reasons,
    stats: verdict.stats,
    merged: false,
    mergeSha: null,
  };

  console.log('#' + number + ' -> ' + verdict.decision + (verdict.reasons.length ? ' [' + verdict.reasons.join(', ') + ']' : ''));

  let mergeSha = null;
  if (verdict.decision === 'merge') {
    try {
      const out = await api('PUT', 'pulls/' + number + '/merge', {
        merge_method: 'squash',
        sha: pr.head.sha,
      });
      mergeSha = out?.sha || null;
      receipt.merged = Boolean(out?.merged);
      receipt.mergeSha = mergeSha;
      if (out?.merged) merges += 1;
    } catch (e) {
      receipt.decision = 'refuse';
      receipt.reasons = [...receipt.reasons, 'merge_api_error:' + e.status];
      receipt.mergeError = e.body || e.message;
    }
  }

  await comment(
    number,
    renderDecisionComment({
      prNumber: number,
      decision: receipt.decision,
      reasons: receipt.reasons,
      taskId: receipt.taskId,
      stats: receipt.stats,
      merged: receipt.merged,
      mergeSha: receipt.mergeSha,
    }),
  );

  const name = writeReceipt(receipt);
  console.log('receipt:', name, 'merged=' + receipt.merged);
}

console.log('done: merges=' + merges);
