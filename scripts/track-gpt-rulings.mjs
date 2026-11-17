#!/usr/bin/env node
// 裁决回执跟踪：把「我们问过谁、谁回了、回了有没有被读到」做成每天都能查的一份账。
// 背景：2026-11-17 那一轮里，GPT 在 11-16 19:51Z/19:54Z 已经回了 Phase1 六项裁决，
// 但邮件采集脚本把它们全归成 unknown，日回执继续写「待 GPT 裁决」——问了已答的问题。
//
// Phase 2 变更（GPT-LTZZZ-AUTONOMY-RULING-20261117-01 §二.7、§七）：
// - 线程除主题归对外，再按原始 Task ID 归并；
// - 保留线程内全部回复（不再只留最后一封），历史裁决不因新回复而丢失；
// - 回复正文不读取，只从主题提取 decision_id 并做脱敏；
// - 可被 run-mail-intake.mjs 直接 import，也可单独命令行运行；
// - 读取失败 fail-closed：status=unknown，绝不把「读不到」写成「没有裁决」。
//
// 用法：node scripts/track-gpt-rulings.mjs [--limit 60] [--window-days 21] [--write]
// 输出：knowledge/results/deep-superagent/ruling-tracker/latest.json（--write 时才落盘）

import {execFileSync} from 'node:child_process';
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {extractTaskIds, normalizeThreadKey} from './mail/dedupe.mjs';

export const TRACKER_SCHEMA = 'ltzzz.deep-superagent.ruling-tracker.v1';
export const EXTERNAL_DECIDER = 'ltzyz2181@gmail.com';
export const SELF = 'qingqizhu6502@agent.qq.com';
export const DEFAULT_OUT = 'knowledge/results/deep-superagent/ruling-tracker/latest.json';
export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const DECISION_ID_RE = /\b(?:GPT|LTZZZ)-[A-Z0-9]+(?:-[A-Z0-9]+)*-\d{8}(?:-\d{1,3})?\b/gi;
const AMOUNT_RE = /[¥$€£]?\s*[0-9][0-9.,]*\s*(?:UT|USDT|CNY|USD|EUR|ETH|BTC|元|美元|港币)?/gi;
const TOKEN_RE = /[A-Za-z0-9_-]{28,}/g;

export function extractDecisionIds(...texts) {
  const found = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const match of String(text).matchAll(DECISION_ID_RE)) found.add(match[0].toUpperCase());
  }
  return [...found].sort();
}

export function redactSubject(subject, max = 90) {
  return String(subject || '')
    .replace(AMOUNT_RE, '<amount>')
    .replace(TOKEN_RE, '<token>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function parseArgs(argv = process.argv.slice(2)) {
  const get = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    limit: Number(get('--limit', 60)),
    windowDays: Number(get('--window-days', 21)),
    write: argv.includes('--write'),
    out: get('--out', resolve(REPO_ROOT, DEFAULT_OUT)),
  };
}

export function collectMessages(items, dir) {
  return (items || []).map((m) => {
    const subject = m.subject || '';
    return {
      dir,
      id: m.message_id || null,
      at: m.created_at || null,
      from: String(m.from?.email || '').toLowerCase(),
      subject,
      subject_short: redactSubject(subject),
      read: m.is_read === true,
      inReplyTo: m.in_reply_to || null,
      task_ids: extractTaskIds(subject),
      decision_ids: extractDecisionIds(subject),
    };
  });
}

export function listMessages(dir, limit, {cli = process.env.AGENTLY_CLI, root = REPO_ROOT} = {}) {
  // 不写死云主机路径：优先显式配置，其次 PATH 里的 agently-cli。
  const bin = cli || 'agently-cli';
  const raw = execFileSync(bin, ['message', '+list', '--dir', dir, '--limit', String(Math.min(limit, 50))], {
    encoding: 'utf8',
    timeout: 120000,
    cwd: root,
  });
  const start = raw.indexOf('{');
  if (start < 0) throw new Error('agently-cli 返回不含 JSON：' + raw.slice(0, 200));
  const parsed = decodeFirstJson(raw.slice(start));
  const data = parsed?.data;
  const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
  if (!arr) throw new Error('无法定位消息数组，返回键：' + Object.keys(parsed || {}));
  return arr;
}

