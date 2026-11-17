// 邮件三层去重：message_id / thread_id / 原始 Task ID。
//
// 设计约束（对应 GPT-LTZZZ-AUTONOMY-RULING-20261117-01 §二.7）：
// - 三层并列：任意一层命中即视为同一条；三层各自记录命中原因，便于审计。
// - 只合并不删除：重复项保留在 duplicates / history 里，原始状态不被覆盖。
// - 历史裁决继承：同一线程多封回复时保留全部 ruling，取不到唯一裁决就 fail-closed 标 conflict。
// - 宁可少合不可错合：Task ID 只在完全相等时合并，不做前缀/模糊匹配；
//   整条没有任何键的邮件各自独立成簇。
// - 输入不被修改，输出顺序稳定（打乱输入顺序不改变聚合结果）。

export const DEDUPE_VERSION = 1;

// 日期锚定的 Task ID：例如 LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02、
// GPT-HIRE-PHASE1-REPAIR-20261117-02、DEEP-SUPERAGENT-20261110-LINEAR-INTAKE-V2。
const TASK_ID_RE = /\b[A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)*-\d{8}(?:-[A-Za-z0-9]+)*\b/g;

export function extractTaskIds(...texts) {
  const found = new Set();
  for (const text of texts) {
    if (text === null || text === undefined) continue;
    for (const match of String(text).matchAll(TASK_ID_RE)) {
      const id = match[0].replace(/[.,;:]+$/, '').toUpperCase();
      if (id.length >= 12) found.add(id);
    }
  }
  return [...found].sort();
}

export function normalizeMessageId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().replace(/^<+/, '').replace(/>+$/, '').toLowerCase();
  return text || null;
}

export function normalizeThreadId(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim().toLowerCase();
  return text || null;
}

// 主题归一：去掉 Re:/Fwd:/回复/答复 与 [标签]，用于把没有 in_reply_to 的回复挂回线程。
// 前缀可能交替出现（Re: [LTZZZ] 回复: ...），要剥到不再变化为止。
export function normalizeThreadKey(subject) {
  let text = String(subject || '');
  for (let i = 0; i < 8; i += 1) {
    const before = text;
    text = text.replace(/^((re|fw|fwd|aw|sv|回复|答复)\s*[:：]\s*)+/gi, '');
    text = text.replace(/^\[[^\]]*\]\s*/g, '');
    if (text === before) break;
  }
  return text.replace(/\s+/g, ' ').trim().toLowerCase();
}

function normalizeItem(raw, index) {
  const messageId = normalizeMessageId(raw.message_id ?? raw.ref);
  const threadId = normalizeThreadId(raw.thread_id);
  const taskIds = [...new Set([
    ...(Array.isArray(raw.task_ids) ? raw.task_ids : []),
    ...extractTaskIds(raw.task_id, raw.subject_short, raw.subject, raw.title),
  ].map((id) => String(id).toUpperCase()))].sort();
  return {
    index,
    ref: raw.ref || messageId || `anon-${index}`,
    channel: raw.channel || 'unknown',
    message_id: messageId,
    thread_id: threadId,
    thread_key: raw.thread_key ? normalizeThreadKey(raw.thread_key) : normalizeThreadKey(raw.subject_short || raw.subject || raw.title),
    task_ids: taskIds,
    status: raw.status || 'unknown',
    unread: raw.unread === true,
    read: raw.read === true,
    at: raw.at || raw.date || raw.created_at || null,
    age_days: raw.age_days ?? null,
    subject_short: raw.subject_short || '',
    has_dispatch_wording: raw.has_dispatch_wording === true,
    ruling: raw.ruling || null,
    rulings: Array.isArray(raw.rulings) ? raw.rulings : [],
  };
}

function keysOf(item) {
  const keys = [];
  if (item.message_id) keys.push(`m:${item.message_id}`);
  if (item.thread_id) keys.push(`t:${item.thread_id}`);
  for (const id of item.task_ids) keys.push(`k:${id}`);
  return keys;
}

function makeUnionFind() {
  const parent = new Map();
  const add = (key) => {
    if (!parent.has(key)) parent.set(key, key);
  };
  const find = (key) => {
    let value = parent.get(key);
    while (value !== parent.get(value)) {
      parent.set(value, parent.get(parent.get(value)));
      value = parent.get(value);
    }
    return value;
  };
  const union = (a, b) => {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };
  return {add, find, union};
}

