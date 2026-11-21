import crypto from 'node:crypto';
import {
  WAKE_SCHEMA,
  parseWakeRequests,
  decideWake,
  appendEvent,
  canonicalSeat
} from './agent-wake.mjs';

// AI 主动唤醒 P2：把 issue 正文/评论里的 [wake] 行落成台账事件。
// 约定与 P1 一致：零网络、零外部依赖、时钟由调用方注入、不触发资金动作。
// 本层只做「接收与准入」，真实模型调用与邮件发送由上层工作流负责。
export const INTAKE_SCHEMA = 'ltzzz.agent-wake.intake.v1';

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16);
}

/**
 * 把一个 issue 的正文与评论拆成按时间排序的「来源块」。
 * 正文最先，评论按 created_at 升序；没有 created_at 的保持原有顺序。
 */
export function collectWakeSources({repo = '', issue = 0, body = '', comments = []} = {}) {
  const sources = [];
  if (typeof body === 'string' && body.trim()) {
    sources.push({repo: String(repo), issue, ref: 'body', at: null, text: body});
  }
  const rows = (Array.isArray(comments) ? comments : [])
    .filter(comment => comment && typeof comment.body === 'string' && comment.body.trim())
    .map((comment, index) => ({
      repo: String(repo),
      issue,
      ref: 'c:' + (comment.id ?? index),
      at: comment.created_at ?? null,
      text: comment.body
    }));
  rows.sort((a, b) => {
    const am = Date.parse(a.at ?? '');
    const bm = Date.parse(b.at ?? '');
    if (Number.isFinite(am) && Number.isFinite(bm) && am !== bm) return am - bm;
    return 0;
  });
  return sources.concat(rows);
}

/**
 * 逐行判定并生成台账事件。
 * - event_id 由 (repo, issue, 来源块, 行号) 决定，因此同一行重复处理只会被跳过，不会重复记账。
 * - at 一律用本次处理时刻，保证 append-only 单调；旧账本时间戳在未来时顺延 1ms。
 */
export function planIntake({
  sources = [],
  ledgerEvents = [],
  registrySeats = [],
  limits,
  now = new Date().toISOString()
} = {}) {
  const parsedNow = new Date(now);
  const baseIso = Number.isFinite(parsedNow.getTime()) ? parsedNow.toISOString() : new Date().toISOString();
  const date = baseIso.slice(0, 10);

  let events = Array.isArray(ledgerEvents) ? [...ledgerEvents] : [];
  const decisions = [];
  let added = 0;

  const appendOne = (entry) => {
    const last = events[events.length - 1];
    const lastMs = last && last.at ? Date.parse(last.at) : NaN;
    let at = baseIso;
    if (Number.isFinite(lastMs) && Date.parse(at) <= lastMs) {
      at = new Date(lastMs + 1).toISOString();
    }
    const result = appendEvent(events, {...entry, at}, {now: at});
    events = result.events;
    added += 1;
    return result.entry;
  };

  for (const source of sources) {
    const parsed = parseWakeRequests(source.text);
    const rows = [
      ...parsed.requests.map(request => ({kind: 'request', line: request.line, request})),
      ...parsed.invalid.map(item => ({kind: 'invalid', line: item.line, item}))
    ].sort((a, b) => a.line - b.line);

    for (const row of rows) {
      const eventId = shortHash(source.repo + '|' + source.issue + '|' + source.ref + '|' + row.line);
      const record = {
        event_id: eventId,
        task_id: 'issue-' + source.issue,
        thread_id: source.ref,
        cost_usd: 0
      };

      if (events.some(event => event && event.event_id === eventId)) {
        decisions.push({
          ...record,
          action: 'already_recorded',
          reason: 'event_id_present',
          line: row.line,
          topic: null,
          seats: [],
          budget_usd: 0
        });
        continue;
      }

      if (row.kind === 'invalid') {
        const entry = appendOne({
          ...record,
          action: 'blocked_request',
          reason: row.item.reason,
          dedupe_key: null,
          topic: null,
          seats: [],
          budget_usd: 0
        });
        decisions.push({...record, event_id: entry.event_id, action: 'blocked_request', reason: row.item.reason, line: row.line, topic: null, seats: [], budget_usd: 0});
        continue;
      }

      const verdict = decideWake({
        request: row.request,
        context: {date, task_id: record.task_id, thread_id: record.thread_id},
        events,
        limits,
        registrySeats,
        now: baseIso
      });

      // 只把「允许唤醒」写成 wake；其余动作保留原因码，便于审计为何没唤醒。
      const entry = appendOne({
        ...record,
        action: verdict.action,
        reason: verdict.reason,
        dedupe_key: verdict.dedupe_key,
        topic: verdict.topic,
        seats: verdict.seats,
        budget_usd: verdict.budget_usd
      });

      decisions.push({
        ...record,
        event_id: entry.event_id,
        action: verdict.action,
        reason: verdict.reason,
        line: row.line,
        dedupe_key: verdict.dedupe_key,
        topic: verdict.topic,
        seats: verdict.seats,
        budget_usd: verdict.budget_usd
      });
    }
  }

  return {schema: INTAKE_SCHEMA, date, now: baseIso, decisions, events, added};
}

const ACTION_LABEL = {
  wake: '允许唤醒',
  deduped: '重复（去重窗口内）',
  blocked_seat: '拒绝：未知席位',
  blocked_topic_limit: '拒绝：当日议题已满',
  blocked_budget: '拒绝：超预算',
  blocked_request: '拒绝：请求不完整',
  already_recorded: '已记录（跳过）'
};

/** 生成回写评论；只含判定与原因码，不含凭据与邮件正文。 */
export function formatIntakeComment({issue, decisions = [], date, eventIds = []} = {}) {
  const rows = decisions.filter(item => item.action !== 'already_recorded');
  const ids = (Array.isArray(eventIds) ? eventIds : []).filter(Boolean);
  // 隐藏标记：同一条事件重复处理时，按此标记跳过重复评论。
  const marker = ids.length ? '\n\n<!-- wake-intake:' + ids.join(',') + ' -->' : '';
  const head = '### [wake-intake] `#' + issue + '` 判定结果 ' + (date ?? '');
  if (rows.length === 0) {
    return head + '\n\n没有新的 `[wake]` 行需要处理。';
  }
  const lines = [head, '', '| 行 | 判定 | 原因 | 议题 | 席位 | 预算 |', '|---|---|---|---|---|---|'];
  for (const item of rows) {
    const label = ACTION_LABEL[item.action] ?? item.action;
    const topic = item.topic ? String(item.topic).replace(/\|/g, '\\|') : '—';
    const seats = item.seats && item.seats.length ? item.seats.map(canonicalSeat).join(', ') : '—';
    const budget = item.budget_usd === undefined || item.budget_usd === null ? '—' : '$' + item.budget_usd;
    lines.push('| ' + item.line + ' | ' + label + ' | `' + item.reason + '` | ' + topic + ' | ' + seats + ' | ' + budget + ' |');
  }
  lines.push('', '> 本表只记录准入判定，未产生模型调用、未发送邮件、未发生任何资金动作。');
  return lines.join('\n') + marker;
}

/** 读取 registry 里的席位 id，供 CLI 与工作流使用。 */
export function registrySeatsFrom(parsed) {
  const list = Array.isArray(parsed && parsed.seats) ? parsed.seats : [];
  return list.map(seat => (seat && (seat.id ?? seat.name ?? seat.seat)) || null).filter(Boolean);
}

export {WAKE_SCHEMA};
