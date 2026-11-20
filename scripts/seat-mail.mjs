import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {githubClient} from './task-hub.mjs';

export const SCHEMA = 'ltzzz.seat-mail.v1';
export const QUEUE_LABEL = 'mail:send';

// Any seat can mail any other seat: it opens an issue with the `mail:send` label and the
// four fields below. The queue is drained by a scheduled workflow, so a seat never needs
// SMTP credentials of its own. Reserved topics stay with GPT; this script only transports.
export function parseMailIssue(issue) {
  const body = String(issue?.body || '');
  const field = (name) => {
    const m = new RegExp('^' + name + '\\s*[:：]\\s*(.+)$', 'im').exec(body);
    return m ? m[1].trim() : '';
  };
  const sep = body.search(/^\s*---\s*$/m);
  const text = sep >= 0 ? body.slice(sep).replace(/^\s*---\s*$/m, '').trim() : body.trim();
  return {
    seat: field('seat') || 'unspecified',
    to: field('to') || field('收件人'),
    subject: field('subject') || field('主题') || (issue?.title || '').replace(/^\s*mail\s*[:：]\s*/i, ''),
    body: text,
  };
}

export function runSend({seat, to, subject, bodyFile, env = process.env, cwd = process.cwd()}) {
  if (!to || !subject || !bodyFile) return {status: 'blocked_missing_fields', need: ['to', 'subject', 'body']};
  const python = env.AUTOLOOP_PYTHON || 'python3';
  const r = spawnSync(python, ['scripts/autoloop-mail.py', 'send', '--subject', subject, '--body-file', bodyFile, '--to', to], {cwd, encoding: 'utf8', timeout: 90000, env: {...env, MAIL_FROM_SEAT: seat || ''}});
  const last = String(r.stdout || '').trim().split('\n').filter(Boolean).at(-1);
  try { return JSON.parse(last); } catch { return {status: 'failed_unparseable', code: r.status, seat}; }
}

export async function drainQueue({token, env = process.env, cwd = process.cwd(), apply = false}) {
  const client = githubClient({token});
  const {data} = await client.api(`issues?state=open&labels=${encodeURIComponent(QUEUE_LABEL)}&per_page=50`);
  const issues = (Array.isArray(data) ? data : []).filter(i => !i.pull_request);
  const out = [];
  for (const issue of issues) {
    const mail = parseMailIssue(issue);
    if (!apply) { out.push({number: issue.number, ...mail, status: 'planned'}); continue; }
    const tmp = path.join(cwd, 'knowledge/results/seat-mail', `issue-${issue.number}.txt`);
    fs.mkdirSync(path.dirname(tmp), {recursive: true});
    fs.writeFileSync(tmp, `来自席位：${mail.seat}\n来源卡片：#${issue.number}\n\n${mail.body}\n`, 'utf8');
    const sent = runSend({seat: mail.seat, to: mail.to, subject: mail.subject, bodyFile: tmp, env, cwd});
    await client.comment(issue.number, `[mail-sent] seat=${mail.seat} to=${mail.to} status=${sent.status} message_id=${sent.message_id || 'none'}`);
    if (sent.status === 'sent') await client.removeLabel(issue.number, QUEUE_LABEL);
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
  const sent = runSend({seat: arg('seat'), to: arg('to'), subject: arg('subject'), bodyFile: arg('body-file'), env, cwd});
  console.log(JSON.stringify(sent, null, 2));
  return 0;
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  main().then(code => { if (code) process.exitCode = code; }).catch(e => { console.error(JSON.stringify({error: String(e?.message || e)})); process.exitCode = 1; });
}