function collectRulings(members) {
  const seen = new Set();
  const rulings = [];
  for (const member of members) {
    const list = [...member.rulings];
    if (member.ruling) list.push(member.ruling);
    for (const ruling of list) {
      if (!ruling || typeof ruling !== 'object') continue;
      const decisionId = ruling.decision_id || ruling.decisionId || null;
      const messageId = normalizeMessageId(ruling.message_id || ruling.msg || ruling.reply_id);
      const key = `${decisionId || ''}|${messageId || ''}|${ruling.at || ''}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rulings.push({
        decision_id: decisionId,
        message_id: messageId,
        at: ruling.at || ruling.replied_at || null,
        verdict: ruling.verdict || ruling.disposition || null,
        source: ruling.source || null,
      });
    }
  }
  rulings.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')) || String(a.message_id || '').localeCompare(String(b.message_id || '')));
  return rulings;
}

function inheritedStatus(members) {
  // fail-closed：只要有一封是 open/unknown，就不能因为重复项写着 closed 而判闭环。
  const statuses = members.map((m) => m.status);
  if (statuses.includes('open')) return 'open';
  if (statuses.includes('unknown')) return 'unknown';
  return 'closed';
}

function matchedLayer(canonical, duplicate, clusterTaskIds = []) {
  if (canonical.message_id && canonical.message_id === duplicate.message_id) return 'message_id';
  if (canonical.thread_id && canonical.thread_id === duplicate.thread_id) return 'thread_id';
  // 用整簇的 Task ID 并集判断：重复项可能是通过簇内另一封邮件挂进来的。
  const shared = clusterTaskIds.filter((id) => duplicate.task_ids.includes(id));
  if (shared.length) return 'task_id';
  return 'unknown';
}

function pickCanonical(members) {
  const score = (m) => {
    const hasRuling = collectRulings([m]).length > 0 ? 1 : 0;
    return hasRuling;
  };
  return members.slice().sort((a, b) => {
    const rulingDiff = score(b) - score(a);
    if (rulingDiff) return rulingDiff;
    const atDiff = String(a.at || '9999').localeCompare(String(b.at || '9999'));
    if (atDiff) return atDiff;
    const refDiff = String(a.ref).localeCompare(String(b.ref));
    if (refDiff) return refDiff;
    return a.index - b.index;
  })[0];
}

/**
 * @param {Array<object>} messages 统一后的邮件项（channel/ref/message_id/thread_id/task_ids/status/...）
 * @returns {{version:number,items:Array,duplicates:Array,clusters:number,layers:object,conflicts:Array,history_preserved:true}}
 */
export function dedupeMessages(messages) {
  const items = (Array.isArray(messages) ? messages : []).map(normalizeItem);
  const uf = makeUnionFind();

  for (const item of items) {
    const keys = keysOf(item);
    item.keys = keys.length ? keys : [`x:${item.ref}`];
    for (const key of item.keys) uf.add(key);
    for (const key of item.keys.slice(1)) uf.union(item.keys[0], key);
  }

  const groups = new Map();
  for (const item of items) {
    const root = uf.find(item.keys[0]);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(item);
  }

  const clusters = [...groups.values()].sort((a, b) => Math.min(...a.map((m) => m.index)) - Math.min(...b.map((m) => m.index)));
  const layerCounts = {message_id: 0, thread_id: 0, task_id: 0, single: 0};
  const duplicates = [];
  const conflicts = [];
  const output = [];

  for (const members of clusters) {
    const canonical = pickCanonical(members);
    const rulings = collectRulings(members);
    const decisionIds = [...new Set(rulings.map((r) => r.decision_id).filter(Boolean))];
    const rulingStatus = rulings.length === 0 ? 'none' : decisionIds.length > 1 ? 'conflict' : 'decided';
    const clusterTaskIds = [...new Set(members.flatMap((m) => m.task_ids))].sort();
    const layerSet = new Set();
    const mergedRefs = [];

    for (const member of members) {
      if (member === canonical) continue;
      const layer = matchedLayer(canonical, member, clusterTaskIds);
      layerSet.add(layer);
      mergedRefs.push(member.ref);
      duplicates.push({
        ref: member.ref,
        channel: member.channel,
        duplicate_of: canonical.ref,
        matched_layer: layer,
        original_status: member.status,
        original_unread: member.unread,
      });
    }

    if (members.length === 1) layerCounts.single += 1;
    else for (const layer of layerSet) layerCounts[layer] = (layerCounts[layer] || 0) + 1;

    const history = members
      .slice()
      .sort((a, b) => a.index - b.index)
      .map((m) => ({ref: m.ref, channel: m.channel, status: m.status, unread: m.unread, at: m.at}));

    const cluster = {
      ref: canonical.ref,
      channel: canonical.channel,
      message_id: canonical.message_id,
      thread_id: canonical.thread_id || members.map((m) => m.thread_id).find(Boolean) || null,
      task_ids: clusterTaskIds,
      status: inheritedStatus(members),
      unread: members.some((m) => m.unread),
      at: canonical.at,
      age_days: canonical.age_days,
      subject_short: canonical.subject_short,
      has_dispatch_wording: members.some((m) => m.has_dispatch_wording),
      ruling_status: rulingStatus,
      decision_id: decisionIds.length === 1 ? decisionIds[0] : null,
      decision_ids: decisionIds,
      latest_ruling: rulings.length ? rulings[rulings.length - 1] : null,
      rulings,
      ruling_unread: rulings.length > 0 && members.some((m) => m.unread && (m.ruling || m.rulings.length)),
      merged_refs: mergedRefs,
      merged_count: members.length,
      layers: [...layerSet].sort(),
      history,
    };

    if (rulingStatus === 'conflict') {
      conflicts.push({
        ref: cluster.ref,
        decision_ids: decisionIds,
        refs: members.map((m) => m.ref),
        requires_review: true,
      });
    }
    output.push(cluster);
  }

  return {
    version: DEDUPE_VERSION,
    items: output,
    duplicates,
    clusters: output.length,
    layers: layerCounts,
    conflicts,
    history_preserved: true,
  };
}
