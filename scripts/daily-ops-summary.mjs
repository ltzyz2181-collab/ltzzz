#!/usr/bin/env node
// 每日合并：把 Deep 队列、日监督、邮件摄入和裁决请求合成一份可核验回执。
// 只读公开回执/脱敏元数据；不调用模型、不联网、不合并 PR、不部署、不动资金。
// 输出三件：
//   1) knowledge/results/deep-superagent/daily-merge/<date>.json（每日合并回执）
//   2) .../email-<date>.txt + email-<date>.meta.json（发信正文与主题，不含机密）
//   3) ops/deep-superagent/ruling-requests/*.json（需 GPT 裁决的公开请求，append-only）
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SUMMARY_SCHEMA = 'ltzzz.deep-superagent.daily-merge.v1';
export const REQUEST_SCHEMA = 'ltzzz.deep-superagent.ruling-request.v1';
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ASK_RE = /^ASK\s*\|\s*([^|]{1,120})\|\s*(gpt|owner|evidence)\s*\|\s*(.{1,200})$/i;
const TOKEN_RE = /[A-Za-z0-9_-]{28,}/g;
const AMOUNT_RE = /[¥$€£]\s?[0-9][0-9.,]*|[0-9][0-9.,]*\s?(?:USDT|USDC|USD|CNY|ETH|BTC|元|美元)/gi;

const readJson = (root, rel, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return fallback;
  }
};

