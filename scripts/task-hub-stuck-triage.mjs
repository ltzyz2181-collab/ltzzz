#!/usr/bin/env node
// Task Hub 卡住任务分流单（确定性、只读、无网络、无模型、无写主账）。
//
// 目的：Deep 2026-11-28 派给 WorkBuddy 的第 1 项是「梳理队列中卡住的任务，
// 给出解除阻塞方案」。该动作每天重复，但此前靠人工读 latest.json。本脚本把
// CI 侧落盘的 Task Hub 快照转成逐项可执行的解除阻塞分流单：只保留公开字段，
// 每项给出确定性的下一步工程/证据动作；五类保留家族只标记 escalate_to=gpt，
// 绝不执行资金、退款终态、签名、私钥/助记词/根密钥、钱包动作。
//
// 边界：本脚本只读输入快照并写输出文件；不改 GitHub Issue、不改标签、不 claim、
// 不 submit、不部署、不触碰五类。分流只写「下一步」，不等于关闭任何任务。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STUCK_SCHEMA = 'ltzzz.task-hub.stuck-triage.v1';
export const SNAPSHOT_PATH = 'knowledge/results/task-hub/latest.json';
export const OUT_DIR = 'knowledge/results/task-hub/stuck';

// 五类保留 + 资金/支付/链上资产类高危词的保守匹配；命中只升级给 GPT，不自行处理。
const RESERVED_RE = /(?:资金|退款|签名|私钥|助记词|根密钥|钱包|转账|放款|提现|付款|支付|充值|托管|预算|budget|fiduciary|wallet|refund|sign(?:ing)?|private[ _-]?key|mnemonic|root[ _-]?key|payment|funds|top[ _-]?up)/i;
const DECISION_RE = /^\[(?:DECISION|DISPATCH|CLAIM)\]/i;

const short = (value, max = 100) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const day = (value) => (typeof value === 'string' && value.length >= 10 ? value.slice(0, 10) : null);

/**
 * 把单条 Task Hub 任务映射为一条卡住分流。
 * now 为参照时刻（ISO 字符串或 Date）；测试可注入固定值。
 */
export function classifyTask(task, now = new Date()) {
  const title = short(task?.title, 140);
  const taskId = short(task?.task_id, 90);
  const state = short(task?.state, 24) || 'unknown';
  const seat = short(task?.seat, 24) || null;
  const lease = typeof task?.lease_until === 'string' ? task.lease_until : null;
  const nowMs = now instanceof Date ? now.getTime() : Date.parse(now);
  const leaseExpired = !!lease && Number.isFinite(Date.parse(lease)) && Date.parse(lease) < nowMs;
  const reopened = task?.reopened && typeof task.reopened === 'object' ? short(task.reopened.kind, 20) : null;
  const reserved = RESERVED_RE.test(title) || RESERVED_RE.test(taskId);

  let category;
  let action;
  if (reserved) {
    category = 'reserved_family';
    action = 'escalate_to_gpt_decision_only';
  } else if (DECISION_RE.test(title)) {
    category = 'decision_needed';
    action = 'request_gpt_ruling_or_named_decision_channel';
  } else if (state === 'blocked') {
    category = 'blocked_state';
    action = 'verify_blocker_and_request_owner_or_gpt_decision';
  } else if (reopened === 'unblocked' && state === 'new' && Number(task?.attempts || 0) === 0) {
    category = 'reopened_awaiting_reclaim';
    action = 'reclaim_under_original_task_id_after_evidence_check';
  } else if (leaseExpired && state !== 'delivered') {
    category = 'stale_lease';
    action = 'reconcile_existing_attempt_before_any_reclaim';
  } else if (state === 'new' && !seat) {
    category = 'unassigned';
    action = 'route_to_owner_for_seat_assignment';
  } else if (state === 'new' && seat === 'workbuddy') {
    category = 'own_seat_awaiting_claim';
    action = 'verify_native_claim_evidence_before_reclaim';
  } else if (state === 'new') {
    category = 'new_awaiting_claim';
    action = 'monitor_next_snapshot';
  } else if (state === 'delivered') {
    category = 'delivered_verify_evidence';
    action = 'verify_delivery_evidence_and_pr_sha';
  } else {
    category = 'in_progress_monitor';
    action = 'monitor_next_snapshot';
  }

  const row = {
    number: Number(task?.number) || null,
    task_id: taskId || null,
    seat,
    state,
    title,
    category,
    action,
    lease_until: lease,
    attempts: Number(task?.attempts) || 0,
    pr: typeof task?.pr === 'string' ? short(task.pr, 160) : null,
    invalid_delivered: task?.invalid_delivered === true,
    delivered_evidence_problems: Array.isArray(task?.delivered_evidence_problems)
      ? task.delivered_evidence_problems.map((p) => short(p, 80)).slice(0, 8) : [],
    reopened: reopened ? {kind: reopened, at: day(task.reopened.at)} : null,
  };
  if (reserved) row.escalate_to = 'gpt';
  return row;
}

