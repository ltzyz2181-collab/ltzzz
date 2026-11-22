/**
 * 席位邮件线程化 —— 纯逻辑，不触网、不读环境。
 * 负责：In-Reply-To / References 规范化、message_id 台账、同 dedupe_key 不重发。
 * 台账里 smtp_message_id（我方发送回执）与 imap_message_id（对方回信头）分开记，不混用。
 */
import crypto from 'node:crypto';

export const LEDGER_SCHEMA = 'ltzzz.seat-mail.ledger.v1';
export const DEFAULT_WINDOW_HOURS = 24;
export const MAX_ENTRIES = 500;

export function emptyLedger() {
  return {schema: LEDGER_SCHEMA, entries: []};
}

export function parseLedger(text) {
  try {
    const v = JSON.parse(String(text || ''));
    if (v && v.schema === LEDGER_SCHEMA && Array.isArray(v.entries)) return v;
  } catch {
    // 损坏的台账不阻断发送，但要重新开始；调用方负责备份原文件。
  }
  return emptyLedger();
}

export function serializeLedger(ledger) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  return JSON.stringify({schema: LEDGER_SCHEMA, entries}, null, 2) + '\n';
}

/** 把任意写法收敛成 <id@domain>；无法识别时返回 null。 */
export function normalizeMessageId(value) {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return null;
  if (/^<[^<>\s]+>$/.test(raw)) return raw;
  const inner = raw.replace(/^</, '').replace(/>$/, '').trim();
  if (!inner || /\s/.test(inner)) return null;
  return '<' + inner + '>';
}

/** 去重后拼 References 链，保持原有顺序。 */
export function mergeReferences(list) {
  const out = [];
  for (const raw of Array.isArray(list) ? list : []) {
    const id = normalizeMessageId(raw);
    if (id && !out.includes(id)) out.push(id);
  }
  return out;
}

/** 父消息必须出现在 References 末尾，否则部分客户端会拆线程。 */
export function buildThreadHeaders({inReplyTo, references} = {}) {
  const parent = normalizeMessageId(inReplyTo);
  const refs = mergeReferences([...(Array.isArray(references) ? references : []), parent]);
  return {
    inReplyTo: parent,
    references: refs,
    referencesHeader: refs.join(' '),
  };
}

export function bodySha256(body) {
  return crypto.createHash('sha256').update(String(body == null ? '' : body), 'utf8').digest('hex');
}

/**
 * 24h 窗口内命中 dedupe_key，或同一收件人+主题+正文哈希，都算重复。
 * 只认已成功发送（有 smtp_message_id）的条目。
 */
export function isDuplicate(ledger, {dedupeKey, to, subject, bodySha, now = Date.now(), windowHours = DEFAULT_WINDOW_HOURS} = {}) {
  const entries = Array.isArray(ledger?.entries) ? ledger.entries : [];
  const cutoff = now - windowHours * 3600 * 1000;
  const key = String(dedupeKey || '').trim();
  const toNorm = String(to || '').trim().toLowerCase();
  const subjectNorm = String(subject || '').trim();
  for (let i = entries.length - 1; i >= 0; i -= 1) {
    const e = entries[i];
    if (!e || !e.smtp_message_id) continue;
    const ts = Date.parse(e.ts || '');
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    if (key && String(e.dedupe_key || '').trim() === key) {
      return {duplicate: true, reason: 'dedupe_key', entry: e};
    }
    if (
      bodySha &&
      e.body_sha256 === bodySha &&
      String(e.to || '').trim().toLowerCase() === toNorm &&
      String(e.subject || '').trim() === subjectNorm
    ) {
      return {duplicate: true, reason: 'same_body', entry: e};
    }
  }
  return {duplicate: false, reason: null, entry: null};
}

export function appendEntry(ledger, entry, {maxEntries = MAX_ENTRIES} = {}) {
  const base = ledger && Array.isArray(ledger.entries) ? ledger : emptyLedger();
  const entries = [...base.entries, entry].slice(-maxEntries);
  return {schema: LEDGER_SCHEMA, entries};
}

/** 读回邮件头时用：把 IMAP 侧 message_id 归到对应条目，不和 smtp_message_id 混记。 */
export function attachImapMessageId(ledger, {dedupeKey, imapMessageId}) {
  const target = normalizeMessageId(imapMessageId);
  const key = String(dedupeKey || '').trim();
  if (!target || !key) return ledger;
  const base = ledger && Array.isArray(ledger.entries) ? ledger : emptyLedger();
  const entries = base.entries.map((e) =>
    e && String(e.dedupe_key || '').trim() === key ? {...e, imap_message_id: target} : e,
  );
  return {schema: LEDGER_SCHEMA, entries};
}
