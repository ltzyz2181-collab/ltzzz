// Task continuity board: one record per approved project item, each carrying
// exactly one next action, one owner and (when blocked) one unblock condition.
// This exists because the repo's many pipelines each end at a decision point and
// nothing re-reads them afterwards, so work silently stops halfway.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const STATES = Object.freeze(['ready', 'in_progress', 'in_review', 'blocked_decision', 'waiting_external', 'waiting_owner', 'done']);
export const OWNERS = Object.freeze(['claude', 'doubao', 'qianwen', 'deepseek', 'gpt', 'owner', 'deploy_seat']);
const BLOCKING_STATES = new Set(['blocked_decision', 'waiting_external', 'waiting_owner']);
const ID_RE = /^[A-Z][A-Z0-9-]{5,60}$/;

export const DEFAULT_BOARD = 'ops/task-continuity/board.json';

export function validateBoard(board) {
  const errors = [];
  if (!board || typeof board !== 'object') return ['board_not_object'];
  if (board.schema !== 'ltzzz.task-continuity.v1') errors.push('bad_schema');
  if (!Array.isArray(board.tasks) || board.tasks.length === 0) errors.push('tasks_required');
  const seen = new Set();
  for (const [i, t] of (board.tasks || []).entries()) {
    const at = `tasks[${i}]`;
    if (!t || typeof t !== 'object') { errors.push(at + ':not_object'); continue; }
    if (!ID_RE.test(t.id || '')) errors.push(at + ':bad_id');
    if (seen.has(t.id)) errors.push(at + ':duplicate_id'); seen.add(t.id);
    if (!STATES.includes(t.state)) errors.push(at + ':bad_state');
    if (typeof t.title !== 'string' || t.title.trim().length < 4) errors.push(at + ':title_required');
    if (typeof t.updated_at !== 'string' || Number.isNaN(Date.parse(t.updated_at))) errors.push(at + ':bad_updated_at');
    if (!Array.isArray(t.evidence)) errors.push(at + ':evidence_must_be_array');
    if (t.state !== 'done') {
      if (typeof t.next_action !== 'string' || t.next_action.trim().length < 4) errors.push(at + ':next_action_required');
      if (!OWNERS.includes(t.next_owner)) errors.push(at + ':bad_next_owner');
    }
    if (BLOCKING_STATES.has(t.state) && (typeof t.unblock_condition !== 'string' || t.unblock_condition.trim().length < 4)) errors.push(at + ':unblock_condition_required');
    if (t.state === 'done' && (!Array.isArray(t.evidence) || t.evidence.length === 0)) errors.push(at + ':done_requires_evidence');
  }
  return errors;
}

const hoursSince = (iso, now) => (now - Date.parse(iso)) / 36e5;

export function reportBoard(board, {now = Date.now(), warnHours = 24, failHours = 72} = {}) {
  const errors = validateBoard(board);
  const tasks = (board.tasks || []).filter(t => t && t.state !== 'done');
  const withAge = tasks.map(t => ({
    id: t.id, state: t.state, next_owner: t.next_owner, next_action: t.next_action,
    unblock_condition: t.unblock_condition ?? null,
    age_hours: Math.round(hoursSince(t.updated_at, now) * 10) / 10
  }));
  const stalled = withAge.filter(t => t.state === 'ready' && t.age_hours >= failHours);
  const warn = withAge.filter(t => t.state === 'ready' && t.age_hours >= warnHours && t.age_hours < failHours);
  const byState = {}; for (const t of withAge) byState[t.state] = (byState[t.state] || 0) + 1;
  const byOwner = {}; for (const t of withAge) byOwner[t.next_owner] = (byOwner[t.next_owner] || 0) + 1;
  return {
    ok: errors.length === 0,
    errors,
    open: withAge.length,
    by_state: byState,
    by_owner: byOwner,
    stalled: stalled.map(t => t.id),
    warn: warn.map(t => t.id),
    actionable: withAge.filter(t => t.state === 'ready').sort((a, b) => b.age_hours - a.age_hours),
    waiting: withAge.filter(t => t.state !== 'ready'),
    generated_at: new Date(now).toISOString()
  };
}

export function formatReport(r) {
  const lines = [];
  lines.push(`# 立项连续性看板 · ${r.generated_at}`);
  lines.push('');
  lines.push(`未完成 ${r.open} 项｜待动 ${r.actionable.length}｜告警 ${r.warn.length}｜超期 ${r.stalled.length}`);
  lines.push('');
  lines.push('## 现在就能做（按滞留时长降序）');
  if (!r.actionable.length) lines.push('- 无');
  for (const t of r.actionable) lines.push(`- ${t.id}（${t.age_hours}h，${t.next_owner}）：${t.next_action}`);
  lines.push('');
  lines.push('## 等条件 / 等裁决');
  if (!r.waiting.length) lines.push('- 无');
  for (const t of r.waiting) lines.push(`- ${t.id}｜${t.state}｜${t.next_owner}｜${t.unblock_condition ? '解除条件：' + t.unblock_condition : '在办：' + t.next_action}`);
  if (r.errors.length) { lines.push(''); lines.push('## 结构错误'); for (const e of r.errors) lines.push(`- ${e}`); }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const file = process.env.BOARD_FILE || DEFAULT_BOARD;
  const board = JSON.parse(fs.readFileSync(file, 'utf8'));
  const r = reportBoard(board);
  if (process.argv.includes('--json')) console.log(JSON.stringify(r, null, 2));
  else process.stdout.write(formatReport(r));
  if (!r.ok) process.exitCode = 1;
  else if (process.argv.includes('--strict') && r.stalled.length) process.exitCode = 2;
}