const countBy = (rows, key) => {
  const out = {};
  for (const row of rows) {
    const v = row[key] ?? 'null';
    out[v] = (out[v] || 0) + 1;
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => String(a).localeCompare(String(b))));
};

/**
 * 由快照构造分流结果。snapshot 兼容 items / tasks 两种字段名。
 */
export function buildStuckTriage({snapshot = null, now = new Date(), date = null} = {}) {
  const tasks = Array.isArray(snapshot?.tasks) ? snapshot.tasks
    : Array.isArray(snapshot?.items) ? snapshot.items : [];
  const rows = tasks.map((task) => classifyTask(task, now));
  const stuck = rows.filter((r) => r.category !== 'delivered_verify_evidence' && r.category !== 'new_awaiting_claim');
  const reserved = rows.filter((r) => r.escalate_to === 'gpt');
  const summary = {
    schema: STUCK_SCHEMA,
    date: date || (now instanceof Date ? now.toISOString().slice(0, 10) : String(now).slice(0, 10)),
    source: {
      path: SNAPSHOT_PATH,
      status: snapshot ? 'read' : 'missing',
      generated_at: snapshot?.generated_at ?? null,
      schema: snapshot?.schema ?? null,
    },
    totals: {
      open: snapshot?.counts?.open ?? null,
      tasks_in_snapshot: tasks.length,
      stuck_or_decision: stuck.length,
      reserved_family_escalations: reserved.length,
    },
    counts: snapshot?.counts ?? null,
    by_state: countBy(rows, 'state'),
    by_seat: countBy(rows, 'seat'),
    by_category: countBy(rows, 'category'),
    by_action: countBy(rows, 'action'),
    note: '分流只写下一步，不关闭任何任务；保留家族只升级 GPT，不执行五类动作。快照为 CI 侧对 Issue 主账的回读镜像，非本席原生直连。',
  };
  return {summary, rows};
}

const slimRow = (row) => ({
  n: row.number, id: row.task_id, seat: row.seat, state: row.state,
  cat: row.category, act: row.action, lease: row.lease_until,
  ...(row.escalate_to ? {esc: row.escalate_to} : {}),
});

export function triageBytes({summary, rows}) {
  const latest = {
    schema: STUCK_SCHEMA,
    date: summary.date,
    note: 'rows 为逐项分流；完整标题与字段在按日文件。',
    summary,
    rows: rows.map(slimRow),
  };
  return {
    latest: JSON.stringify(latest) + '\n',
    dated: JSON.stringify({schema: STUCK_SCHEMA, date: summary.date, summary, rows}, null, 1) + '\n',
  };
}

export function writeStuckTriage({root = REPO_ROOT, snapshot = null, now = new Date(), date = null} = {}) {
  const built = buildStuckTriage({snapshot, now, date});
  const bytes = triageBytes(built);
  const dir = path.join(root, OUT_DIR);
  fs.mkdirSync(dir, {recursive: true});
  const files = {latest: `${OUT_DIR}/latest.json`, dated: `${OUT_DIR}/${built.summary.date}.json`};
  fs.writeFileSync(path.join(root, files.latest), bytes.latest);
  fs.writeFileSync(path.join(root, files.dated), bytes.dated);
  return {
    status: 'written', date: built.summary.date, files,
    bytes: {latest: Buffer.byteLength(bytes.latest), dated: Buffer.byteLength(bytes.dated)},
    summary: built.summary,
  };
}

function main(argv = process.argv.slice(2)) {
  const get = (flag) => { const i = argv.indexOf(flag); return i >= 0 ? argv[i + 1] : null; };
  const input = get('--input') || path.join(REPO_ROOT, SNAPSHOT_PATH);
  const out = get('--out') || REPO_ROOT;
  const date = get('--date') || null;
  try {
    let snapshot = null;
    try { snapshot = JSON.parse(fs.readFileSync(input, 'utf8')); } catch { snapshot = null; }
    const result = writeStuckTriage({root: out, snapshot, date});
    process.stdout.write(JSON.stringify({
      status: result.status, date: result.date, files: result.files,
      bytes: result.bytes, totals: result.summary.totals,
      by_category: result.summary.by_category,
    }, null, 1) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write(`[task-hub-stuck-triage] ${String(error?.message || error).slice(0, 300)}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
