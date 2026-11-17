// owner 2026-11-17 要求：每日巡检要主动报「今天有没有收到 GPT 裁决回信」。
// 本脚本只读 Agent Mail 收件箱并落一份状态文件，不发送、不回复、不改任何任务状态。
// 读不到邮箱时必须记 unknown，不得默认成"没收到"。
import fs from 'node:fs';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';

const run = promisify(execFile);
const CLI = process.env.AGENTLY_CLI || '/home/user/.npm-global/bin/agently-cli';
const GPT_SENDER = 'ltzyz2181@gmail.com';
const RULING = /(裁决|ruling|disposition|keep_blocked|return_for_revision|needs_decision|approve_in_scope|conditional_approve|已落库)/i;
const OUT = 'knowledge/results/deep-superagent/gpt-ruling-mail/latest.json';
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
  const rulings = gpt.filter(m => RULING.test(m.subject || ''));
  const last = rulings.slice().sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''))[0] || null;
  const todayRulings = rulings.filter(m => shanghaiDate(m.created_at || '') === today);
  const daysSince = last ? Math.round((now - new Date(last.created_at)) / 86400000) : null;
  return {
    date: today,
    received: todayRulings.length > 0,
    today_count: todayRulings.length,
    last_received_at_utc: last?.created_at ?? null,
    last_message_id: last?.message_id ?? null,
    last_subject: last?.subject ?? null,
    days_since_last_ruling: daysSince,
    severity: todayRulings.length > 0 ? 'ok' : daysSince !== null && daysSince >= 1 ? 'owner_attention' : 'unknown',
    note: todayRulings.length > 0
      ? `今日收到 ${todayRulings.length} 封 GPT 裁决类回信`
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
