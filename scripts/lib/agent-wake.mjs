import crypto from 'node:crypto';

// AI 主动唤醒 P1 引擎：解析请求、判定是否允许唤醒、维护 append-only 台账。
// 约定：零网络、零外部依赖、时钟由调用方注入、所有金额只做记账不触发资金动作。
export const WAKE_SCHEMA = 'ltzzz.agent-wake.v1';
export const WAKE_EVENT_SCHEMA = 'ltzzz.agent-wake.event.v1';

export const DEFAULT_LIMITS = {
  per_call_usd: 0.05,
  daily_usd: 0.50,
  project_usd: 10,
  balance_floor_usd: 3,
  max_topics_per_round: 2,
  max_turns: 4,
  dedupe_hours: 24
};

// 只有这些 key 参与解析；其它 key 静默忽略，避免未知字段污染台账。
const WAKE_KEYS = new Set(['topic', 'why', 'seats', 'budget_usd', 'dedupe_key']);
// 事件落盘时只保留这些字段，防止把任意输入写进 append-only 台账。
const EVENT_FIELDS = [
  'schema', 'event_id', 'at', 'action', 'reason', 'dedupe_key',
  'topic', 'seats', 'budget_usd', 'cost_usd', 'task_id', 'thread_id'
];
const HOUR_MS = 60 * 60 * 1000;

function parseWakeFields(line) {
  const fields = {};
  // 允许空值（例如 budget_usd=），这样空预算可以进入 invalid 而不是被误当成 0。
  const regex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S*))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    if (!WAKE_KEYS.has(match[1])) continue;
    fields[match[1]] = match[2] ?? match[3] ?? match[4] ?? '';
  }
  return fields;
}

function splitSeats(value) {
  const seen = new Set();
  const seats = [];
  for (const raw of String(value ?? '').split(',')) {
    const seat = raw.trim();
    if (!seat || seen.has(seat)) continue;
    seen.add(seat);
    seats.push(seat);
  }
  return seats;
}

function normalizeSeats(value) {
  if (Array.isArray(value)) return splitSeats(value.join(','));
  if (typeof value === 'string') return splitSeats(value);
  return [];
}

// 席位名规范化：registry 里用下划线（relay_gpt），协议里常写连字符。
// 只做等值映射，不做模糊匹配；未知名仍然拒绝。
const SEAT_ALIASES = new Map([
  ['豆包', 'doubao'],
  ['千问', 'qianwen'],
  ['通义千问', 'qianwen'],
  ['克劳德', 'desktop_claude'],
  ['桌面克劳德', 'desktop_claude'],
  ['桌面claude', 'desktop_claude'],
  ['中转克劳德', 'relay_claude'],
  ['中转claude', 'relay_claude'],
  ['中转gpt', 'relay_gpt'],
  ['deep团队', 'deep'],
  ['deepseek', 'deep']
]);

export function canonicalSeat(value) {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  if (SEAT_ALIASES.has(raw)) return SEAT_ALIASES.get(raw);
  return raw.replace(/[\s-]+/g, '_');
}

function isEmpty(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

// 统一的 UTC 规范化：接受字符串/数字/Date，无法解析时返回 null。
function toIsoString(value) {
  if (value instanceof Date) {
    return Number.isFinite(value.getTime()) ? value.toISOString() : null;
  }
  if (typeof value === 'number') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : null;
  }
  if (typeof value === 'string') {
    const ms = Date.parse(value);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
  }
  return null;
}

function toUtcDate(value) {
  const iso = toIsoString(value);
  if (iso) return iso.slice(0, 10);
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value.trim())) {
    return value.trim();
  }
  return null;
}

function eventDate(event) {
  return toUtcDate(event?.at);
}

function isWakeWithCost(event) {
  return event?.action === 'wake' &&
    typeof event.cost_usd === 'number' &&
    Number.isFinite(event.cost_usd);
}

function shortHash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16);
}

function decision(action, reason, base) {
  return {
    action,
    reason,
    dedupe_key: base.dedupe_key,
    topic: base.topic,
    seats: base.seats,
    budget_usd: base.budget_usd,
    spend: base.spend
  };
}

/**
 * 逐行解析 `[wake] key=value ...`。
 * 非 [wake] 行直接忽略；缺字段的行进入 invalid，且每行只报第一个固定原因码。
 */
