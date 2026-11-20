import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';

const REPO = process.env.GITHUB_REPOSITORY || 'ltzyz2181-collab/ltzzz';
const FORBIDDEN_PATH = /(wallet|\.env|secret|credential|private[-_]?key|keystore|\.pem$)/i;
const CONTROL_PLANE = [
  /^\.github\/workflows\//,
  /^config\/owner-authority/,
  /^config\/relay-seat-policy\.json$/,
  /^scripts\/relay-seat(-acceptance)?\.mjs$/,
  /^scripts\/lib\/relay-seat-guard\.mjs$/,
  /^ops\/autoloop\/executors\.json$/,
];

export function checkPath(rel) {
  if (typeof rel !== 'string' || rel.trim() === '') return 'bad_path';
  if (/^[a-zA-Z]:/.test(rel) || rel.startsWith('/') || rel.startsWith('\\')) return 'path_absolute';
  if (rel.split(/[\\/]/).includes('..')) return 'path_traversal';
  if (FORBIDDEN_PATH.test(rel)) return 'path_forbidden';
  if (CONTROL_PLANE.some((r) => r.test(rel))) return 'path_control_plane';
  return null;
}

export function parseCard(body = '') {
  const text = String(body);
  const field = (name) => {
    const m = new RegExp('^' + name + '\\s*[:：]\\s*(.+)$', 'im').exec(text);
    return m ? m[1].trim() : '';
  };
  const paths = (field('paths') || '').split(/[,，\s]+/).map(s => s.trim()).filter(Boolean);
  const sep = text.search(/^\s*---\s*$/m);
  const instruction = sep >= 0 ? text.slice(sep).replace(/^\s*---\s*$/m, '').trim() : text.trim();
  return {paths, instruction};
}

export function toPrompt({paths, instruction, files}) {
  return [
    '你是 relay-claude 代码席，在 LTZZZ 仓库内改文件。只允许改动下面列出的路径。',
    '资金、退款终态、签名、私钥、助记词、钱包、五签 Safe、凭据与密钥一律不碰；遇到这类需求直接返回空 files。',
    '输出必须是 JSON，且只有一个顶层对象：{"files":[{"path":"<允许的路径>","content":"<完整文件内容>"}]}',
    '不要输出解释、不要输出 diff、不要新增未列出的路径。',
    '',
    '允许路径：' + paths.join(', '),
    '',
    '任务：',
    instruction.slice(0, 6000),
    '',
    '现有内容：',
    ...paths.map(p => `--- ${p} ---\n${(files[p] ?? '(文件不存在)').slice(0, 20000)}`),
  ].join('\n');
}

export function validatePatch({declared = [], files = []}) {
  const allowed = new Set(declared);
  for (const rel of allowed) {
    const bad = checkPath(rel);
    if (bad) return {ok: false, code: bad, path: rel};
  }
  const out = [];
  for (const f of files || []) {
    if (!f || typeof f.path !== 'string' || typeof f.content !== 'string') return {ok: false, code: 'bad_file_entry'};
    if (!allowed.has(f.path)) return {ok: false, code: 'path_not_declared', path: f.path};
    const bad = checkPath(f.path);
    if (bad) return {ok: false, code: bad, path: f.path};
    if (f.content.length > 200000) return {ok: false, code: 'file_too_large', path: f.path};
    out.push(f);
  }
  if (out.length === 0) return {ok: false, code: 'no_files_returned'};
  return {ok: true, files: out};
}

export function extractJson(text) {
  const s = String(text || '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

async function fetchIssue(token, number) {
  const res = await fetch(`https://api.github.com/repos/${REPO}/issues/${number}`, {
    headers: {Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json', 'User-Agent': 'ltzzz-relay-claude'},
  });
  if (!res.ok) throw new Error('issue_fetch_' + res.status);
  return res.json();
}

export function verifyWorktree({cwd = process.cwd()} = {}) {
  const status = spawnSync('git', ['status', '--porcelain'], {cwd, encoding: 'utf8'});
  const changed = String(status.stdout || '').split('\n').filter(Boolean).map(l => l.slice(3).trim());
  if (changed.length === 0) return {ok: false, code: 'no_changes', changed};
  const failures = [];
  for (const file of changed.filter(f => f.endsWith('.mjs') || f.endsWith('.js'))) {
    const r = spawnSync('node', ['--check', file], {cwd, encoding: 'utf8'});
    if (r.status !== 0) failures.push({file, code: r.status, tail: String(r.stderr || '').slice(-400)});
  }
  const tests = changed.filter(f => /^scripts\/tests\/.*\.test\.mjs$/.test(f));
  if (tests.length) {
    const r = spawnSync('node', ['--test', ...tests], {cwd, encoding: 'utf8', timeout: 600000});
    if (r.status !== 0) failures.push({file: tests.join(','), code: r.status, tail: String(r.stdout || '').slice(-800)});
  }
  return {ok: failures.length === 0, code: failures.length ? 'verify_failed' : 'verify_passed', changed, failures};
}

async function main() {
  const argv = process.argv.slice(2);
  const cwd = process.cwd();
  if (argv.includes('--verify-only')) {
    const r = verifyWorktree({cwd});
    console.log(JSON.stringify(r, null, 2));
    if (!r.ok) process.exitCode = 1;
    return;
  }
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  const issueNumber = process.env.AUTOLOOP_ISSUE;
  if (!token) throw new Error('relay_patch_token_missing');
  if (!issueNumber) throw new Error('relay_patch_issue_missing');

  const issue = await fetchIssue(token, issueNumber);
  const card = parseCard(issue.body || issue.title || '');
  if (card.paths.length === 0) throw new Error('relay_patch_paths_not_declared');
  const files = {};
  for (const rel of card.paths) {
    const abs = path.join(cwd, rel);
    files[rel] = fs.existsSync(abs) ? fs.readFileSync(abs, 'utf8') : '';
  }

  const promptFile = path.join(cwd, '.tmp-relay-patch-prompt.txt');
  fs.writeFileSync(promptFile, toPrompt({...card, files}), 'utf8');
  const call = spawnSync('node', ['scripts/relay-seat.mjs', '--call', '--purpose', 'code', '--profile', 'code', '--model', 'claude-sonnet-4-6', '--requested-agent', 'relay-claude', '--prompt-file', promptFile], {cwd, encoding: 'utf8', timeout: 600000});
  if (call.status !== 0) {
    console.log(JSON.stringify({ok: false, code: 'relay_call_failed', status: call.status, tail: String(call.stdout || '').slice(-1200)}, null, 2));
    process.exitCode = 1;
    return;
  }
  let callMeta = {};
  try { const parsed = JSON.parse(call.stdout); callMeta = {finish_reason: parsed.finish_reason ?? null, reply_chars: parsed.reply_chars ?? null, reply_preview: parsed.reply_preview ?? '', cost_usd: parsed.cost_usd ?? null}; } catch {}
  const payload = extractJson(call.stdout);
  const validation = validatePatch({declared: card.paths, files: payload?.files || []});
  if (!validation.ok) {
    console.log(JSON.stringify({ok: false, ...validation, paths: card.paths, relay: callMeta}, null, 2));
    process.exitCode = 1;
    return;
  }
  for (const f of validation.files) {
    const abs = path.join(cwd, f.path);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, f.content, 'utf8');
  }
  console.log(JSON.stringify({ok: true, written: validation.files.map(f => f.path)}, null, 2));
}

const invoked = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invoked === import.meta.url) {
  main().catch(e => { console.error(JSON.stringify({ok: false, error: String(e?.message || e)})); process.exitCode = 1; });
}
