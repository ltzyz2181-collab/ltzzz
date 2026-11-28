#!/usr/bin/env node
// Deep 每日积压分流单（确定性、只读公开回执）。
//
// 目的：监督总表里 275 条 open warnings 和邮件采集的 open_items 一直是“只汇总、
// 无逐项下一步”，执行席每天只能看到计数。这里把公开回执转成逐项可执行的
// 分流单：每条只保留 case_id / task_id / 负责席 / 缺的阶段 / 建议动作，
// 不写邮件正文、不写主题、不写凭据，也不调用模型。
//
// 分流只是“把下一步写清楚”，不等于关闭任何项；是否真的补齐证据仍由原任务
// 回执与独立复核决定。五类保留家族只标记 escalate_to=gpt，不自行处理。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export const TRIAGE_SCHEMA = 'ltzzz.deep-superagent.backlog-triage.v1';
export const OVERSIGHT_PATH = 'knowledge/results/dispatch/oversight/latest.json';
export const INTAKE_PATH = 'knowledge/results/deep-superagent/mail-intake/latest.json';
export const BRIEF_DIR = 'knowledge/results/deep-superagent/backlog';

// 缺哪一步 -> 下一步动作。动作名只描述工程/证据动作，不含资金类指令。
const STAGE_ACTIONS = Object.freeze({
  blocked_reconcile_existing_attempt: 'reconcile_existing_attempt_before_any_retry',
  review_missing: 'attach_independent_review_to_existing_artifact',
  revision_required: 'reopen_revision_under_original_task_id',
  external_return_claim_missing: 'reconcile_external_return_with_original_claim',
  engineering_completion_unverified: 'verify_engineering_completion_receipt',
  delivery_missing: 'verify_delivery_receipt',
  claim_missing: 'restore_original_claim_reference',
});

// 只用于“标记转 GPT 决策席”，不据此执行任何动作。
const RESERVED_RE = /资金|退款|签名|私钥|助记词|根密钥|钱包|转账|放款|提现|付款|wallet|refund|signing|private[ _-]?key|mnemonic|payment/i;

const readJson = (root, rel) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return null;
  }
};

const day = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null);
const short = (value, max = 80) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function triageWarning(warning) {
  const stage = short(warning?.issue, 60) || 'unknown_stage';
  const taskId = short(warning?.task_id, 80);
  const reserved = RESERVED_RE.test(taskId) || RESERVED_RE.test(stage);
  return {
    case_id: short(warning?.case_id, 40) || null,
    task_id: taskId || null,
    seat: short(warning?.assigned_to, 24) || 'unknown',
    stage,
    severity: short(warning?.severity, 24) || 'warning',
    since: day(warning?.first_observed_at),
    action: reserved ? 'escalate_reserved_family' : STAGE_ACTIONS[stage] || 'blocked_evidence_needed',
    ...(reserved ? {escalate_to: 'gpt'} : {}),
  };
}

export function triageMailItem(item) {
  const tasks = Array.isArray(item?.task_ids) ? item.task_ids.map((id) => short(id, 40)).filter(Boolean).slice(0, 4) : [];
  return {
    ref: short(item?.ref, 32) || null,
    channel: short(item?.channel, 24) || 'unknown',
    status: short(item?.status, 24) || 'unknown',
    age_days: typeof item?.age_days === 'number' ? Math.round(item.age_days * 10) / 10 : null,
    dispatch_wording: item?.has_dispatch_wording === true,
    tasks,
  };
}

const countBy = (rows, key) => {
  const out = {};
  for (const row of rows) out[row[key]] = (out[row[key]] || 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => String(a).localeCompare(String(b))));
};