export function parseWakeRequests(text) {
  const requests = [];
  const invalid = [];
  const lines = String(text ?? '').split(/\r?\n/);

  for (let index = 0; index < lines.length; index += 1) {
    const textLine = lines[index].trim();
    if (!textLine.startsWith('[wake]')) continue;

    const fields = parseWakeFields(textLine.slice('[wake]'.length).trim());
    let reason = '';

    if (isEmpty(fields.topic)) reason = 'missing_topic';
    else if (isEmpty(fields.why)) reason = 'missing_why';
    else {
      const seats = splitSeats(fields.seats);
      if (seats.length === 0) reason = 'missing_seats';
    }

    let budgetUsd = 0;
    if (!reason && fields.budget_usd !== undefined) {
      const raw = String(fields.budget_usd).trim();
      const parsed = Number(raw);
      if (raw === '' || !Number.isFinite(parsed)) reason = 'invalid_budget';
      else budgetUsd = parsed;
    }

    if (reason) {
      invalid.push({line: index + 1, reason, text: textLine});
      continue;
    }

    const parsedRequest = {
      topic: String(fields.topic).trim(),
      why: String(fields.why).trim(),
      seats: splitSeats(fields.seats),
      budget_usd: budgetUsd,
      dedupe_key: isEmpty(fields.dedupe_key) ? '' : String(fields.dedupe_key).trim()
    };
    // 行号作为非枚举属性附带，便于 CLI 定位，但不改变请求对象的可见形状。
    Object.defineProperty(parsedRequest, 'line', {value: index + 1, enumerable: false});
    requests.push(parsedRequest);
  }

  return {requests, invalid};
}

export function wakeDedupeKey({task_id, thread_id, date} = {}) {
  const part = (value) => (value === undefined || value === null || value === '' ? 'none' : String(value));
  return `task:${part(task_id)}|thread:${part(thread_id)}|date:${part(date)}`;
}

export function effectiveDedupeKey(request, context = {}) {
  const explicit = request?.dedupe_key;
  if (!isEmpty(explicit)) return String(explicit).trim();
  return wakeDedupeKey(context);
}

export function validateSeats(seats, registrySeats = []) {
  const known = new Set();
  for (const item of Array.isArray(registrySeats) ? registrySeats : []) {
    // config/seat-mail-registry.json 的席位键是 id，历史调用方传 name/seat，三者都认。
    const name = typeof item === 'string' ? item : (item?.id ?? item?.name ?? item?.seat ?? '');
    const canonical = canonicalSeat(name);
    if (canonical) known.add(canonical);
  }

  const unknown = [];
  for (const seat of normalizeSeats(seats)) {
    const canonical = canonicalSeat(seat);
    if (!canonical || !known.has(canonical)) unknown.push(seat);
  }
  return {ok: unknown.length === 0, unknown};
}

/**
 * 累计花费。只统计 action==='wake' 且 cost_usd 为数字的事件；
 * daily_usd 按 event.at 的 UTC 日期，project_usd 为全部历史，events_count 为计入的唤醒事件数。
 */
export function spendSummary(events, {date} = {}) {
  const targetDate = toUtcDate(date);
  let daily = 0;
  let project = 0;
  let count = 0;

  for (const event of Array.isArray(events) ? events : []) {
    if (!isWakeWithCost(event)) continue;
    project += event.cost_usd;
    count += 1;
    if (targetDate && eventDate(event) === targetDate) daily += event.cost_usd;
  }

  return {daily_usd: daily, project_usd: project, events_count: count};
}

/**
 * 唤醒判定。固定顺序：请求合法 -> 席位 -> 当日议题数 -> 去重 -> 预算。
 * 返回的 spend 是判定前的累计值，便于回执复算。
 */
export function decideWake({
  request,
  context = {},
  events = [],
  limits = DEFAULT_LIMITS,
  registrySeats = [],
  now = new Date().toISOString()
} = {}) {
  const P = {...DEFAULT_LIMITS, ...(limits || {})};
  const req = request || {};
  const nowIso = toIsoString(now) || new Date().toISOString();
  const nowMs = Date.parse(nowIso);
  const date = nowIso.slice(0, 10);

  const topic = isEmpty(req.topic) ? '' : String(req.topic).trim();
  const why = isEmpty(req.why) ? '' : String(req.why).trim();
  const seats = normalizeSeats(req.seats);
  const dedupeKey = effectiveDedupeKey(req, context);
  const spend = spendSummary(events, {date});

  let budgetUsd = 0;
  let invalidBudget = false;
  if (req.budget_usd !== undefined && req.budget_usd !== null && req.budget_usd !== '') {
    const parsed = Number(req.budget_usd);
    if (String(req.budget_usd).trim() === '' || !Number.isFinite(parsed)) invalidBudget = true;
    else budgetUsd = parsed;
  } else if (req.budget_usd === '') {
    invalidBudget = true;
  }

  const base = {dedupe_key: dedupeKey, topic: topic || null, seats, budget_usd: budgetUsd, spend};

  // 1. 请求合法
  if (!topic) return decision('blocked_request', 'missing_topic', base);
  if (!why) return decision('blocked_request', 'missing_why', base);
  if (seats.length === 0) return decision('blocked_request', 'missing_seats', base);
  if (invalidBudget) return decision('blocked_request', 'invalid_budget', base);

  // 2. 席位
  const seatCheck = validateSeats(seats, registrySeats);
  if (!seatCheck.ok) return decision('blocked_seat', 'unknown_seat', base);

  // 3. 当日议题数
  const todayWakes = (Array.isArray(events) ? events : []).filter(event =>
    event?.action === 'wake' && eventDate(event) === date
  );
  if (todayWakes.length >= P.max_topics_per_round) {
    return decision('blocked_topic_limit', 'daily_topic_cap_reached', base);
  }

  // 4. 去重：严格处在 (now - dedupe_hours, now] 内才算重复；正好 24 小时前允许重新唤醒。
  const dedupeWindowMs = Number(P.dedupe_hours) * HOUR_MS;
  const duplicate = (Array.isArray(events) ? events : []).some(event => {
    if (event?.action !== 'wake' || event.dedupe_key !== dedupeKey) return false;
    const atMs = Date.parse(event.at);
    if (!Number.isFinite(atMs)) return false;
    return nowMs - atMs < dedupeWindowMs;
  });
  if (duplicate) return decision('deduped', 'duplicate_within_window', base);

  // 5. 预算：单次 -> 当日 -> 项目。
  if (budgetUsd > P.per_call_usd) {
    return decision('blocked_budget', 'per_call_cap_exceeded', base);
  }
  if (spend.daily_usd + budgetUsd > P.daily_usd) {
    return decision('blocked_budget', 'daily_cap_exceeded', base);
  }
  if (spend.project_usd + budgetUsd > P.project_usd) {
    return decision('blocked_budget', 'project_cap_exceeded', base);
  }

  return decision('wake', 'wake', base);
}