// agently-cli 的 JSON 后面会跟 tip 行，用增量解析只取第一个完整对象。
export function decodeFirstJson(text) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === '{' || char === '[') depth += 1;
    else if (char === '}' || char === ']') {
      depth -= 1;
      if (depth === 0) return JSON.parse(text.slice(0, i + 1));
    }
  }
  throw new Error('JSON 未闭合');
}

function threadKeysOf(message) {
  const keys = [];
  if (message.task_ids.length) for (const id of message.task_ids) keys.push(`task:${id}`);
  keys.push(`subject:${normalizeThreadKey(message.subject_short || message.subject)}`);
  return keys;
}

/**
 * 纯函数：由 inbox/sent 消息列表构造裁决跟踪账本。
 * 不读邮件正文，不修改输入。
 */
export function buildTracker({inbox = [], sent = [], now = new Date(), limit = 60, windowDays = 21} = {}) {
  const cutoff = new Date(now.getTime() - windowDays * 864e5).toISOString();
  const decider = inbox.filter((m) => m.from === EXTERNAL_DECIDER && String(m.at || '') >= cutoff);
  const asks = sent.filter((m) => m.from === SELF && /裁决|裁定|待批|请批/.test(m.subject) && String(m.at || '') >= cutoff);

  const threads = new Map();
  const touch = (key) => {
    if (!threads.has(key)) threads.set(key, {thread: key, asks: [], replies: []});
    return threads.get(key);
  };
  const index = new Map(); // message id -> thread bucket, 支持 in_reply_to 精确回挂
  const bucketForAsk = (ask) => {
    const key = threadKeysOf(ask)[0];
    const bucket = touch(key);
    if (ask.id) index.set(ask.id, bucket);
    return bucket;
  };
  const bucketForReply = (reply) => {
    if (reply.inReplyTo && index.has(reply.inReplyTo)) return index.get(reply.inReplyTo);
    const key = threadKeysOf(reply)[0];
    return touch(key);
  };

  for (const ask of asks) bucketForAsk(ask).asks.push(ask);
  for (const reply of decider) bucketForReply(reply).replies.push(reply);

  const items = [];
  for (const bucket of threads.values()) {
    if (!bucket.asks.length && !bucket.replies.length) continue;
    const sortedAsks = bucket.asks.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const sortedReplies = bucket.replies.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
    const lastAsk = sortedAsks.at(-1) || null;
    const lastReply = sortedReplies.at(-1) || null;
    const answered = Boolean(lastReply && (!lastAsk || String(lastReply.at) >= String(lastAsk.at)));
    const waitingHours = lastAsk && !answered ? (now.getTime() - Date.parse(lastAsk.at)) / 36e5 : 0;
    const decisionIds = [...new Set(sortedReplies.flatMap((r) => r.decision_ids))].sort();
    const taskIds = [...new Set([...sortedAsks, ...sortedReplies].flatMap((m) => m.task_ids))].sort();
    const unreadReplies = sortedReplies.filter((r) => !r.read);

    items.push({
      thread: bucket.thread,
      thread_key: bucket.thread,
      task_ids: taskIds,
      decision_ids: decisionIds,
      decision_id: decisionIds.length === 1 ? decisionIds[0] : null,
      status: lastReply ? (answered ? 'answered' : 'answered_before_last_ask') : 'pending_no_reply',
      await_evidence: unreadReplies.length ? 'reply_unread' : sortedReplies.length ? 'reply_read' : 'no_reply',
      last_ask_at: lastAsk?.at || null,
      last_ask_id: lastAsk?.id || null,
      last_reply_at: lastReply?.at || null,
      last_reply_id: lastReply?.id || null,
      waiting_hours: Math.round(waitingHours * 10) / 10,
      ask_count: sortedAsks.length,
      reply_count: sortedReplies.length,
      // 历史裁决全部保留：同一线程多封回复不覆盖、不丢弃。
      replies: sortedReplies.map((r) => ({
        id: r.id,
        at: r.at,
        read: r.read,
        decision_ids: r.decision_ids,
        subject_short: r.subject_short,
      })),
      rulings: sortedReplies.map((r) => ({
        message_id: r.id,
        at: r.at,
        decision_id: r.decision_ids.length === 1 ? r.decision_ids[0] : null,
        decision_ids: r.decision_ids,
      })),
    });
  }

  items.sort((a, b) => String(b.last_reply_at || b.last_ask_at || '').localeCompare(String(a.last_reply_at || a.last_ask_at || '')));
  const pendingOver24h = items.filter((i) => i.status !== 'answered' && i.waiting_hours >= 24);
  const unreadReplies = items.filter((i) => i.await_evidence === 'reply_unread');

  return {
    schema: TRACKER_SCHEMA,
    generated_at_utc: now.toISOString(),
    decider: EXTERNAL_DECIDER,
    source: {inbox_scanned: inbox.length, sent_scanned: sent.length, limit},
    counts: {
      threads: items.length,
      answered: items.filter((i) => i.status === 'answered').length,
      pending_no_reply: items.filter((i) => i.status === 'pending_no_reply').length,
      answered_but_unread: unreadReplies.length,
      pending_over_24h: pendingOver24h.length,
    },
    consume_gate: unreadReplies
      .filter((i) => Date.parse(i.last_reply_at) > now.getTime() - 48 * 36e5)
      .map((i) => ({thread: i.thread, reply_id: i.last_reply_id, replied_at: i.last_reply_at, note: '裁决已到但未读：当天必须读正文再写 awaiting_decision'})),
    alerts: [
      ...pendingOver24h.map((i) => ({kind: 'no_reply_over_24h', thread: i.thread, waiting_hours: i.waiting_hours})),
      ...unreadReplies.map((i) => ({kind: 'reply_unread', thread: i.thread, reply_id: i.last_reply_id})),
    ],
    items,
    note: '本清单只做证据核对：reply_unread 表示裁决已到但日回执还没消费它，必须当天读正文后才能写 awaiting_decision。',
  };
}

