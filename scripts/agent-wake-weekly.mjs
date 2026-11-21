#!/usr/bin/env node
// 每周创新讨论：开一次卡，并把卡里的 [wake] 行走准入 + 记账。
// 用法：
//   node scripts/agent-wake-weekly.mjs [--week 2026-W47] [--seats a,b] [--budget 0.01]
//                                      [--agenda "中转席给的议程"] [--apply] [--now ISO]
// 默认 dry-run：只打印将要开的卡，不建卡、不写台账、不发评论。
import fs from 'node:fs';
import path from 'node:path';
import {
  isoWeek,
  buildWeeklyIssueBody,
  weeklyIssueTitle,
  weekMarker,
  WEEKLY_LABELS
} from './lib/wake-weekly.mjs';
import {registrySeatsFrom} from './lib/wake-intake.mjs';
import {persistIntake} from './agent-wake-persist.mjs';

const DEFAULT_REGISTRY = 'config/seat-mail-registry.json';
// 每周唤醒的默认收件范围：全部登记席位。
function defaultSeats() {
  try {
    const parsed = JSON.parse(fs.readFileSync(DEFAULT_REGISTRY, 'utf8'));
    return registrySeatsFrom(parsed);
  } catch {
    return [];
  }
}

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const body = item.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) { args[body.slice(0, eq)] = body.slice(eq + 1); continue; }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) { args[body] = next; index += 1; }
    else args[body] = true;
  }
  return args;
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

async function api(repo, token, route, method = 'GET', body) {
  const response = await fetch('https://api.github.com/repos/' + repo + '/' + route, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
      'X-GitHub-Api-Version': '2022-11-28'
    },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  const text = await response.text();
  if (!response.ok) throw new Error(method + ' ' + route + ' -> ' + response.status + ' ' + text.slice(0, 200));
  return text ? JSON.parse(text) : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('node scripts/agent-wake-weekly.mjs [--week 2026-W47] [--seats a,b] [--agenda text] [--apply]\n');
    return;
  }
  const repo = String(args.repo || process.env.GITHUB_REPOSITORY || 'ltzyz2181-collab/ltzzz');
  const apply = args.apply === true || args.apply === '1' || args.apply === 'true';
  const week = typeof args.week === 'string' ? args.week : isoWeek(typeof args.now === 'string' ? args.now : new Date());
  const seats = typeof args.seats === 'string'
    ? args.seats.split(',').map(seat => seat.trim()).filter(Boolean)
    : defaultSeats();
  const budgetUsd = Number.isFinite(Number(args.budget)) ? Number(args.budget) : 0.01;
  const agenda = typeof args.agenda === 'string' && args.agenda.trim()
    ? args.agenda
    : (process.env.WAKE_AGENDA || '');

  if (seats.length === 0) throw new Error('weekly_missing_seats');

  const body = buildWeeklyIssueBody({week, seats, budgetUsd, agenda});
  const title = weeklyIssueTitle(week);

  if (!apply) {
    emit({schema: 'ltzzz.agent-wake.weekly.v1', applied: false, week, seats, title, body});
    return;
  }

  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('missing_github_token');

  const existing = await api(repo, token, 'issues?state=all&labels=' + encodeURIComponent(WEEKLY_LABELS[0]) + '&per_page=100');
  const match = (Array.isArray(existing) ? existing : [])
    .find(issue => issue && !issue.pull_request && typeof issue.body === 'string' && issue.body.includes(weekMarker(week)));

  let issue = match;
  if (!issue) {
    issue = await api(repo, token, 'issues', 'POST', {title, body, labels: WEEKLY_LABELS});
  }

  // 建卡后立刻走同一套准入 + 落盘，避免「卡开了但台账没记」。
  const persisted = persistIntake({issue: issue.number, label: WEEKLY_LABELS[0]});

  emit({
    schema: 'ltzzz.agent-wake.weekly.v1',
    applied: true,
    week,
    issue: issue.number,
    created: !match,
    url: issue.html_url,
    persisted
  });
}

main().then(
  () => { process.exitCode = 0; },
  error => {
    process.stderr.write('[agent-wake-weekly] ' + (error && error.message ? error.message : 'unknown_error') + '\n');
    process.exitCode = 2;
  }
);
