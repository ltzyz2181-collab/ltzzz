import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {githubClient} from './task-hub.mjs';
import {
  appendEntry,
  bodySha256,
  buildThreadHeaders,
  emptyLedger,
  isDuplicate,
  parseLedger,
  serializeLedger,
} from './lib/mail-thread.mjs';

export const SCHEMA = 'ltzzz.seat-mail.v1';
export const QUEUE_LABEL = 'mail:send';
export const LEDGER_RELATIVE_PATH = 'knowledge/results/seat-mail/ledger.json';

// Any seat can mail any other seat: it opens an issue with the `mail:send` label and the
// fields below. The queue is drained by a scheduled workflow, so a seat never needs
// SMTP credentials of its own. Reserved topics stay with GPT; this script only transports.
// P4: 卡片可选带 in_reply_to / references / dedupe_key，用于把回信接进原线程并防止重发。
export function parseMailIssue(issue) {
  const body = String(issue?.body || '');
  const field = (name) => {
    const m = new RegExp('^' + name + '\\s*[:：]\\s*(.+)$', 'im').exec(body);
    return m ? m[1].trim() : '';
  };
  const sep = body.search(/^\s*---\s*$/m);
  const text = sep >= 0 ? body.slice(sep).replace(/^\s*---\s*$/m, '').trim() : body.trim();
  const references = field('references')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  return {
    seat: field('seat') || 'unspecified',
    to: field('to') || field('收件人'),
    subject: field('subject') || field('主题') || (issue?.title || '').replace(/^\s*mail\s*[:：]\s*/i, ''),
    inReplyTo: field('in_reply_to') || field('in-reply-to') || '',
    references,
    dedupeKey: field('dedupe_key') || field('dedupe-key') || '',
    body: text,
  };
}

export function runSend({seat, to, subject, bodyFile, thread, env = process.env, cwd = process.cwd()}) {
  if (!to || !subject || !bodyFile) return {status: 'blocked_missing_fields', need: ['to', 'subject', 'body']};
  const python = env.AUTOLOOP_PYTHON || 'python3';
  const args = ['scripts/autoloop-mail.py', 'send', '--subject', subject, '--body-file', bodyFile, '--to', to];
  if (thread?.inReplyTo) args.push('--in-reply-to', thread.inReplyTo);
  if (thread?.referencesHeader) args.push('--references', thread.referencesHeader);
  const r = spawnSync(python, args, {cwd, encoding: 'utf8', timeout: 90000, env: {...env, MAIL_FROM_SEAT: seat || ''}});
  const last = String(r.stdout || '').trim().split('\n').filter(Boolean).at(-1);
  try { return JSON.parse(last); } catch { return {status: 'failed_unparseable', code: r.status, seat}; }
}

export function loadLedger(cwd = process.cwd()) {
  const file = path.join(cwd, LEDGER_RELATIVE_PATH);
  if (!fs.existsSync(file)) return {ledger: emptyLedger(), file};
  return {ledger: parseLedger(fs.readFileSync(file, 'utf8')), file};
}

export function saveLedger(ledger, cwd = process.cwd()) {
  const file = path.join(cwd, LEDGER_RELATIVE_PATH);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, serializeLedger(ledger), 'utf8');
  return file;
}

export async function drainQueue({token, env = process.env, cwd = process.cwd(), apply = false}) {
  const client = githubClient({token});
  const {data} = await client.api(`issues?state=open&labels=${encodeURIComponent(QUEUE_LABEL)}&per_page=50`);
  const issues = (Array.isArray(data) ? data : []).filter(i => !i.pull_request);
  let {ledger} = loadLedger(cwd);
  const out = [];
  for (const issue of issues) {
    const mail = parseMailIssue(issue);
    if (!apply) { out.push({number: issue.number, ...mail, status: 'planned'}); continue; }
    const tmp = path.join(cwd, 'knowledge/results/seat-mail', `issue-${issue.number}.txt`);
    fs.mkdirSync(path.dirname(tmp), {recursive: true});
    const text = `来自席位：${mail.seat}\n来源卡片：#${issue.number}\n\n${mail.body}\n`;
    fs.writeFileSync(tmp, text, 'utf8');
    const sha = bodySha256(text);

    const dup = isDuplicate(ledger, {dedupeKey: mail.dedupeKey, to: mail.to, subject: mail.subject, bodySha: sha});
    if (dup.duplicate) {
      await client.comment(issue.number, `[mail-skipped-duplicate] reason=${dup.reason} previous=${dup.entry?.smtp_message_id || 'none'} dedupe_key=${mail.dedupeKey || 'none'}`);
      try { await client.removeLabel(issue.number, QUEUE_LABEL); } catch { /* 标签已不在，忽略 */ }
      out.push({number: issue.number, seat: mail.seat, to: mail.to, status: 'duplicate', reason: dup.reason});
      continue;
    }

    const thread = buildThreadHeaders({inReplyTo: mail.inReplyTo, references: mail.references});
    const sent = runSend({seat: mail.seat, to: mail.to, subject: mail.subject, bodyFile: tmp, thread, env, cwd});
    await client.comment(issue.number, `[mail-sent] seat=${mail.seat} to=${mail.to} status=${sent.status} message_id=${sent.message_id || 'none'} in_reply_to=${thread.inReplyTo || 'none'} dedupe_key=${mail.dedupeKey || 'none'}`);
    if (sent.status === 'sent') {
      ledger = appendEntry(ledger, {
        ts: new Date().toISOString(),
        dedupe_key: mail.dedupeKey || '',
        issue: issue.number,
        seat: mail.seat,
        to: mail.to,
        subject: mail.subject,
        smtp_message_id: sent.message_id || null,
        imap_message_id: null,
        in_reply_to: thread.inReplyTo,
        references: thread.references,
        body_sha256: sha,
      });
      saveLedger(ledger, cwd);
      await client.removeLabel(issue.number, QUEUE_LABEL);
    }
    out.push({number: issue.number, seat: mail.seat, to: mail.to, status: sent.status, message_id: sent.message_id || null});
  }
  return {schema: SCHEMA, apply, count: out.length, results: out};
}

export async function main(argv = process.argv.slice(2), {env = process.env, cwd = process.cwd()} = {}) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const apply = argv.includes('--apply');
  if (argv.includes('--queue')) {
    if (!token) { console.log(JSON.stringify({schema: SCHEMA, error: 'no_token'})); return 0; }
    const r = await drainQueue({token, env, cwd, apply});
    const outDir = path.join(cwd, 'knowledge/results/seat-mail');
    fs.mkdirSync(outDir, {recursive: true});
    fs.writeFileSync(path.join(outDir, `run-${env.GITHUB_RUN_ID || 'local'}.json`), JSON.stringify(r, null, 2) + '\n', 'utf8');
    console.log(JSON.stringify(r, null, 2));
    return 0;
  }
  const arg = (name) => (argv.includes('--' + name) ? argv[argv.indexOf('--' + name) + 1] : '');
  const thread = buildThreadHeaders({inReplyTo: arg('in-reply-to'), references: []});
  const sent = runSend({seat: arg('seat'), to: arg('to'), subject: arg('subject'), bodyFile: arg('body-file'), thread, env, cwd});
  console.log(JSON.stringify(sent, null, 2));
  return 0;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  main().then(code => { if (code) process.exitCode = code; }).catch(e => { console.error(JSON.stringify({error: String(e?.message || e)})); process.exitCode = 1; });
}
