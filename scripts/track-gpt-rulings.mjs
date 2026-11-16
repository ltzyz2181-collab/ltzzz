#!/usr/bin/env node
// 裁决回执跟踪：把「我们问过谁、谁回了、回了有没有被读到」做成每天都能查的一份账。
// 背景：2026-11-17 那一轮里，GPT 在 11-16 19:51Z/19:54Z 已经回了 Phase1 六项裁决，
// 但邮件采集脚本把它们全归成 unknown，日回执继续写「待 GPT 裁决」——问了已答的问题。
// 用法：node scripts/track-gpt-rulings.mjs [--limit 60] [--write]
// 输出：knowledge/results/deep-superagent/ruling-tracker/latest.json（--write 时才落盘）

import { execFileSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

const OUT = "knowledge/results/deep-superagent/ruling-tracker/latest.json";
const EXTERNAL_DECIDER = "ltzyz2181@gmail.com";
const SELF = "qingqizhu6502@agent.qq.com";

function args() {
  const a = process.argv.slice(2);
  const get = (k, d) => {
    const i = a.indexOf(k);
    return i >= 0 && a[i + 1] ? a[i + 1] : d;
  };
  return { limit: Number(get("--limit", 60)), windowDays: Number(get("--window-days", 21)), write: a.includes("--write") };
}

function listMessages(dir, limit) {
  const raw = execFileSync(
    "agently-cli",
    ["message", "+list", "--dir", dir, "--limit", String(Math.min(limit, 50))],
    { encoding: "utf8", timeout: 120000 },
  );
  const start = raw.indexOf("{");
  if (start < 0) throw new Error("agently-cli 返回不含 JSON：" + raw.slice(0, 200));
  const dec = new JSONDecoder();
  const parsed = dec.decode(raw.slice(start));
  const data = parsed?.data;
  const arr = Array.isArray(data) ? data : Array.isArray(data?.data) ? data.data : null;
  if (!arr) throw new Error("无法定位消息数组，返回键：" + Object.keys(parsed || {}));
  return arr;
}

// agently-cli 的 JSON 后面会跟 tip 行，用增量解析只取第一个完整对象。
class JSONDecoder {
  decode(s) {
    let depth = 0, inStr = false, esc = false;
    for (let i = 0; i < s.length; i += 1) {
      const c = s[i];
      if (inStr) {
        if (esc) esc = false;
        else if (c === "\\") esc = true;
        else if (c === '"') inStr = false;
        continue;
      }
      if (c === '"') inStr = true;
      else if (c === "{" || c === "[") depth += 1;
      else if (c === "}" || c === "]") {
        depth -= 1;
        if (depth === 0) return JSON.parse(s.slice(0, i + 1));
      }
    }
    throw new Error("JSON 未闭合");
  }
}

const isAsk = (subject = "") => /裁决|裁定|待批|请批/.test(subject);
const threadKey = (subject = "") =>
  subject
    .replace(/^((re|re|fw|fwd|回复|答复)\s*[:：]\s*)+/gi, "")
    .replace(/^\[[^\]]+\]\s*/g, "")
    .replace(/\s+/g, " ")
.trim();

function collect(items, dir) {
  return items.map((m) => ({
    dir,
    id: m.message_id,
    at: m.created_at,
    from: (m.from?.email || "").toLowerCase(),
    subject: m.subject || "",
    read: m.is_read === true,
    inReplyTo: m.in_reply_to || null,
  }));
}

function main() {
  const { limit, windowDays, write } = args();
  const cutoff = new Date(Date.now() - windowDays * 864e5).toISOString();
  const inbox = collect(listMessages("inbox", limit), "inbox");
  const sent = collect(listMessages("sent", limit), "sent");

  const decider = inbox.filter((m) => m.from === EXTERNAL_DECIDER && m.at >= cutoff);
  const asks = sent.filter((m) => m.from === SELF && isAsk(m.subject) && m.at >= cutoff);

  const threads = new Map();
  const touch = (key) => {
    if (!threads.has(key)) threads.set(key, { thread: key, asks: [], replies: [] });
    return threads.get(key);
  };
  for (const a of asks) touch(threadKey(a.subject)).asks.push(a);
  for (const r of decider) {
    // 回信优先按 in_reply_to 挂到被回复的线程；没有就按主题归一
    const parent = sent.find((s) => r.inReplyTo && s.id === r.inReplyTo);
    touch(threadKey(parent ? parent.subject : r.subject)).replies.push(r);
  }

  const now = Date.now();
  const items = [];
  for (const t of threads.values()) {
    if (!t.asks.length && !t.replies.length) continue;
    const lastAsk = t.asks.sort((x, y) => x.at.localeCompare(y.at)).at(-1) || null;
    const lastReply = t.replies.sort((x, y) => x.at.localeCompare(y.at)).at(-1) || null;
    const answered = Boolean(lastReply && (!lastAsk || lastReply.at >= lastAsk.at));
    const waitingHours = lastAsk && !answered ? (now - Date.parse(lastAsk.at)) / 36e5 : 0;
    items.push({
      thread: t.thread,
      status: lastReply ? (answered ? "answered" : "answered_before_last_ask") : "pending_no_reply",
      await_evidence: lastReply && !lastReply.read ? "reply_unread" : "reply_read",
      last_ask_at: lastAsk?.at || null,
      last_ask_id: lastAsk?.id || null,
      last_reply_at: lastReply?.at || null,
      last_reply_id: lastReply?.id || null,
      waiting_hours: Math.round(waitingHours * 10) / 10,
      ask_count: t.asks.length,
      reply_count: t.replies.length,
    });
  }

  items.sort((a, b) => (b.last_reply_at || b.last_ask_at || "").localeCompare(a.last_reply_at || a.last_ask_at || ""));
  const pendingOver24h = items.filter((i) => i.status !== "answered" && i.waiting_hours >= 24);
  const unreadReplies = items.filter((i) => i.await_evidence === "reply_unread");

  const doc = {
    schema: "ltzzz.deep-superagent.ruling-tracker.v1",
    generated_at_utc: new Date().toISOString(),
    decider: EXTERNAL_DECIDER,
    source: { inbox_scanned: inbox.length, sent_scanned: sent.length, limit },
    counts: {
      threads: items.length,
      answered: items.filter((i) => i.status === "answered").length,
      pending_no_reply: items.filter((i) => i.status === "pending_no_reply").length,
      answered_but_unread: unreadReplies.length,
      pending_over_24h: pendingOver24h.length,
    },
    consume_gate: unreadReplies
      .filter((i) => Date.parse(i.last_reply_at) > Date.now() - 48 * 36e5)
      .map((i) => ({ thread: i.thread, reply_id: i.last_reply_id, replied_at: i.last_reply_at, note: "裁决已到但未读：当天必须读正文再写 awaiting_decision" })),
    alerts: [
      ...pendingOver24h.map((i) => ({ kind: "no_reply_over_24h", thread: i.thread, waiting_hours: i.waiting_hours })),
      ...unreadReplies.map((i) => ({ kind: "reply_unread", thread: i.thread, reply_id: i.last_reply_id })),
    ],
    items,
    note: "本清单只做证据核对：reply_unread 表示裁决已到但日回执还没消费它，必须当天读正文后才能写 awaiting_decision。",
  };

  if (write) {
    mkdirSync(dirname(OUT), { recursive: true });
    writeFileSync(OUT, JSON.stringify(doc, null, 2) + "\n", "utf8");
  }
  console.log(JSON.stringify(doc, null, 2));
}

main();
