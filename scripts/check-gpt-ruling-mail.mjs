// owner 2026-11-17 要求：每日巡检要主动报「今天有没有收到 GPT 裁决回信」。
// 本脚本只读 Agent Mail 收件箱并落一份状态文件，不发送、不回复、不改任何任务状态。
// 读不到邮箱时必须记 unknown，不得默认成"没收到"。
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {redactSubject} from './track-gpt-rulings.mjs';

const run = promisify(execFile);
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// 不写死云主机路径：优先显式配置，其次该主机上已知的全局安装位置，最后交给 PATH。
const CLI = process.env.AGENTLY_CLI
  || (fs.existsSync('/home/user/.npm-global/bin/agently-cli') ? '/home/user/.npm-global/bin/agently-cli' : 'agently-cli');
const GPT_SENDER = 'ltzyz2181@gmail.com';
// 主题关键词。
const RULING = /(裁决|ruling|disposition|keep_blocked|return_for_revision|needs_decision|approve_in_scope|conditional_approve|已落库)/i;
// 主题前缀。GPT 总控席的派单/口径修正回信常写成「Re: [GPT总控派单] …」「Re: [LTZZZ][GPT总控派单] …」，
// 主题里不含上面的裁决词；只按关键词过滤会把这类真回信漏成「今日未见裁决回信」，
// 这正是 owner 明令禁止的「邮件没收到」错误口径（2026-11-23 实测漏 3 封）。
const REPLY_PREFIX = /^(?:(?:re|回复|答复|回覆)\s*[：:]\s*)+/i;
export function isRulingMessage(message) {
  const subject = (message?.subject || '').trim();
  return RULING.test(subject) || REPLY_PREFIX.test(subject);
}
const OUT = path.join(REPO_ROOT, 'knowledge/results/deep-superagent/gpt-ruling-mail/latest.json');
const SCHEMA = 'ltzzz.gpt-ruling-mail.v1';

function shanghaiDate(iso) {
  return new Date(iso).toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'});
}

async function inbox(limit = 50) {
  const {stdout} = await run(CLI, ['message', '+list', '--dir', 'inbox', '--limit', String(limit)], {timeout: 60000, maxBuffer: 8 << 20});
  const text = stdout.slice(0, stdout.lastIndexOf('}') + 1);
  const parsed = JSON.parse(text);
  const payload = parsed?.data?.data;
  if (!Array.isArray(payload)) throw new Error('agent_mail_inbox_shape_invalid');
  return payload;
}

export function summarize(messages, now = new Date()) {
  const today = now.toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'});
  const gpt = messages.filter(m => (m.from?.email || '').toLowerCase() === GPT_SENDER);
  const rulings = gpt.filter(isRulingMessage);
  const last = rulings.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null;
  const todayRulings = rulings.filter(m => shanghaiDate(m.created_at || '') === today);
  const matchedBy = {keyword: 0, reply_prefix: 0};
  for (const m of todayRulings) {
    if (RULING.test((m.subject || '').trim())) matchedBy.keyword += 1;
    else matchedBy.reply_prefix += 1;
  }
  const daysSince = last ? Math.round((now - new Date(last.created_at)) / 86400000) : null;
  return {
    date: today,
    received: todayRulings.length > 0,
    today_count: todayRulings.length,
    matched_by: matchedBy,
    last_received_at_utc: last?.created_at ?? null,
    last_message_id: last?.message_id ?? null,
    last_subject: last ? redactSubject(last.subject, 90) : null,
    days_since_last_ruling: daysSince,
    severity: todayRulings.length > 0 ? 'ok' : daysSince !== null && daysSince >= 1 ? 'owner_attention' : 'unknown',
    note: todayRulings.length > 0
      ? `今日收到 ${todayRulings.length} 封 GPT 裁决类回信（主题关键词 ${matchedBy.keyword} / 回复前缀 ${matchedBy.reply_prefix}）`
      : last
        ? `今日未见 GPT 裁决回信；最近一封在 ${shanghaiDate(last.created_at)}，距今 ${daysSince} 天`
        : '窗口内没有任何 GPT 裁决回信'
  };
}

async function main() {
  const now = new Date();
  let record;
  try {
    record = {schema: SCHEMA, status: 'ok', source: 'agent_mail_inbox', model_calls: 0, paid: false, generated_at_utc: now.toISOString(), ...summarize(await inbox(), now)};
  } catch (error) {
    record = {schema: SCHEMA, status: 'unknown', source: 'agent_mail_inbox', received: 'unknown', severity: 'unknown', note: '收件箱读取失败：' + String(error.message).slice(0, 200), model_calls: 0, paid: false, generated_at_utc: now.toISOString()};
  }
  const dir = path.dirname(OUT);
  fs.mkdirSync(dir, {recursive: true});
  fs.writeFileSync(OUT, JSON.stringify(record, null, 1) + '\n');
  console.log(JSON.stringify({status: record.status, received: record.received, days_since_last_ruling: record.days_since_last_ruling, note: record.note}));
  if (record.status !== 'ok') process.exitCode = 2;
}

if (process.argv[1] && process.argv[1].endsWith('check-gpt-ruling-mail.mjs')) main();
