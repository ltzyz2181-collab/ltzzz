#!/usr/bin/env node
// 用法：
//   node scripts/agent-wake-intake.mjs [--issue 529] [--label wake:request] [--apply]
//                                      [--seats a,b] [--ledger <path>] [--limit 20] [--now ISO8601]
//   --issue 可重复；不传则按 --label 拉取开放的唤醒请求卡。
// 默认 dry-run：只打印判定，不写台账、不发评论、不发邮件、不调模型。
import fs from 'node:fs';
import path from 'node:path';
import {readLedger, serializeLedger, DEFAULT_LIMITS} from './lib/agent-wake.mjs';
import {
  collectWakeSources,
  planIntake,
  formatIntakeComment,
  registrySeatsFrom
} from './lib/wake-intake.mjs';

const DEFAULT_LEDGER = 'knowledge/results/agent-wake/ledger.json';
const DEFAULT_REGISTRY = 'config/seat-mail-registry.json';
const DEFAULT_LABEL = 'wake:request';

function parseArgs(argv) {
  const args = {issue: []};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const body = item.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      pushArg(args, body.slice(0, eq), body.slice(eq + 1));
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      pushArg(args, body, next);
      index += 1;
    } else {
      pushArg(args, body, true);
    }
  }
  return args;
}

function pushArg(args, key, value) {
  if (key === 'issue') args.issue.push(String(value));
  else args[key] = value;
}

function emit(payload) {
  process.stdout.write(JSON.stringify(payload) + '\n');
}

function registrySeats(file) {
  try {
    return registrySeatsFrom(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch {
    return [];
  }
}

function readLedgerFile(file) {
  if (!fs.existsSync(file)) return {schema: 'ltzzz.agent-wake.v1', events: []};
  return readLedger(fs.readFileSync(file, 'utf8'));
}

async function main() {
  const argv = process.argv.slice(2);
  const args = parseArgs(argv);
  if (args.help) {
    process.stdout.write('node scripts/agent-wake-intake.mjs [--issue N]... [--label wake:request] [--apply] [--seats a,b] [--ledger path] [--limit N] [--now ISO]\n');
    return;
  }

  const repo = String(args.repo || process.env.GITHUB_REPOSITORY || 'ltzyz2181-collab/ltzzz');
  const ledgerPath = path.resolve(typeof args.ledger === 'string' ? args.ledger : DEFAULT_LEDGER);
  const apply = args.apply === true || args.apply === '1' || args.apply === 'true';
  const limit = Number.isFinite(Number(args.limit)) ? Math.max(1, Number(args.limit)) : 20;
  const now = typeof args.now === 'string' ? args.now : new Date().toISOString();

  const seats = typeof args.seats === 'string'
    ? args.seats.split(',').map(seat => seat.trim()).filter(Boolean)
    : registrySeats(DEFAULT_REGISTRY);

  // 取证必须联网：即使 dry-run 也要读正文与评论，否则会得到空判定。
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!token) throw new Error('missing_github_token');
  let issueNumbers = args.issue.map(Number).filter(Number.isFinite);

  let issues = [];
  if (issueNumbers.length === 0) {
    const label = String(args.label || DEFAULT_LABEL);
    const list = await api(repo, token, `issues?state=open&labels=${encodeURIComponent(label)}&per_page=${limit}`);
    issues = Array.isArray(list) ? list.filter(item => item && !item.pull_request) : [];
    issueNumbers = issues.map(item => item.number);
  }

  const sources = [];
  for (const number of issueNumbers) {
    const issue = issues.find(item => item.number === number) || await api(repo, token, `issues/${number}`);
    const raw = await api(repo, token, `issues/${number}/comments?per_page=100`);
    const comments = Array.isArray(raw) ? raw : [];
    sources.push(...collectWakeSources({repo, issue: number, body: issue?.body || '', comments}));
  }

  const ledger = readLedgerFile(ledgerPath);
  const plan = planIntake({
    sources,
    ledgerEvents: ledger.events,
    registrySeats: seats,
    limits: DEFAULT_LIMITS,
    now
  });

  const byIssue = new Map();
  for (const decision of plan.decisions) {
    const issue = Number(String(decision.task_id || '').replace('issue-', ''));
    if (!Number.isFinite(issue)) continue;
    if (!byIssue.has(issue)) byIssue.set(issue, []);
    byIssue.get(issue).push(decision);
  }

  const comments = [];
  for (const [issue, decisions] of byIssue) {
    const body = formatIntakeComment({issue, decisions, date: plan.date});
    comments.push({issue, body, pending: decisions.some(item => item.action !== 'already_recorded')});
  }

  if (apply) {
    fs.mkdirSync(path.dirname(ledgerPath), {recursive: true});
    fs.writeFileSync(ledgerPath, serializeLedger({schema: ledger.schema, events: plan.events}), 'utf8');
    for (const comment of comments) {
      if (!comment.pending) continue;
      await api(repo, token, `issues/${comment.issue}/comments`, 'POST', {body: comment.body});
    }
  }

  emit({
    schema: plan.schema,
    repo,
    applied: apply,
    issues: issueNumbers,
    added: plan.added,
    total_events: plan.events.length,
    decisions: plan.decisions,
    comments: comments.map(item => ({issue: item.issue, pending: item.pending, body: item.body}))
  });
}

async function api(repo, token, route, method = 'GET', body) {
  const response = await fetch(`https://api.github.com/repos/${repo}/${route}`, {
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
  if (!response.ok) throw new Error(`${method} ${route} -> ${response.status} ${text.slice(0, 200)}`);
  return text ? JSON.parse(text) : null;
}

main().then(
  () => { process.exitCode = 0; },
  error => {
    process.stderr.write('[agent-wake-intake] ' + (error && error.message ? error.message : 'unknown_error') + '\n');
    process.exitCode = 2;
  }
);
