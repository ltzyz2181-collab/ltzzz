import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// 中转席位自助通道：任何席位开一张带 relay:run 标签的 Issue，工作流在 GitHub 网络上代跑，
// 再把判词回贴到原 Issue。这样即使请求方所在网络解析不了代理主机，也能拿到中转结论。
// 本脚本只搬运，不改变权限：资金/退款终态/签名/私钥/钱包仍不由中转批准。

export const SCHEMA = 'ltzzz.relay-issue-run.v1';
export const RUN_LABEL = 'relay:run';
export const MAX_PROMPT_CHARS = 40000;

export const SEAT_MODELS = {
  relay_gpt: {model: 'gpt-6.1-sol', profile: 'adjudication'},
  relay_claude: {model: 'claude-sonnet-4-6', profile: 'code'},
};

export function seatRouteFromLabels(labels = []) {
  // 仓库既有标签用连字符（seat:relay-claude），席位 id 用下划线（relay_claude），两者都认。
  const names = labels
    .map((l) => (typeof l === 'string' ? l : l?.name))
    .filter(Boolean)
    .map((name) => String(name).replace(/-/g, '_'));
  for (const seat of Object.keys(SEAT_MODELS)) {
    if (names.includes('seat:' + seat) || names.includes(seat)) return seat;
  }
  return null;
}

export function extractPrompt(body, {maxChars = MAX_PROMPT_CHARS} = {}) {
  const text = String(body ?? '').replace(/\r\n/g, '\n').trim();
  if (!text) return {prompt: '', truncated: false, chars: 0};
  const capped = text.slice(0, maxChars);
  return {prompt: capped, truncated: capped.length < text.length, chars: capped.length};
}

export function buildPromptFile(issue, {seat, maxChars = MAX_PROMPT_CHARS} = {}) {
  const {prompt, truncated, chars} = extractPrompt(issue?.body, {maxChars});
  if (!prompt) return {error: 'relay_issue_body_empty'};
  const route = SEAT_MODELS[seat];
  if (!route) return {error: 'relay_issue_seat_unknown'};
  const header = [
    '你是 LTZZZ 的中转 ' + (seat === 'relay_gpt' ? 'GPT 席（口径与边界裁决，非资金）' : 'Claude 席（长上下文结构性复核）') + '。',
    '本请求来自 Issue #' + issue.number + '，请求方席位由卡片声明；你只做文本判断，不改文件、不派单、不宣称已执行。',
    '边界：不得触碰资金/退款终态/签名/私钥/钱包；不得宣称已付款、已签名、已部署；不写金额。',
    truncated ? '（注意：请求正文超过 ' + maxChars + ' 字符已截断，缺失部分请明确列为证据不足。）' : '',
    '',
    '=== 请求正文 ===',
    prompt,
  ].filter(Boolean).join('\n');
  return {header, route, truncated, chars};
}

// relay-seat.mjs 用 pretty JSON 打印，整段解析；退化时才取最后一行，避免把 "}" 当成结果。
export function parseRelayOutput(raw) {
  const text = String(raw ?? '').trim();
  if (!text) return null;
  try { return JSON.parse(text); } catch { /* 继续退化 */ }
  const last = text.split('\n').map((line) => line.trim()).filter(Boolean).at(-1);
  if (!last) return null;
  try { return JSON.parse(last); } catch { return null; }
}

function githubClient(token) {
  const base = 'https://api.github.com/repos/' + process.env.GITHUB_REPOSITORY;
  const headers = {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'Content-Type': 'application/json'};
  return {
    async getIssue(n) {
      const r = await fetch(base + '/issues/' + n, {headers});
      if (!r.ok) throw new Error('issue_fetch_' + r.status);
      return r.json();
    },
    async comment(n, body) {
      const r = await fetch(base + '/issues/' + n + '/comments', {method: 'POST', headers, body: JSON.stringify({body})});
      return r.status;
    },
  };
}

export async function main({env = process.env, cwd = process.cwd()} = {}) {
  const token = env.GITHUB_TOKEN || env.GH_TOKEN;
  const issueNumber = Number(env.ISSUE_NUMBER || env.INPUT_ISSUE || 0);
  if (!token) return {ok: false, error: 'no_token'};
  if (!issueNumber) return {ok: false, error: 'issue_number_required'};
  const gh = githubClient(token);
  const issue = await gh.getIssue(issueNumber);
  const seat = env.REQUESTED_AGENT && SEAT_MODELS[env.REQUESTED_AGENT] ? env.REQUESTED_AGENT : seatRouteFromLabels(issue.labels);
  if (!seat) {
    await gh.comment(issueNumber, '[relay-skipped] reason=seat_label_missing 需要 seat:relay_gpt 或 seat:relay_claude 标签');
    return {ok: false, error: 'seat_label_missing'};
  }
  const built = buildPromptFile(issue, {seat});
  if (built.error) {
    await gh.comment(issueNumber, '[relay-skipped] reason=' + built.error);
    return {ok: false, error: built.error};
  }
  const promptFile = path.join(cwd, '.tmp-relay-issue-' + issueNumber + '.txt');
  fs.writeFileSync(promptFile, built.header + '\n', 'utf8');
  const model = env.MODEL || built.route.model;
  const profile = env.PROFILE || built.route.profile;
  const maxTokens = String(env.MAX_TOKENS || (profile === 'adjudication' ? 900 : 1500));
  const r = spawnSync(process.execPath, ['scripts/relay-seat.mjs', '--call', '--purpose', profile === 'code' ? 'code' : 'adjudication', '--profile', profile, '--model', model, '--requested-agent', seat, '--prompt-file', promptFile, '--max-tokens', maxTokens], {cwd, encoding: 'utf8', timeout: 300000, env});
  const call = parseRelayOutput(r.stdout) || parseRelayOutput(r.stderr);
  if (!call) console.error((r.stderr || r.stdout || '').slice(0, 2000));
  const lines = [
    '[relay-result] seat=' + seat + ' model=' + model + ' http=' + (call?.http ?? 'none') + ' cost_usd=' + (call?.cost_usd ?? 'none') + ' evidence=' + (call?.evidence || 'none'),
    '',
    call?.ok ? call.reply_text : ('[relay-failed] ' + (call?.http_error || call?.failure || call?.error || 'unparseable_output') + ' sent_http_request=' + (call?.sent_http_request ?? 'unknown')),
    '',
    '本结论由中转席位产出，属受限判断记录，不等同 GPT 裁决或 owner 授权；资金/退款终态/签名/私钥/钱包事项已排除。',
  ];
  await gh.comment(issueNumber, lines.join('\n'));
  return {ok: Boolean(call?.ok), seat, model, issueNumber, cost_usd: call?.cost_usd ?? null, evidence: call?.evidence || null};
}

const invokedDirectly = Boolean(process.argv[1]) && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().then((out) => {
    process.stdout.write(JSON.stringify({schema: SCHEMA, ...out}) + '\n');
    if (!out.ok) process.exitCode = 1;
  }).catch((error) => {
    process.stdout.write(JSON.stringify({schema: SCHEMA, ok: false, error: String(error?.message || error)}) + '\n');
    process.exitCode = 1;
  });
}