export function buildTriage({oversight = null, intake = null, date, mailLimit = 120} = {}) {
  if (!DATE_RE.test(String(date || ''))) throw new Error('invalid_triage_date');
  const warnings = Array.isArray(oversight?.warnings) ? oversight.warnings : [];
  const rows = warnings.map(triageWarning);
  const reserved = rows.filter((row) => row.escalate_to === 'gpt');
  const openItems = Array.isArray(intake?.open_items) ? intake.open_items : [];
  const mail = openItems.slice(0, mailLimit).map(triageMailItem);
  const oldest = [...rows]
    .filter((row) => row.since)
    .sort((a, b) => (a.since === b.since ? String(a.task_id).localeCompare(String(b.task_id)) : a.since.localeCompare(b.since)))
    .slice(0, 20);
  const totals = {
    open_warning_cases: oversight?.backlog?.open_warning_cases ?? rows.length,
    unique_original_tasks: oversight?.backlog?.unique_original_tasks ?? new Set(rows.map((row) => row.task_id)).size,
    not_rechecked_in_current_window: oversight?.backlog?.not_rechecked_in_current_window ?? null,
    triaged_cases: rows.length,
    reserved_family_escalations: reserved.length,
  };
  const summary = {
    schema: TRIAGE_SCHEMA,
    date,
    sources: {
      oversight: {path: OVERSIGHT_PATH, status: oversight ? 'read' : 'missing'},
      mail_intake: {path: INTAKE_PATH, status: intake ? 'read' : 'missing'},
    },
    totals,
    by_seat: countBy(rows, 'seat'),
    by_stage: countBy(rows, 'stage'),
    by_action: countBy(rows, 'action'),
    by_severity: countBy(rows, 'severity'),
    oldest,
    mail: {
      open_or_dispatch: intake?.counts?.open_or_dispatch ?? null,
      unified: intake?.counts?.unified ?? null,
      sampled: mail.length,
      total_open_items: openItems.length,
      by_channel: countBy(mail, 'channel'),
      with_dispatch_wording: mail.filter((item) => item.dispatch_wording).length,
      with_task_ids: mail.filter((item) => item.tasks.length).length,
    },
    note: '分流只写下一步，不关闭任何项；reserved_family_escalations 只转 GPT 决策席，不执行。',
  };
  return {summary, rows, mail};
}

// latest.json 要给执行席直接读，必须留在 60KB 内。275 条逐项都在，但每条只留
// 执行所需的字段：动作已经确定，stage/severity 的完整原文在按日文件里。
const slimRow = (row) => ({
  case: row.case_id,
  task: row.task_id,
  seat: row.seat,
  action: row.action,
  since: row.since,
  ...(row.escalate_to ? {escalate_to: row.escalate_to} : {}),
});
const slimMail = (item) => ({
  ref: item.ref,
  channel: item.channel,
  status: item.status,
  age_days: item.age_days,
  dispatch_wording: item.dispatch_wording,
  tasks: item.tasks,
});
const oldestFirst = (a, b) => {
  const left = a.since || '9999-99-99';
  const right = b.since || '9999-99-99';
  return left === right ? String(a.task_id).localeCompare(String(b.task_id)) : left.localeCompare(right);
};

export function triageBytes({summary, rows, mail}) {
  const {oldest, ...headline} = summary;
  const latest = {
    schema: TRIAGE_SCHEMA,
    date: summary.date,
    note: 'rows 已按 since 升序（最老在前）；mail 只保留前 60 条样本，stage/severity 与全量邮件在按日文件。',
    summary: headline,
    rows: [...rows].sort(oldestFirst).map(slimRow),
    mail: mail.slice(0, 60).map(slimMail),
  };
  // 紧凑序列化：275 条逐项都要进 repo_read 的 64KB 预算，缩进会多占 20KB。
  return {
    latest: (JSON.stringify(latest) + '\n'),
    summary: (JSON.stringify(summary, null, 1) + '\n'),
    dated: (JSON.stringify({schema: TRIAGE_SCHEMA, date: summary.date, summary, rows, mail}, null, 1) + '\n'),
  };
}

export function writeTriage({root = REPO_ROOT, date, oversight = null, intake = null} = {}) {
  const built = buildTriage({
    date,
    oversight: oversight ?? readJson(root, OVERSIGHT_PATH),
    intake: intake ?? readJson(root, INTAKE_PATH),
  });
  const bytes = triageBytes(built);
  const dir = path.join(root, BRIEF_DIR);
  fs.mkdirSync(dir, {recursive: true});
  const files = {
    latest: `${BRIEF_DIR}/latest.json`,
    summary: `${BRIEF_DIR}/summary.json`,
    dated: `${BRIEF_DIR}/${date}.json`,
  };
  fs.writeFileSync(path.join(root, files.latest), bytes.latest);
  fs.writeFileSync(path.join(root, files.summary), bytes.summary);
  fs.writeFileSync(path.join(root, files.dated), bytes.dated);
  return {
    status: 'written',
    date,
    files,
    bytes: {
      latest: Buffer.byteLength(bytes.latest),
      summary: Buffer.byteLength(bytes.summary),
      dated: Buffer.byteLength(bytes.dated),
    },
    summary: built.summary,
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
    const result = writeTriage({root, date});
    process.stdout.write(JSON.stringify({status: result.status, date: result.date, files: result.files, bytes: result.bytes, totals: result.summary.totals, by_action: result.summary.by_action}, null, 1) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write(`[build-deep-backlog-triage] ${String(error?.message || error).slice(0, 300)}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