export function redactText(value, max = 240) {
  return String(value ?? '')
    .replace(TOKEN_RE, '<token>')
    .replace(AMOUNT_RE, '<amount>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

// 标识与状态是受控枚举/ID，不能按长 token 规则打码，否则会把
// completed_pending_external_acceptance 这类真实状态误写成 <token>。
const plain = (value, max = 80) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const short = (value, max = 80) => redactText(value, max);

function statusOf(item) {
  return String(item?.job?.status || item?.status || 'unknown');
}

export function extractAsks(outputs = []) {
  const asks = [];
  const seen = new Set();
  for (const output of outputs) {
    for (const line of String(output?.text || '').split('\n')) {
      const match = ASK_RE.exec(line.trim());
      if (!match) continue;
      const entry = {ref: plain(match[1], 60), target: match[2].toLowerCase(), ask: short(match[3], 200)};
      const key = `${entry.ref}|${entry.target}|${entry.ask}`;
      if (seen.has(key)) continue;
      seen.add(key);
      asks.push(entry);
    }
  }
  return asks;
}

export function summarizeQueueReport(report, sourcePath = null) {
  const items = Array.isArray(report?.items) ? report.items : [];
  return items.map((item) => {
    const job = item.job || {};
    const asks = extractAsks(job.outputs || []);
    const status = statusOf(item);
    const gptAsk = asks.filter((ask) => ask.target === 'gpt');
    const ownerAsk = asks.filter((ask) => ask.target === 'owner');
    return {
      task_id: plain(item.task_id, 120),
      package_id: plain(item.package_id, 160),
      run_id: report?.run_id ? String(report.run_id) : null,
      source: sourcePath,
      status: plain(status, 80),
      reason: short(job.plan?.reason || item.error || '', 240) || null,
      model_calls: Number.isFinite(job.model_calls) ? job.model_calls : null,
      needs_gpt_decision: status === 'needs_gpt_decision' || job.plan?.needs_gpt_decision === true || gptAsk.length > 0,
      needs_owner_decision: status === 'needs_owner_decision' || ownerAsk.length > 0,
      asks,
    };
  });
}

function latestFiles(dir, pattern, limit) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .slice(-limit)
    .map((name) => path.join(dir, name));
}

export function collectEvidence(root = REPO_ROOT, date) {
  const base = path.join(root, 'knowledge/results/deep-superagent');
  const queueReports = latestFiles(base, /^queue-\d+-attempt-\d+\.json$/, 3).map((abs) => ({
    path: path.relative(root, abs).split(path.sep).join('/'),
    body: JSON.parse(fs.readFileSync(abs, 'utf8')),
  }));
  const dailyReports = latestFiles(base, /^daily-\d+-attempt-\d+\.json$/, 2).map((abs) => ({
    path: path.relative(root, abs).split(path.sep).join('/'),
    body: JSON.parse(fs.readFileSync(abs, 'utf8')),
  }));
  const intake = readJson(root, 'knowledge/results/deep-superagent/mail-intake/latest.json', null);
  const oversight = readJson(root, 'knowledge/results/dispatch/oversight/latest.json', null);
  const tasksDir = path.join(root, 'ops/deep-superagent/tasks');
  const stamp = String(date).replaceAll('-', '');
  const cardsToday = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter((name) => new RegExp(`^DEEP-SUPERAGENT-${stamp}-`).test(name)).sort()
    : [];
  return {queueReports, dailyReports, intake, oversight, cardsToday};
}

export function buildSummary({date, now = new Date(), evidence}) {
  if (!DATE_RE.test(String(date || ''))) throw new Error('invalid_summary_date');
  const queueItems = evidence.queueReports.flatMap((report) => summarizeQueueReport(report.body, report.path));
  const dailyItems = evidence.dailyReports.map((report) => ({
    task_id: plain(report.body?.task_id || 'DEEP-DAILY-SUPERVISION', 120),
    run_id: report.body?.run_id ? String(report.body.run_id) : null,
    status: plain(report.body?.status || 'unknown', 80),
    error: short(report.body?.error || '', 200) || null,
    source: report.path,
    model_calls: Number.isFinite(report.body?.model_calls) ? report.body.model_calls : null,
  }));

  const done = queueItems
    .filter((item) => !item.needs_gpt_decision && !item.needs_owner_decision
      && !/^(blocked|unknown|queued|running|pending_reconcile_get_only)$/.test(item.status))
    .map((item) => ({
      task_id: item.task_id,
      run_id: item.run_id,
      status: item.status,
      model_calls: item.model_calls,
      note: '内部执行回执；外部业务验收仍需原单证据',
      source: item.source,
    }));
  const dailyDone = dailyItems
    .filter((item) => item.status === 'daily_result_readback_complete')
    .map((item) => ({
      task_id: item.task_id,
      run_id: item.run_id,
      status: item.status,
      model_calls: item.model_calls,
      note: '日监督只读回执；不等于完成业务验收',
      source: item.source,
    }));

  const needsGpt = queueItems.filter((item) => item.needs_gpt_decision).map((item) => ({
    task_id: item.task_id,
    package_id: item.package_id,
    run_id: item.run_id,
    reason: item.reason,
    asks: item.asks.filter((ask) => ask.target === 'gpt'),
    source: item.source,
  }));
  const needsOwner = queueItems.filter((item) => item.needs_owner_decision && !item.needs_gpt_decision).map((item) => ({
    task_id: item.task_id,
    package_id: item.package_id,
    run_id: item.run_id,
    reason: item.reason,
    asks: item.asks.filter((ask) => ask.target === 'owner'),
    source: item.source,
  }));
  const blocked = [
    ...queueItems.filter((item) => /^(blocked|unknown|queued|running|pending_reconcile_get_only)$/.test(item.status)).map((item) => ({
      task_id: item.task_id, run_id: item.run_id, status: item.status, reason: item.reason, source: item.source,
    })),
    ...dailyItems.filter((item) => item.status === 'blocked').map((item) => ({
      task_id: item.task_id, run_id: item.run_id, status: item.status, reason: item.error, source: item.source,
    })),
  ];

  const mail = evidence.intake ? {
    status: evidence.intake.status ?? 'unknown',
    at: evidence.intake.at ?? null,
    gmail_status: evidence.intake.gmail_fullbox?.status ?? 'unknown',
    agent_mail_status: evidence.intake.agent_mail?.status ?? 'unknown',
    open_or_dispatch: evidence.intake.counts?.open_or_dispatch ?? null,
    gmail_rulings: evidence.intake.gmail_rulings ?? {status: 'unknown', today_count: null},
  } : {status: 'unknown', at: null, gmail_status: 'unknown', agent_mail_status: 'unknown', open_or_dispatch: null, gmail_rulings: {status: 'unknown', today_count: null}};

  const nextSteps = [];
  if (!evidence.cardsToday.length) nextSteps.push('今日没有新的 Deep 队列卡：检查 deep-dispatch-daily 定时是否触达，必要时手动 workflow_dispatch。');
  if (mail.status !== 'ok') nextSteps.push(`邮件摄入为 ${mail.status}：确认 Gmail IMAP 与 Agent Mail 通道；读不到时保持 unknown，不写成“没有裁决”。`);
  if (needsGpt.length) nextSteps.push(`已生成 ${needsGpt.length} 条 GPT 裁决请求：等 GPT 回信中的 decision_id 与原 Task ID 绑定后再执行，模型不得自行裁决。`);
  if (needsOwner.length) nextSteps.push(`有 ${needsOwner.length} 条需要 owner 给值或拍板；未拍板前保持原状态。`);
  if (blocked.length) nextSteps.push(`有 ${blocked.length} 条 blocked/unknown：先补原始凭证或换通道，不原样重试。`);
  nextSteps.push('本日报只汇总公开回执；不合并 PR、不生产部署、不发起资金动作。');

  const summary = {
    schema: SUMMARY_SCHEMA,
    date,
    generated_at_utc: now.toISOString(),
    done: [...done, ...dailyDone],
    needs_gpt_decision: needsGpt,
    needs_owner_decision: needsOwner,
    blocked,
    dispatch: {
      cards_today: evidence.cardsToday,
      card_count: evidence.cardsToday.length,
      importance: evidence.cardsToday.length ? 'medium' : null,
      note: evidence.cardsToday.length ? '政策卡由 dispatch-seat-policy 生成，Deep 主办；中转席不持裁决权' : null,
    },
    mail,
    counts: {
      done: done.length + dailyDone.length,
      needs_gpt_decision: needsGpt.length,
      needs_owner_decision: needsOwner.length,
      blocked: blocked.length,
    },
    next_steps: nextSteps,
    evidence: {
      queue_reports: evidence.queueReports.map((report) => report.path),
      daily_reports: evidence.dailyReports.map((report) => report.path),
      mail_intake: 'knowledge/results/deep-superagent/mail-intake/latest.json',
      oversight: 'knowledge/results/dispatch/oversight/latest.json',
    },
    financial_execution: false,
    paid: false,
    merge_performed: false,
    deploy_performed: false,
    secrets_included: false,
    policy: 'GPT 仍持资金/签名/生产/凭据裁决权；中转模型只出意见。',
  };
  summary.email = buildEmail(summary);
  return summary;
}

export function buildEmail(summary) {
  const subject = `[LTZZZ日报] ${summary.date} 完成=${summary.counts.done} 待GPT裁决=${summary.counts.needs_gpt_decision} 阻塞=${summary.counts.blocked}`;
  const lines = [
    `LTZZZ 每日合并 ${summary.date}（UTC）`,
    '',
    '一、今天完成了什么',
  ];
  if (summary.done.length) {
    for (const item of summary.done) lines.push(`- ${item.task_id}：${item.status}（run=${item.run_id ?? 'unknown'}）`);
  } else {
    lines.push('- 今天没有新的 Deep 终态回执。');
  }
  lines.push('', '二、需要 GPT 裁决');
  if (summary.needs_gpt_decision.length) {
    for (const item of summary.needs_gpt_decision) {
      lines.push(`- ${item.task_id}（run=${item.run_id ?? 'unknown'}）：${item.reason || '见 ASK'}`);
      for (const ask of item.asks) lines.push(`  ASK ${ask.ref}：${ask.ask}`);
      if (!item.asks.length) lines.push('  ASK：请对该任务给出 decision_id 与范围。');
    }
  } else {
    lines.push('- 今天没有需要 GPT 裁决的项。');
  }
  lines.push('', '三、下一步');
  for (const step of summary.next_steps) lines.push(`- ${step}`);
  lines.push('', '四、证据与边界');
  lines.push(`- 邮件摄入：status=${summary.mail.status}，gmail=${summary.mail.gmail_status}，agent_mail=${summary.mail.agent_mail_status}`);
  lines.push(`- 今日 Gmail 裁决类回信（仅元数据）：${summary.mail.gmail_rulings?.today_count ?? 'unknown'}`);
  lines.push(`- Deep 队列卡：${summary.dispatch.card_count} 张；合并回执：knowledge/results/deep-superagent/daily-merge/${summary.date}.json`);
  lines.push('- 本邮件不含邮件正文、金额、凭据或客户数据；不声称任何业务验收或生产部署。');
  return {subject, body: lines.join('\n') + '\n'};
}

export function writeSummary({root = REPO_ROOT, summary}) {
  if (!DATE_RE.test(String(summary?.date || '')) || summary.schema !== SUMMARY_SCHEMA) throw new Error('invalid_summary_write');
  const dir = path.join(root, 'knowledge/results/deep-superagent/daily-merge');
  fs.mkdirSync(dir, {recursive: true});
  const jsonPath = path.join(dir, `${summary.date}.json`);
  const emailPath = path.join(dir, `email-${summary.date}.txt`);
  const metaPath = path.join(dir, `email-${summary.date}.meta.json`);
  const latestPath = path.join(dir, 'latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 1) + '\n');
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 1) + '\n');
  fs.writeFileSync(emailPath, summary.email.body);
  fs.writeFileSync(metaPath, JSON.stringify({
    schema: 'ltzzz.deep-superagent.email-meta.v1',
    date: summary.date,
    subject: summary.email.subject,
    body_file: path.relative(root, emailPath).split(path.sep).join('/'),
    generated_at_utc: summary.generated_at_utc,
    counts: summary.counts,
    contains_mail_body: false,
    secrets_included: false,
  }, null, 1) + '\n');

  const requestDir = path.join(root, 'ops/deep-superagent/ruling-requests');
  fs.mkdirSync(requestDir, {recursive: true});
  const requests = [];
  for (const item of summary.needs_gpt_decision) {
    const safeTask = String(item.task_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
    const safeRun = String(item.run_id || 'unknown').replace(/[^0-9A-Za-z_-]/g, '_').slice(0, 30);
    const rel = `ops/deep-superagent/ruling-requests/RREQ-${summary.date}-${safeTask}-${safeRun}.json`;
    const abs = path.join(root, rel);
    if (fs.existsSync(abs)) {
      requests.push({path: rel, status: 'already_exists'});
      continue;
    }
    const record = {
      schema: REQUEST_SCHEMA,
      request_id: `RREQ-${summary.date}-${safeTask}-${safeRun}`,
      created_at_utc: summary.generated_at_utc,
      date: summary.date,
      task_id: item.task_id,
      package_id: item.package_id,
      run_id: item.run_id,
      reason: item.reason,
      asks: item.asks,
      status: 'awaiting_gpt',
      requested_from: 'gpt_decision_seat',
      decision_authority: 'gpt_or_owner_only',
      source_report: item.source,
      contains_mail_body: false,
      contains_credentials: false,
      contains_customer_data: false,
    };
    fs.writeFileSync(abs, JSON.stringify(record, null, 1) + '\n');
    requests.push({path: rel, status: 'created'});
  }
  return {
    json: path.relative(root, jsonPath).split(path.sep).join('/'),
    email_body: path.relative(root, emailPath).split(path.sep).join('/'),
    email_meta: path.relative(root, metaPath).split(path.sep).join('/'),
    latest: path.relative(root, latestPath).split(path.sep).join('/'),
    ruling_requests: requests,
  };
}

function main(argv = process.argv.slice(2)) {
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  const date = get('--date') || new Date().toISOString().slice(0, 10);
  const root = get('--root') || REPO_ROOT;
  try {
    const summary = buildSummary({date, evidence: collectEvidence(root, date)});
    if (argv.includes('--dry-run')) {
      process.stdout.write(JSON.stringify({status: 'dry_run', counts: summary.counts, subject: summary.email.subject}, null, 1) + '\n');
      return 0;
    }
    const written = writeSummary({root, summary});
    process.stdout.write(JSON.stringify({status: 'written', counts: summary.counts, subject: summary.email.subject, written}, null, 1) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write(`[daily-ops-summary] ${String(error?.message || error).slice(0, 300)}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