export function readTracker(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

export function writeTracker(doc, path) {
  mkdirSync(dirname(path), {recursive: true});
  writeFileSync(path, JSON.stringify(doc, null, 2) + '\n', 'utf8');
}

export function runTracker(options = {}) {
  const {limit, windowDays, write, out} = {
    limit: 60,
    windowDays: 21,
    write: false,
    out: resolve(REPO_ROOT, DEFAULT_OUT),
    ...options,
  };
  const now = options.now || new Date();
  const inbox = collectMessages(options.inbox ?? listMessages('inbox', limit, options), 'inbox');
  const sent = collectMessages(options.sent ?? listMessages('sent', limit, options), 'sent');
  const doc = buildTracker({inbox, sent, now, limit, windowDays});
  if (write) writeTracker(doc, out);
  return doc;
}

function main() {
  const {limit, windowDays, write, out} = parseArgs();
  let doc;
  try {
    doc = runTracker({limit, windowDays, write, out});
  } catch (error) {
    // fail-closed：读不到邮箱就写 unknown，不写 0，也不阻塞其他任务。
    doc = {
      schema: TRACKER_SCHEMA,
      status: 'unknown',
      generated_at_utc: new Date().toISOString(),
      decider: EXTERNAL_DECIDER,
      error_class: error?.name || 'Error',
      note: '收件箱读取失败：' + String(error?.message || error).slice(0, 200),
      counts: null,
      items: [],
    };
    if (write) {
      try {
        writeTracker(doc, out);
      } catch {
        /* 写盘也失败时保持进程非零，不伪装 */
      }
    }
    console.log(JSON.stringify({status: 'unknown', note: doc.note}));
    process.exitCode = 2;
    return;
  }
  console.log(JSON.stringify(doc, null, 2));
}

const invokedPath = process.argv[1] ? resolve(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) main();
