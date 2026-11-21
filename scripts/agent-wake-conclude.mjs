#!/usr/bin/env node
// P3：把讨论结论落地。
//   node scripts/agent-wake-conclude.mjs --issue 536 --apply
//   node scripts/agent-wake-conclude.mjs --label wake:weekly --apply
// 默认 dry-run：只打印决策，不建卡、不写台账、不发评论。
import crypto from 'node:crypto';
import fs from 'node:fs';
import {parseWakeRequests, readLedger} from './lib/agent-wake.mjs';
import {parseVerdicts, planConclusion, buildDispatchCard, dispatchTitle} from './lib/wake-conclude.mjs';
import {persistEvent} from './agent-wake-persist.mjs';

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16);
}

function parseArgs(argv) {
  const args = {issue: []};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const body = item.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) { pushArg(args, body.slice(0, eq), body.slice(eq + 1)); continue; }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) { pushArg(args, body, next); index += 1; }
    else pushArg(args, body, true);
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

function topicOf(issue) {
  const parsed = parseWakeRequests(issue && issue.body ? issue.body : '');
  const first = parsed.requests[0];
  return first ? String(first.topic) : String((issue && issue.title) || '未命名议题');
}

// 结论要挂在被唤醒的那条议题上，否则「未收敛议题」永远关不掉。
function sourceDedupeKey(issueNumber) {
  try {
    const ledger = readLedger(fs.readFileSync('knowledge/results/agent-wake/ledger.json', 'utf8'));
    const wake = [...ledger.events].reverse().find(event =>
      event && event.action === 'wake' && String(event.task_id) === 'issue-' + issueNumber);
    if (wake && wake.dedupe_key) return wake.dedupe_key;
  } catch {
    // 台账不存在时退回卡号，至少不会写坏数据
  }
  return 'issue-' + issueNumber;
}

const ACTION_TEXT = {
  dispatch: '已建派单卡',
  escalate: '有分歧，升级合议',
  request_evidence: '证据不足，暂不建卡',
  recommend_only: '命中保留家族，只出建议'
};

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help) {
    process.stdout.write('node scripts/agent-wake-conclude.mjs --issue N [--apply] | --label wake:weekly [--apply]\n');
    return;
  }
  const repo = String(args.repo || process.env.GITHUB_REPOSITORY || 'ltzyz2181-collab/ltzzz');
  const apply = args.apply === true || args.apply === '1' || args.apply === 'true';
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;

  let numbers = args.issue.map(Number).filter(Number.isFinite);
  if (numbers.length === 0) {
    if (!token) throw new Error('missing_github_token');
    const label = String(args.label || 'wake:weekly');
    const list = await api(repo, token, 'issues?state=open&labels=' + encodeURIComponent(label) + '&per_page=30');
    numbers = (Array.isArray(list) ? list : [])
      .filter(item => item && !item.pull_request)
      .map(item => item.number);
  }
  if (numbers.length === 0) { emit({schema: 'ltzzz.agent-wake.conclude.v1', applied: apply, results: []}); return; }

  if (apply && !token) throw new Error('missing_github_token');
  const results = [];

  for (const number of numbers) {
    const issue = token
      ? await api(repo, token, 'issues/' + number)
      : {number, title: '', body: ''};
    const comments = token
      ? await api(repo, token, 'issues/' + number + '/comments?per_page=100')
      : [];
    const topic = topicOf(issue);
    const verdicts = parseVerdicts(Array.isArray(comments) ? comments : []);
    const plan = planConclusion({topic, verdicts, rounds: Number(args.rounds) || 1});

    const record = {issue: number, topic, verdicts: verdicts.length, ...plan};

    if (!apply) { results.push(record); continue; }

    // 幂等：同一卡同一结论只记一次。
    const eventId = shortHash('conclude|' + number + '|' + plan.verdict + '|' + plan.seats.join(','));

    if (plan.action === 'dispatch') {
      const existing = await api(repo, token, 'issues?state=all&labels=dispatch&per_page=100');
      const already = (Array.isArray(existing) ? existing : []).find(item =>
        item && typeof item.body === 'string' && item.body.includes('讨论来源：#' + number));
      let card = already ?? null;
      if (!card) {
        card = await api(repo, token, 'issues', 'POST', {
          title: dispatchTitle(topic),
          body: buildDispatchCard({topic, verdicts, sourceIssue: number, seats: plan.seats}),
          labels: ['dispatch', 'seat:' + plan.seat]
        });
      }
      record.card = card.number;
      record.created = !already;
    }

    const comment = [
      '### [conclude] ' + (ACTION_TEXT[plan.action] || plan.action),
      '',
      '- 结论：`' + plan.verdict + '`（agree ' + plan.agrees + ' / disagree ' + plan.disagrees + '）',
      '- 参与席位：' + (plan.seats.length ? plan.seats.join(', ') : '无'),
      '- 原因：`' + plan.reason + '`',
      record.card ? '- 派单卡：#' + record.card : '',
      '',
      '<!-- wake-conclude:' + eventId + ' -->'
    ].filter(Boolean).join('\n');

    const posted = Array.isArray(comments) && comments.some(item =>
      item && typeof item.body === 'string' && item.body.includes('<!-- wake-conclude:' + eventId + ' -->'));
    if (!posted) await api(repo, token, 'issues/' + number + '/comments', 'POST', {body: comment});

    // 只有真正给出结论的动作才写台账；证据不足不结案，议题继续留在议程里。
    if (plan.action !== 'request_evidence') {
      record.persisted = persistEvent({
        entry: {
          event_id: eventId,
          action: plan.action === 'dispatch' ? 'agreed' : (plan.action === 'escalate' ? 'split' : 'recommend_only'),
          reason: plan.reason,
          dedupe_key: sourceDedupeKey(number),
          topic,
          seats: plan.seats,
          task_id: 'issue-' + number,
          thread_id: 'conclusion',
          cost_usd: 0
        }
      });
    }
    results.push(record);
  }

  emit({schema: 'ltzzz.agent-wake.conclude.v1', applied: apply, results});
}

main().then(
  () => { process.exitCode = 0; },
  error => {
    process.stderr.write('[agent-wake-conclude] ' + (error && error.message ? error.message : 'unknown_error') + '\n');
    process.exitCode = 2;
  }
);
