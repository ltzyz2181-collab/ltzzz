#!/usr/bin/env node
// 任务中心邮件通知 — 只做提醒，不承载授权。
//
// 默认只打印摘要（dry-run）；加 --send 且提供 SMTP 凭据才真正投递。
// 凭据只从环境变量读取，不落盘、不写日志、不进仓库：
//   TASK_HUB_SMTP_HOST / TASK_HUB_SMTP_PORT / TASK_HUB_SMTP_USER / TASK_HUB_SMTP_AUTH_CODE / TASK_HUB_MAIL_TO
// 也可用 --env-file <path> 指向仓库外的 KEY=VALUE 文件（qq-smtp.env 同格式）。
//
// 用法：
//   node scripts/task-hub-mail.mjs --seat desktop-claude [--send] [--out /tmp/digest.txt]
import fs from 'node:fs';
import tls from 'node:tls';
import {pathToFileURL} from 'node:url';
import {githubClient} from './task-hub.mjs';
import {buildDigest, normalizeSeat, DEFAULT_LEASE_HOURS} from './lib/task-hub.mjs';

const argOf = (argv, name, fallback = null) => argv.flatMap((arg, i) => (arg === name && argv[i + 1] ? [argv[i + 1]] : [])).at(-1) ?? fallback;

function readEnvFile(file) {
  const out = {};
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const text = line.trim();
    if (!text || text.startsWith('#') || !text.includes('=')) continue;
    const [key, ...rest] = text.split('=');
    out[key.trim()] = rest.join('=').trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export function smtpConfig(env = process.env) {
  return {
    host: env.TASK_HUB_SMTP_HOST || env.QQ_SMTP_HOST || 'smtp.qq.com',
    port: Number(env.TASK_HUB_SMTP_PORT || env.QQ_SMTP_PORT || 465),
    user: env.TASK_HUB_SMTP_USER || env.QQ_SMTP_USER || null,
    authCode: env.TASK_HUB_SMTP_AUTH_CODE || env.QQ_SMTP_AUTH_CODE || null,
    to: env.TASK_HUB_MAIL_TO || env.QQ_SMTP_TO || 'ltzyz2181@gmail.com',
  };
}

// Minimal SMTP over implicit TLS: EHLO → AUTH LOGIN → MAIL/RCPT → DATA.
// Kept dependency-free so CI and the desktop can both run it.
export async function smtpSend({host, port, user, authCode, to, subject, body, timeout = 30000}) {
  if (!user || !authCode) throw Error('task_hub_smtp_credentials_missing');
  const socket = tls.connect({host, port, servername: host});
  socket.setTimeout(timeout);
  let buffer = '';
  let waiter = null;
  const feed = chunk => {
    buffer += chunk.toString('utf8');
    if (waiter) { const w = waiter; waiter = null; w(); }
  };
  socket.on('data', feed);
  socket.on('error', error => { if (waiter) { const w = waiter; waiter = null; w(error); } });
  socket.on('timeout', () => socket.destroy(Error('task_hub_smtp_timeout')));
  const expect = async code => {
    for (;;) {
      const lines = buffer.split('\r\n');
      const complete = lines.findIndex((line, i) => /^\d{3} /.test(line) && lines.slice(0, i + 1).every(l => /^\d{3}[- ]/.test(l)));
      if (complete >= 0) {
        const reply = lines.slice(0, complete + 1).join('\n');
        buffer = lines.slice(complete + 1).join('\r\n');
        if (!reply.startsWith(String(code))) throw Error(`task_hub_smtp_unexpected_reply:${reply.split('\n').at(-1)?.slice(0, 40)}`);
        return reply;
      }
      await new Promise((resolve, reject) => { waiter = error => (error ? reject(error) : resolve()); });
    }
  };
  const send = line => socket.write(line + '\r\n');
  await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject); });
  await expect(220);
  send('EHLO ltzzz-task-hub'); await expect(250);
  send('AUTH LOGIN'); await expect(334);
  send(Buffer.from(user).toString('base64')); await expect(334);
  send(Buffer.from(authCode).toString('base64')); await expect(235);
  send(`MAIL FROM:<${user}>`); await expect(250);
  send(`RCPT TO:<${to}>`); await expect(250);
  send('DATA'); await expect(354);
  const message = [
    `From: ${user}`, `To: ${to}`, `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`,
    `Date: ${new Date().toUTCString()}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '',
    Buffer.from(body, 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n'),
  ].join('\r\n');
  socket.write(message.replace(/\r\n/g, '\r\n') + '\r\n.\r\n');
  await expect(250);
  send('QUIT');
  socket.end();
  return {status: 'sent', to};
}

export async function main(argv = process.argv.slice(2), {env = process.env, fetcher = fetch} = {}) {
  const seat = normalizeSeat(argOf(argv, '--seat')) || argOf(argv, '--seat');
  if (!seat) throw Error('task_hub_seat_required');
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  if (!token) throw Error('task_hub_token_required');
  const client = githubClient({token, fetcher});
  const open = await client.listOpenDispatches();
  const issues = await Promise.all(open.map(issue => client.withComments(issue)));
  const now = argOf(argv, '--now') || new Date().toISOString();
  const body = buildDigest({seat, issues, now, leaseHours: Number(argOf(argv, '--lease-hours', DEFAULT_LEASE_HOURS))});
  const out = argOf(argv, '--out');
  if (out) fs.writeFileSync(out, body + '\n');
  if (!argv.includes('--send')) { console.log(body); return {status: 'dry_run', seat, out}; }
  const envFile = argOf(argv, '--env-file');
  const config = smtpConfig(envFile ? {...readEnvFile(envFile), ...env} : env);
  const result = await smtpSend({...config, subject: `【LTZZZ 任务中心】${seat} 待领取任务`, body});
  console.log(JSON.stringify({...result, seat, out}));
  return result;
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : null;
if (invokedPath === import.meta.url) {
  main().catch(error => { console.error(JSON.stringify({error: error.message})); process.exitCode = 1; });
}
