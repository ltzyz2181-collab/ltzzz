// Deterministic oversight backlog merge. Measured 2026-11-18: the 188 open
// warning cases are not 188 separate jobs; the same original Task ID shows up
// repeatedly. Sending that pile to a model to "route" produced owner-escalation
// instead of a work list. Merging is mechanical, so it is done here, with
// conflicts surfaced instead of guessed, and no model call.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

const SORTS = new Set(['task_id', 'seat', 'age', 'severity']);
const SEVERITY_RANK = {repeated_warning: 3, warning: 2, repeated: 2, info: 1};

const sha256 = text => createHash('sha256').update(text).digest('hex');
const uniq = values => [...new Set(values.filter(v => typeof v === 'string' && v))];

export function mergeWarnings(warnings) {
  if (!Array.isArray(warnings)) throw new Error('warnings_must_be_array');
  const groups = new Map();
  const invalid = [];
  for (const [index, w] of warnings.entries()) {
    const taskId = typeof w?.task_id === 'string' ? w.task_id.trim() : '';
    if (!taskId) { invalid.push({index, case_id: w?.case_id ?? null, reason: 'missing_task_id'}); continue; }
    const group = groups.get(taskId) || {
      task_id: taskId,
      cases: [],
      issues: [],
      seats: [],
      states: [],
      evidence: [],
      warning_dates: [],
      first_observed_at: null,
      last_observed_at: null,
      severity: 'info',
    };
    group.cases.push(w.case_id ?? null);
    group.issues.push(w.issue);
    group.seats.push(w.assigned_to);
    group.states.push(w.state);
    group.warning_dates.push(...(Array.isArray(w.warning_dates) ? w.warning_dates : []));
    group.evidence.push(...(Array.isArray(w.evidence) ? w.evidence : []));
    if (w.first_observed_at && (!group.first_observed_at || w.first_observed_at < group.first_observed_at)) group.first_observed_at = w.first_observed_at;
    if (w.last_observed_at && (!group.last_observed_at || w.last_observed_at > group.last_observed_at)) group.last_observed_at = w.last_observed_at;
    if ((SEVERITY_RANK[w.severity] || 0) > (SEVERITY_RANK[group.severity] || 0)) group.severity = w.severity;
    groups.set(taskId, group);
  }

  const tasks = [];
  for (const g of groups.values()) {
    const seats = uniq(g.seats);
    const issues = uniq(g.issues);
    const dates = uniq(g.warning_dates).sort();
    const states = uniq(g.states);
    tasks.push({
      task_id: g.task_id,
      seat: seats.length === 1 ? seats[0] : 'unresolved',
      seat_conflict: seats.length > 1,
      issue: issues.length === 1 ? issues[0] : 'multiple',
      issues,
      cases: g.cases.length,
      case_ids: g.cases.filter(Boolean),
      state: states.includes('open') || states.length === 0 ? 'open' : states[0],
      warning_days: dates.length,
      first_warning_date: dates[0] || null,
      last_warning_date: dates.at(-1) || null,
      first_observed_at: g.first_observed_at,
      last_observed_at: g.last_observed_at,
      severity: g.severity,
      evidence: uniq(g.evidence).sort(),
    });
  }
  tasks.sort((a, b) => a.task_id.localeCompare(b.task_id));

  const bySeat = {};
  for (const t of tasks) bySeat[t.seat] = (bySeat[t.seat] || 0) + 1;
  return {
    totals: {
      cases: warnings.length,
      unique_tasks: tasks.length,
      collapsed: warnings.length - tasks.length - invalid.length,
      invalid_cases: invalid.length,
      seat_conflicts: tasks.filter(t => t.seat_conflict).length,
    },
    by_seat: bySeat,
    tasks,
    invalid,
  };
}

export function renderMarkdown(merged, source) {
  const lines = [
    '# Oversight 积压归并（按原 Task ID）',
    '',
    `- 来源：\`${source}\``,
    `- 原始 warning 案例：${merged.totals.cases}`,
    `- 去重后任务：${merged.totals.unique_tasks}`,
    `- 合并掉的重复：${merged.totals.collapsed}`,
    `- 席位冲突：${merged.totals.seat_conflicts}`,
    `- 无 Task ID 的无效行：${merged.totals.invalid_cases}`,
    '',
    '| Task ID | 席位 | 缺口 | 案例数 | 警示天数 | 最后观察 |',
    '|---|---|---|---:|---:|---|',
  ];
  for (const t of merged.tasks) {
    const seat = t.seat_conflict ? 'conflict' : t.seat;
    lines.push(`| ${t.task_id} | ${seat} | ${t.issue} | ${t.cases} | ${t.warning_days} | ${t.last_observed_at || t.last_warning_date || '-'} |`);
  }
  return lines.join('\n') + '\n';
}

export function main(argv = process.argv.slice(2)) {
  const arg = name => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : null);
  const source = arg('--source') || 'knowledge/results/dispatch/oversight/latest.json';
  const raw = fs.readFileSync(source, 'utf8');
  const doc = JSON.parse(raw);
  const merged = mergeWarnings(doc.warnings);
  const out = {
    schema: 'ltzzz.oversight.merged.v1',
    source_path: source,
    source_sha256: sha256(raw),
    generated_at: new Date().toISOString(),
    source_backlog_counts: doc.backlog ? {
      open_warning_cases: doc.backlog.open_warning_cases ?? null,
      unique_original_tasks: doc.backlog.unique_original_tasks ?? null,
      not_rechecked_in_current_window: doc.backlog.not_rechecked_in_current_window ?? null,
      by_responsible_seat: doc.backlog.by_responsible_seat ?? null,
    } : null,
    ...merged,
  };
  const jsonOut = arg('--json');
  const mdOut = arg('--md');
  if (jsonOut) {
    fs.mkdirSync(path.dirname(jsonOut), {recursive: true});
    fs.writeFileSync(jsonOut, JSON.stringify(out, null, 2) + '\n', 'utf8');
  }
  if (mdOut) {
    fs.mkdirSync(path.dirname(mdOut), {recursive: true});
    fs.writeFileSync(mdOut, renderMarkdown(merged, source), 'utf8');
  }
  console.log(JSON.stringify({...out.totals, by_seat: out.by_seat}));
  if (argv.includes('--strict') && (merged.totals.invalid_cases || merged.totals.seat_conflicts)) return 1;
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) process.exitCode = main();