/**
 * append-only 追加事件：返回新数组，不修改旧数组或旧事件对象。
 * event_id 缺省由 `${dedupe_key}:${at}` 的 sha256 前 16 位生成。
 */
export function appendEvent(events, entry, {now = new Date().toISOString()} = {}) {
  const existing = Array.isArray(events) ? events : [];
  const source = entry || {};
  const nowIso = toIsoString(now) || new Date().toISOString();
  const at = source.at === undefined || source.at === null || source.at === ''
    ? nowIso
    : (toIsoString(source.at) || String(source.at));
  const dedupeKey = source.dedupe_key ?? null;
  const eventId = source.event_id || shortHash(`${dedupeKey ?? ''}:${at}`);

  if (existing.some(event => event?.event_id === eventId)) {
    throw new Error('agent_wake_duplicate_event_id');
  }

  const last = existing.at(-1);
  if (last && last.at !== undefined) {
    const lastMs = Date.parse(last.at);
    const atMs = Date.parse(at);
    if (Number.isFinite(lastMs) && Number.isFinite(atMs) && atMs < lastMs) {
      throw new Error('agent_wake_ledger_not_append_only');
    }
  }

  const normalized = {};
  for (const field of EVENT_FIELDS) {
    if (field === 'schema') normalized.schema = source.schema || WAKE_EVENT_SCHEMA;
    else if (field === 'event_id') normalized.event_id = eventId;
    else if (field === 'at') normalized.at = at;
    else normalized[field] = source[field] ?? null;
  }
  normalized.seats = Array.isArray(source.seats) ? [...source.seats] : [];

  return {events: [...existing, normalized], entry: normalized};
}

/**
 * 收敛判定：一致 -> agreed；有分歧 -> split；无有效票或超轮次仍无结论 -> insufficient_evidence。
 */
export function convergence({verdicts, rounds = 1} = {}) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  const agrees = list.filter(verdict => verdict === 'agree').length;
  const disagrees = list.filter(verdict => verdict === 'disagree').length;
  const unknown = list.length - agrees - disagrees;

  if (agrees === 0 && disagrees === 0) {
    return {verdict: 'insufficient_evidence', agrees, disagrees, unknown, note: '没有足够的 agree/disagree 证据。'};
  }

  if (rounds > DEFAULT_LIMITS.max_turns && disagrees > 0) {
    return {verdict: 'insufficient_evidence', agrees, disagrees, unknown, note: `已超过 ${DEFAULT_LIMITS.max_turns} 轮仍存在分歧，按证据不足处理。`};
  }

  if (disagrees > 0) {
    return {verdict: 'split', agrees, disagrees, unknown, note: '存在明确分歧，需要合议后再决定。'};
  }

  return {verdict: 'agreed', agrees, disagrees, unknown, note: '所有有效意见一致同意。'};
}

export function readLedger(text) {
  const raw = String(text ?? '').replace(/^﻿/, '').trim();
  if (!raw) return {schema: WAKE_SCHEMA, events: []};

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error('agent_wake_ledger_invalid_json');
  }

  if (!parsed || typeof parsed !== 'object' || parsed.schema !== WAKE_SCHEMA) {
    throw new Error('agent_wake_ledger_schema_mismatch');
  }

  return {
    schema: WAKE_SCHEMA,
    events: Array.isArray(parsed.events) ? parsed.events : []
  };
}

export function serializeLedger(ledger) {
  return `${JSON.stringify(ledger, null, 2)}\n`;
}
