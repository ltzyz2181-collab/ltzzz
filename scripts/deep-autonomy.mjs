// Deep 自主执行层（owner 2026-11-19 直接指令）。
//
// 目标：Deep 不再只是“文本分诊”。每日卡可以声明 autonomy.mode=auto，让 GitHub
// Actions 里的受信桥接层代它做四件事：
//   1) repo_read  —— 在 checkout 里读取目标文件，注入 prompt 后再交给模型；
//   2) code_change—— 模型输出带 <<<FILE:path>>> 块，桥上落盘、跑测试、开 PR 并合并；
//   3) deploy     —— 合并后自动 workflow_dispatch 指定部署工作流；
//   4) mail       —— 用模型输出或卡面正文，经既有 send-mail.py 发信并留回执。
//
// 边界（仍然保留，不扩大）：
//   - owner 2026-11-22 / GPT 2026-11-22 更正：只有五类给 GPT 决策席——资金动作、退款终态、
//     签名、私钥/助记词/根密钥、钱包操作。凭据配置与轮换属于普通工程；Secret 值仍不得
//     打印、提交或写入日志。其余工程动作（读仓库、改代码、工作流、部署、邮件、中转）不逐项裁决。
//   - 模型输出永远不会被当作可执行代码直接运行；只接受受限的整文件写入块。
//   - 所有动作都写公开回执；不落邮件正文、不落凭据、不落客户输入。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

export const AUTONOMY_REVISION = 'deep-autonomy-v1';
export const AUTONOMY_SCHEMA = 'ltzzz.deep-superagent.autonomy.v1';

// 触发后一律不自动执行的领域。只拦“钱与密钥”，不拦代码、部署、邮件。
export const FIDUCIARY_RE = /(?:私钥|助记词|助记码|根密钥|转账|放款|退款|签名|钱包|提现|付款|收款地址|five[_-]?signature|private[ _-]?key|seed[ _-]?phrase|mnemonic|wallet|withdraw|transfer\s+funds|refund|payment|\bsign(?:ing|ature)?s?\b|0x[0-9a-fA-F]{40})/i;

// 模型输出不得移除的五个保留家族。config/deep-autonomy-*.json 可由执行席通过 PR 修订，
// 但不能在自动写入里把保留家族改成普通工程；这条在 validateWrites 里按内容校验。
export const RESERVED_FAMILIES = Object.freeze(['funds', 'refund_terminal', 'signing', 'private_keys', 'wallet_operations']);

// 允许以点开头（.github/、.env），这样 deniedWritePath 能给出具体原因而不是笼统的 invalid_path。
const ID = /^[a-z0-9.][a-z0-9._/-]{0,200}$/i;
const WORKFLOW = /^[a-z0-9][a-z0-9-]{0,80}\.yml$/;
const EMAIL = /^[^\s@,]{1,160}@[^\s@,]{1,160}\.[A-Za-z]{2,}$/;
const MAIL_RECIPIENT_LIMIT = 8;
const allowlistSet = (value) => new Set((Array.isArray(value) ? value : String(value || '').split(','))
  .map((entry) => String(entry).trim().toLowerCase())
  .filter(Boolean));
// 收件人按小写去重，但保留第一次出现的原始大小写，收件人看到的口径不变。
const uniqueAddresses = (list) => {
  const seen = new Map();
  for (const addr of list) {
    const key = String(addr).toLowerCase();
    if (!seen.has(key)) seen.set(key, String(addr));
  }
  return [...seen.values()];
};
const WRITE_LIMIT_FILES = 6;
const WRITE_LIMIT_BYTES = 400 * 1024;
const REPO_READ_LIMIT_FILES = 8;
// 读入的证据会追加到发给 deep-superagent worker 的 prompt 末尾；worker 的真实上限是
// 请求体 32,768 字节、prompt 20,000 字符（workers/deep-superagent/index.js）。
// 曾经的 64KB 预算让 53KB 的 latest.json 也通过本地检查，POST 后才被 worker 拒绝
// （run 46096350431 → invalid_prompt），整张 OPS 卡不执行。这里按最紧的通道预算
// 截断，超额文件写 size_budget_exceeded 审计而不是让请求失败。
const REPO_READ_LIMIT_BYTES = 16 * 1024;
// 固定 16KB 只覆盖“证据本身”，没算卡面 prompt。Issue #640 的卡面已有 9,852 字符，
// 再加 13,726 字符证据 = 23,578 字符，POST 后 worker 拒绝（run 46097201873 →
// invalid_prompt）。证据预算必须按剩余空间计算；这两个软上限留出 JSON 信封与
// 文件分隔符的余量。
const PROMPT_SOFT_LIMIT_CHARS = 19000;
const PROMPT_SOFT_LIMIT_BYTES = 29 * 1024;
const CONTEXT_HEADER = '\n\n【仓库读取证据（由受信桥接层读取，不是模型自述）】\n';
const CONTEXT_TRUNCATED_MARKER = '\n…[bridge truncated evidence to fit prompt budget]';

export function repoContextBudget(prompt) {
  const text = typeof prompt === 'string' ? prompt : '';
  const chars = PROMPT_SOFT_LIMIT_CHARS - text.length - CONTEXT_HEADER.length - 1024;
  const bytes = PROMPT_SOFT_LIMIT_BYTES - Buffer.byteLength(text, 'utf8') - Buffer.byteLength(CONTEXT_HEADER, 'utf8') - 2048;
  return Math.max(0, Math.min(REPO_READ_LIMIT_BYTES, chars, bytes));
}

function fitContextText(text, prompt) {
  const charRoom = PROMPT_SOFT_LIMIT_CHARS - prompt.length;
  const byteRoom = PROMPT_SOFT_LIMIT_BYTES - Buffer.byteLength(prompt, 'utf8');
  if (charRoom <= 0 || byteRoom <= 0) return {text: '', truncated: true};
  if (text.length <= charRoom && Buffer.byteLength(text, 'utf8') <= byteRoom) return {text, truncated: false};
  const markerChars = charRoom - CONTEXT_TRUNCATED_MARKER.length;
  const markerBytes = byteRoom - Buffer.byteLength(CONTEXT_TRUNCATED_MARKER, 'utf8');
  if (markerChars <= 0 || markerBytes <= 0) return {text: '', truncated: true};
  let cut = Math.min(text.length, markerChars);
  let slice = text.slice(0, cut);
  while (slice && Buffer.byteLength(slice, 'utf8') > markerBytes) {
    cut = Math.floor(cut * 0.9);
    slice = text.slice(0, cut);
  }
  return {text: slice ? slice + CONTEXT_TRUNCATED_MARKER : '', truncated: true};
}
// GITHUB_TOKEN 创建的 PR 不会触发 pull_request 工作流（GitHub 抑制递归事件），
// 所以代码动作不能假设“PR 已开就有 CI”。桥接层显式 dispatch 一个独立验证工作流，
// 等它真实跑完且成功后才合并；没有 CI 或 CI 失败都保持未合并。
const CI_VERIFY_WORKFLOW = 'deep-autonomy-verify.yml';
const CI_TIMEOUT_MS = 8 * 60 * 1000;
const CI_INTERVAL_MS = 5000;
const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fail = (message) => {
  throw new Error(message);
};
const safePath = (value) => {
  if (typeof value !== 'string' || !ID.test(value)) return false;
  const normalized = path.posix.normalize(value.replaceAll('\\', '/'));
  if (normalized !== value || normalized === '.' || normalized === '..') return false;
  return !normalized.startsWith('../') && !normalized.startsWith('/') && !normalized.includes('/../');
};

// 禁止自动改写的路径：owner 授权来源、凭据文件、钱包/资金目录、通道脚本。
// 普通 workflow/config 由 owner 2026-11-22 授权放开；Secret 值仍受保护。
export function deniedWritePath(file) {
  const value = String(file || '').replaceAll('\\', '/');
  if (!safePath(value)) return 'invalid_path';
  if (value.startsWith('.git/') || value === '.git') return 'git_metadata';
  if (/^config\/owner-authority/.test(value)) return 'authority_config';
  if (/^(?:wallet|treasury|escrow|contracts)\//.test(value)) return 'funds_path';
  if (/(?:^|\/)(?:\.env|secrets?|credentials?)(?:$|\/|\.)/i.test(value)) return 'credential_path';
  // send-mail.py 是发信通道本身；run-mail-intake / deploy-receipt 是收信与部署回执工具。
  if (/^scripts\/(?:send-mail|run-mail-intake|deploy-receipt)\.(?:mjs|js|py)$/.test(value)) return 'protected_script';
  return null;
}

export function normalizeAutonomy(value, {allowedMailTo = null} = {}) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'object' || Array.isArray(value)) fail('invalid_autonomy');
  const allowedKeys = new Set(['mode', 'repo_read', 'code_change', 'deploy', 'mail']);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) fail('invalid_autonomy_field');
  if (value.mode !== 'auto') fail('invalid_autonomy_mode');
  const result = {mode: 'auto', repo_read: [], code_change: false, deploy: null, mail: null};

  if (value.repo_read !== undefined) {
    if (!Array.isArray(value.repo_read) || value.repo_read.length > REPO_READ_LIMIT_FILES) fail('invalid_repo_read');
    for (const file of value.repo_read) {
      if (!safePath(file)) fail('invalid_repo_read_path');
      if (deniedWritePath(file) === 'credential_path') fail('denied_repo_read_path');
      if (!result.repo_read.includes(file)) result.repo_read.push(file);
    }
  }

  if (value.code_change !== undefined) {
    if (typeof value.code_change !== 'boolean') fail('invalid_code_change');
    result.code_change = value.code_change;
  }

  if (value.deploy !== undefined) {
    const deploy = value.deploy;
    if (!deploy || typeof deploy !== 'object' || Array.isArray(deploy)) fail('invalid_deploy');
    if (Object.keys(deploy).some((key) => !['workflow'].includes(key))) fail('invalid_deploy_field');
    if (typeof deploy.workflow !== 'string' || !WORKFLOW.test(deploy.workflow)) fail('invalid_deploy_workflow');
    result.deploy = {workflow: deploy.workflow};
  }

  if (value.mail !== undefined) {
    const mail = value.mail;
    if (!mail || typeof mail !== 'object' || Array.isArray(mail)) fail('invalid_mail');
    if (Object.keys(mail).some((key) => !['to', 'subject', 'body', 'body_from_output'].includes(key))) fail('invalid_mail_field');
    if (!Array.isArray(mail.to) || mail.to.length < 1 || mail.to.length > MAIL_RECIPIENT_LIMIT) fail('invalid_mail_to');
    if (!mail.to.every((addr) => typeof addr === 'string' && EMAIL.test(addr))) fail('invalid_mail_to');
    const allow = allowlistSet(allowedMailTo);
    if (allow.size && !mail.to.every((addr) => allow.has(String(addr).toLowerCase()))) fail('mail_recipient_not_allowlisted');
    if (typeof mail.subject !== 'string' || !mail.subject.trim() || mail.subject.length > 180 || /[\r\n]/.test(mail.subject)) fail('invalid_mail_subject');
    const hasBody = typeof mail.body === 'string' && mail.body.trim();
    if (!hasBody && mail.body_from_output !== true) fail('invalid_mail_body');
    if (mail.body !== undefined && (typeof mail.body !== 'string' || mail.body.length > 20000)) fail('invalid_mail_body');
    if (mail.body_from_output !== undefined && typeof mail.body_from_output !== 'boolean') fail('invalid_mail_body_from_output');
    result.mail = {
      to: uniqueAddresses(mail.to),
      subject: mail.subject.trim(),
      body: hasBody ? mail.body : null,
      body_from_output: mail.body_from_output === true,
    };
  }

  return result;
}

export function stripAutonomy(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return body;
  const {autonomy, ...rest} = body;
  return rest;
}

export function taskAutonomyMetadata(body, options = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  return normalizeAutonomy(body.autonomy, options);
}

// 读取 repo_read 指定的文件。返回 {text, files, skipped}；任何越界/缺失文件只记录，
// 不阻断整张卡（模型可以看到缺少哪些证据）。
export function readRepoContext(root, files, options = {}) {
  const limitBytes = Number.isFinite(options.limitBytes) ? Math.max(0, options.limitBytes) : REPO_READ_LIMIT_BYTES;
  const parts = [];
  const evidence = [];
  let total = 0;
  for (const file of files || []) {
    const abs = path.join(root, file);
    let stat;
    try {
      stat = fs.statSync(abs);
    } catch {
      evidence.push({path: file, status: 'missing'});
      continue;
    }
    if (!stat.isFile()) {
      evidence.push({path: file, status: 'not_a_file'});
      continue;
    }
    if (total + stat.size > limitBytes) {
      evidence.push({path: file, status: 'size_budget_exceeded', bytes: stat.size});
      continue;
    }
    const raw = fs.readFileSync(abs);
    total += raw.length;
    const text = raw.toString('utf8');
    parts.push(`===== FILE: ${file} =====\n${text}\n===== END FILE: ${file} =====`);
    evidence.push({path: file, status: 'read', bytes: raw.length, sha256: createHash('sha256').update(raw).digest('hex')});
  }
  return {
    text: parts.length ? CONTEXT_HEADER + parts.join('\n\n') : '',
    files: evidence,
    limit_bytes: limitBytes,
    revision: AUTONOMY_REVISION,
  };
}

export function applyRepoContext(body, repoContext) {
  if (!repoContext?.text) return body;
  const prompt = typeof body?.prompt === 'string' ? body.prompt : '';
  const fitted = fitContextText(repoContext.text, prompt);
  repoContext.truncated = fitted.truncated;
  if (!fitted.text) return body;
  return {...body, prompt: `${prompt}${fitted.text}`};
}

// 仓库读取证据是“参考数据”，不是授权也不是执行指令。它由受信桥接层注入到 prompt 末尾，
// 因此资金域拦截只看卡面指令与模型输出；否则任何提到 payment/凭据 的设计文档都会误杀普通工程卡。
export const REPO_EVIDENCE_MARKER = '\n\n【仓库读取证据';
export function stripRepoEvidence(prompt = '') {
  const text = String(prompt || '');
  const at = text.indexOf(REPO_EVIDENCE_MARKER);
  return at < 0 ? text : text.slice(0, at);
}

export function fiduciaryHit({prompt = '', outputs = []} = {}) {
  const text = [prompt, ...outputs.map((output) => output?.text || '')].join('\n');
  const match = FIDUCIARY_RE.exec(text);
  return match ? {hit: true, token: match[0]} : {hit: false, token: null};
}

// Issue 卡的范围声明经常出现「No changes to ... wallets/signing/payment」这类排除句。
// 它们不是资金指令，按整行或分句剔除后再判断；有对比转折（但/but/however）时只剔除
// 否定分句，否定词不能遮住后半句的真实指令。只用于卡面指令；模型输出仍按原文严格扫描。
const NEGATION_LEAD_RE = /^\s*(?:[-*]\s*)?(?:no|not|never|without|excluding|except|neither|nor)\b|^\s*(?:[-*]\s*)?(?:不得|不要|不涉及|不修改|不改动|不改|禁止|无需|无须|不含|不包括|排除|不处理|不动)/i;
const CONTRAST_RE = /但|但是|然而|不过|\bbut\b|\bhowever\b|\byet\b/i;
const CLAUSE_SPLIT_RE = /[，,；;。]|\.\s+/;
// 分类/测试语境里的词不是执行指令（#640）：「“sign”不等于执行签名」「退款人工终判
// 不等于执行退款」「以 #645 作退款词负向样例」。只剔除确实没有执行对象的分句：
// 出现地址、金额或“转给/支付给”等对象时仍按指令扫描，否定词不能遮住真实动作。
const CLASSIFICATION_CLAUSE_RE = /不等于|不是|并非|不构成|不代表|负向样例|反例|测试样例|negative\s+sample/i;
const EXECUTION_TARGET_RE = /0x[0-9a-fA-F]{40}|\d+(?:\.\d+)?\s*(?:usdc|usdt|eth|btc|usd|元|美元|人民币)|转给|打给|支付给|发送给|转入|转至|提到|withdraw\s+to|send\s+to|transfer\s+to/i;
// 卡面里由本仓库生成器写入的分流数据行（- backlog_oldest=... / - backlog_by_seat=...）
// 是待核对的公开任务引用，不是执行指令。任务 ID/stage 可能包含 refund/wallet 等词，
// 但整行是 JSON 数据；模型输出仍按原文严格扫描，不受此豁免影响（OPS-3 误拦截）。
const TRUSTED_TRIAGE_LINE_RE = /^\s*-\s*(?:backlog_oldest|backlog_by_seat)\s*=/i;

export function fiduciaryInstructionHit(prompt = '') {
  const kept = [];
  for (const line of String(prompt || '').split('\n')) {
    if (TRUSTED_TRIAGE_LINE_RE.test(line)) continue;
    const startsNegated = NEGATION_LEAD_RE.test(line);
    if (startsNegated && !CONTRAST_RE.test(line)) continue;
    for (const clause of line.split(CLAUSE_SPLIT_RE)) {
      if (NEGATION_LEAD_RE.test(clause)) continue;
      if (CLASSIFICATION_CLAUSE_RE.test(clause) && !EXECUTION_TARGET_RE.test(clause)) continue;
      kept.push(clause);
    }
  }
  return fiduciaryHit({prompt: kept.join('\n')});
}

// 只接受显式文件块：
// <<<FILE:path>>>
// ...content...
// <<<END>>>
// 模型经常把同一个路径输出两遍（初稿+修订版）。2026-11-21 连续两次探针都因
// duplicate_file 整单被拒、白跑真实模型请求，故改为确定性“后写覆盖先写”，
// 并把被覆盖的次数记进 duplicates（非枚举，不参与 deepEqual 与写入）供回执审计。
// 最终内容仍要过 validateWrites（路径/大小/冲突）与 syntaxGate，闸门没有放松。
// 2026-11-26 run 45891879437（Issue #640）实测：模型把整份代码包在 ```javascript ...
// ``` 里再放进 FILE 块，syntaxGate 以 markdown_fence_in_code_file 整卡拒绝，白跑一次
// 真实模型请求。若整块内容就是单个围栏代码块，去掉首尾两行围栏是确定性的传输噪声，
// 不改变代码本身；围栏只出现在中间或非代码文件时仍按原文保留，闸门照常校验。
const FENCE_WRAPPED_FILE = /^\s*```[^\n]*\r?\n([\s\S]*?)\r?\n```\s*$/;
const unwrapWholeFileFence = (writePath, content) => {
  if (!CODE_EXT.test(writePath)) return content;
  const match = FENCE_WRAPPED_FILE.exec(content);
  return match ? match[1] : content;
};

export function extractFileWrites(text) {
  const source = String(text || '');
  const byPath = new Map();
  const order = [];
  const duplicates = [];
  const re = /<<<FILE:([^>\n]+)>>>\r?\n([\s\S]*?)\r?\n<<<END>>>/g;
  let match;
  while ((match = re.exec(source))) {
    const writePath = match[1].trim();
    const content = unwrapWholeFileFence(writePath, match[2]);
    if (byPath.has(writePath)) duplicates.push({path: writePath, identical: byPath.get(writePath) === content});
    else order.push(writePath);
    byPath.set(writePath, content);
  }
  const writes = order.map((writePath) => ({path: writePath, content: byPath.get(writePath)}));
  Object.defineProperty(writes, 'duplicates', {value: duplicates, enumerable: false});
  return writes;
}

export function validateWrites(writes) {
  if (!writes.length) return {ok: false, error: 'no_file_writes'};
  if (writes.length > WRITE_LIMIT_FILES) return {ok: false, error: 'too_many_files'};
  const seen = new Set();
  let total = 0;
  for (const write of writes) {
    const denied = deniedWritePath(write.path);
    if (denied) return {ok: false, error: `denied_path:${denied}:${write.path}`};
    if (/^config\/deep-autonomy-[^/]+\.json$/.test(write.path)) {
      let parsed;
      try { parsed = JSON.parse(write.content); } catch { return {ok: false, error: `reserved_family_unparseable:${write.path}`}; }
      const families = new Set((parsed?.still_requires_gpt_decision || []).map((entry) => entry && entry.family));
      for (const family of RESERVED_FAMILIES) {
        if (!families.has(family)) return {ok: false, error: `reserved_family_removed:${family}:${write.path}`};
      }
    }
    if (seen.has(write.path)) return {ok: false, error: `duplicate_file:${write.path}`};
    seen.add(write.path);
    const bytes = Buffer.byteLength(write.content, 'utf8');
    if (bytes > WRITE_LIMIT_BYTES) return {ok: false, error: `file_too_large:${write.path}`};
    total += bytes;
  }
  if (total > WRITE_LIMIT_BYTES) return {ok: false, error: 'total_size_exceeded'};
  return {ok: true, writes};
}

// 2026-11-20 实测：Deep 把带 markdown 围栏的代码整块写进 .js，文件在 type=module 下
// 既不是合法 JS 也用 require，仍被自动合并（PR #501）。合并前必须做本地语法闸。
export const CODE_EXT = /\.(?:m?js|cjs)$/i;
export function syntaxGate(root, writes, {check = null} = {}) {
  for (const write of writes || []) {
    if (!CODE_EXT.test(write.path)) continue;
    if (/^\s*```/.test(write.content)) return {ok: false, error: 'markdown_fence_in_code_file:' + write.path};
    try {
      if (check) check(write.path);
      else execFileSync(process.execPath, ['--check', path.join(root, write.path)], {stdio: 'pipe'});
    } catch {
      return {ok: false, error: 'syntax_error:' + write.path};
    }
  }
  return {ok: true};
}

const defaultRunTests = (root) =>
  execFileSync('node', [
    '--test',
    'scripts/tests/check-card-contract.test.mjs',
    'scripts/tests/dispatch-seat-policy.test.mjs',
    'scripts/tests/dispatch-daily-card.test.mjs',
    'scripts/tests/deep-superagent-queue.test.mjs',
    'scripts/tests/deep-superagent-autonomy.test.mjs',
  ], {cwd: root, encoding: 'utf8', timeout: 240000});

async function githubApi(fetcher, token, repository, route, method = 'GET', body) {
  const response = await fetcher(`https://api.github.com/repos/${repository}${route}`, {
    method,
    headers: {
      authorization: `Bearer ${token}`,
      accept: 'application/vnd.github+json',
      'content-type': 'application/json',
      'user-agent': 'ltzzz-deep-autonomy',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`github_${method.toLowerCase()}_${response.status}:${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
}

async function receiptExists(fetcher, token, repository, receiptPath) {
  const response = await fetcher(`https://api.github.com/repos/${repository}/contents/${receiptPath}?ref=main`, {
    headers: {authorization: `Bearer ${token}`, accept: 'application/vnd.github+json'},
  });
  return response.status === 200;
}

function git(root, args, options = {}) {
  return execFileSync('git', args, {cwd: root, encoding: 'utf8', ...options});
}

// 显式 dispatch 验证工作流，并等到该分支上的这次 run 真正完成。
// 返回 ok=false 时调用方不得合并；status 直接写进公开回执。
async function waitForCi({
  fetcher,
  token,
  repository,
  branch,
  clock = Date.now,
  sleep = defaultSleep,
  timeoutMs = CI_TIMEOUT_MS,
  intervalMs = CI_INTERVAL_MS,
}) {
  let dispatchError = null;
  try {
    await githubApi(fetcher, token, repository, `/actions/workflows/${CI_VERIFY_WORKFLOW}/dispatches`, 'POST', {ref: branch});
  } catch (error) {
    dispatchError = String(error?.message || error).slice(0, 200);
  }
  if (dispatchError) return {ok: false, status: 'ci_dispatch_failed', error: dispatchError};

  const deadline = clock() + timeoutMs;
  let lastRun = null;
  while (clock() < deadline) {
    let runs = [];
    try {
      const data = await githubApi(fetcher, token, repository, `/actions/workflows/${CI_VERIFY_WORKFLOW}/runs?branch=${encodeURIComponent(branch)}&event=workflow_dispatch&per_page=10`);
      runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    } catch (error) {
      return {ok: false, status: 'ci_lookup_failed', error: String(error?.message || error).slice(0, 200)};
    }
    lastRun = runs.find((run) => run.head_branch === branch) || null;
    if (lastRun && lastRun.status === 'completed') {
      const passed = lastRun.conclusion === 'success';
      return {
        ok: passed,
        status: passed ? 'ci_passed' : 'ci_failed',
        run_id: lastRun.id,
        conclusion: lastRun.conclusion,
        html_url: lastRun.html_url || null,
      };
    }
    await sleep(intervalMs);
  }
  return {
    ok: false,
    status: 'ci_timeout',
    run_id: lastRun?.id || null,
    html_url: lastRun?.html_url || null,
    error: 'ci_timeout',
  };
}

// 合并提交由 GITHUB_TOKEN 产生时，GitHub 会抑制 push 触发的下游工作流；
// 用 PAT（LTZZZ_AGENT_TOKEN）合并才会像人工合并一样触发 main 上的 CI/部署。
// 合并后回读该 SHA 上的 run，作为“是否真的触发”的公开证据，不靠假设。
export async function readPostMergeRuns({fetcher, token, repository, sha, attempts = 12, intervalMs = 3000, fallbackPerPage = 100, sleep = defaultSleep}) {
  // 2026-11-21 #572/#575 两次实测：PAT 合并后下游 push 工作流确实触发，但
  // /actions/runs?head_sha= 的过滤索引在最初几秒内可能尚未建立，回执曾两次误记
  // count=0（#575：merge 08:42:07，push run created_at 08:42:10，4 次轮询仍读 0）。
  // 因此改为两段式有界轮询：先按 head_sha 精确查询；查不到时回退到最近运行列表
  // 并在本地按 head_sha 过滤，避免把索引延迟当成“没有触发”。看到 run 立即返回。
  let runs = [];
  let tried = 0;
  let usedFallback = false;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const data = await githubApi(fetcher, token, repository, `/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=20`);
    runs = Array.isArray(data?.workflow_runs) ? data.workflow_runs : [];
    if (!runs.length) {
      const recent = await githubApi(fetcher, token, repository, `/actions/runs?per_page=${fallbackPerPage}`);
      const all = Array.isArray(recent?.workflow_runs) ? recent.workflow_runs : [];
      runs = all.filter((run) => run.head_sha === sha);
      if (runs.length) usedFallback = true;
    }
    tried = attempt + 1;
    if (runs.length || attempt === attempts - 1) break;
    await sleep(intervalMs);
  }
  return {
    count: runs.length,
    attempts: tried,
    used_fallback_list: usedFallback,
    runs: runs.slice(0, 20).map((run) => ({
      id: run.id,
      name: run.name,
      event: run.event,
      status: run.status,
      conclusion: run.conclusion || null,
    })),
  };
}

export async function executeAutonomy({
  autonomy,
  job,
  outputs = [],
  root = process.cwd(),
  env = process.env,
  fetcher = fetch,
  runTests = defaultRunTests,
  clock = Date.now,
  sleep = defaultSleep,
  ciTimeoutMs = CI_TIMEOUT_MS,
  ciIntervalMs = CI_INTERVAL_MS,
} = {}) {
  if (!autonomy || autonomy.mode !== 'auto') return {status: 'not_requested', revision: AUTONOMY_REVISION};
  // 只扫卡面指令与模型输出；注入的仓库读取证据按数据处理。
  // 卡面指令先剔除范围排除句（不是资金指令），模型输出保持原样严格扫描。
  const promptHit = fiduciaryInstructionHit(stripRepoEvidence(job?.prompt));
  const outputHit = fiduciaryHit({outputs});
  const fiduciary = promptHit.hit ? promptHit : outputHit;
  if (fiduciary.hit) {
    return {status: 'blocked_fiduciary', revision: AUTONOMY_REVISION, token: fiduciary.token, actions: [], needs_gpt_decision: true};
  }

  const token = env.GITHUB_TOKEN;
  // 合并必须用不会抑制 push 事件的令牌；缺 PAT 时退回 GITHUB_TOKEN，并在回执里写明。
  const pushToken = env.LTZZZ_AGENT_TOKEN || token;
  const merge_token_kind = env.LTZZZ_AGENT_TOKEN ? 'agent_token' : 'github_token';
  const repository = env.GITHUB_REPOSITORY;
  const runId = env.GITHUB_RUN_ID || 'local';
  const taskId = job?.task_id || 'DEEP-UNKNOWN';
  const inputSha = job?.input_sha256 || '0'.repeat(64);
  const receiptPath = `knowledge/results/deep-superagent/autonomy/${taskId}-${inputSha}.json`;
  const actions = [];
  const receipt = {
    schema: AUTONOMY_SCHEMA,
    revision: AUTONOMY_REVISION,
    status: 'started',
    task_id: taskId,
    input_sha256: inputSha,
    run_id: runId,
    at_utc: new Date(clock()).toISOString(),
    actions,
    financial_execution: false,
    secrets_included: false,
  };

  // 幂等：同一 task + 同一输入只执行一次；重跑只回读已有回执。
  if (token && repository) {
    try {
      if (await receiptExists(fetcher, token, repository, receiptPath)) {
        return {status: 'already_executed', revision: AUTONOMY_REVISION, receipt_path: receiptPath, actions: [], needs_gpt_decision: false};
      }
    } catch {
      /* 读不到就继续；真正写回执失败会在下面暴露。 */
    }
  }

  try {
    // 1) code_change
    let startRef = null;
    if (autonomy.code_change) {
      try {
        startRef = git(root, ['rev-parse', 'HEAD']).trim();
      } catch {
        startRef = null;
      }
      const writes = extractFileWrites(outputs.map((output) => output?.text || '').join('\n\n'));
      const duplicateBlocks = writes.duplicates?.length ? writes.duplicates : null;
      const valid = validateWrites(writes);
      if (!valid.ok) {
        actions.push({action: 'code_change', status: 'rejected', error: valid.error});
      } else {
        const branch = `deep-auto/${String(taskId).toLowerCase().replace(/[^a-z0-9/-]/g, '-')}-${runId}`.slice(0, 120);
        const originals = new Map();
        let testResult = null;
        try {
          for (const write of writes) {
            const abs = path.join(root, write.path);
            if (fs.existsSync(abs)) originals.set(write.path, fs.readFileSync(abs));
            fs.mkdirSync(path.dirname(abs), {recursive: true});
            fs.writeFileSync(abs, write.content);
          }
          const syntax = syntaxGate(root, writes);
          if (!syntax.ok) throw new Error(syntax.error);
          testResult = runTests(root);
          if (!token || !repository) throw new Error('github_token_missing');
          git(root, ['config', 'user.name', 'ltzzz-deep-autonomy']);
          git(root, ['config', 'user.email', 'bot@ltzzz.com']);
          git(root, ['checkout', '-B', branch]);
          git(root, ['add', '--', ...writes.map((write) => write.path)]);
          git(root, ['commit', '-m', `deep(auto): ${taskId} ${runId}`]);
          git(root, ['push', 'origin', `HEAD:refs/heads/${branch}`]);
          const pr = await githubApi(fetcher, token, repository, '/pulls', 'POST', {
            title: `deep(auto): ${taskId}`,
            head: branch,
            base: 'main',
            body: `自动执行回执：任务 ${taskId}，运行 ${runId}。独立验证工作流通过后才由 Deep 自动合并。`,
          });
          const ci = await waitForCi({fetcher, token, repository, branch, clock, sleep, timeoutMs: ciTimeoutMs, intervalMs: ciIntervalMs});
          if (!ci.ok) {
            actions.push({
              action: 'code_change',
              status: ci.status,
              branch,
              pr: pr.number,
              files: writes.map((write) => write.path),
              duplicate_blocks: duplicateBlocks,
              ci,
            });
          } else {
            const merge = await githubApi(fetcher, pushToken, repository, `/pulls/${pr.number}/merge`, 'PUT', {merge_method: 'squash'});
            const action = {
              action: 'code_change',
              status: merge.merged ? 'merged' : 'merge_pending',
              branch,
              pr: pr.number,
              merge_sha: merge.sha || null,
              merge_token_kind,
              files: writes.map((write) => write.path),
              duplicate_blocks: duplicateBlocks,
              ci,
            };
            if (merge.merged && merge.sha) {
              try {
                action.post_merge_runs = await readPostMergeRuns({fetcher, token, repository, sha: merge.sha, sleep});
                action.post_merge_runs_triggered = action.post_merge_runs.count > 0;
              } catch (error) {
                action.post_merge_runs = {count: null, error: String(error?.message || error).slice(0, 160)};
                action.post_merge_runs_triggered = null;
              }
            }
            actions.push(action);
          }
        } catch (error) {
          for (const [file, content] of originals) {
            try {
              fs.writeFileSync(path.join(root, file), content);
            } catch {
              /* 恢复失败时保留原文件；回执写明。 */
            }
          }
          actions.push({action: 'code_change', status: 'failed', error: String(error?.message || error).slice(0, 200), test_ok: Boolean(testResult)});
        }
      }
    }

    // 代码动作会把本地切到模型分支；无论成败都回到 main（已合并）或起始提交，
    // 这样后面的部署和工作流回执提交仍落在 main 上，而不是模型分支。
    if (startRef) {
      try {
        const codeAction = actions.find((action) => action.action === 'code_change');
        if (codeAction?.status === 'merged') {
          // Actions 里可能是 detached HEAD（push 触发时 checkout 的是 SHA），
          // 用 fetch + checkout -B 而不是假设本地已有 main 分支。
          git(root, ['fetch', 'origin', 'main']);
          git(root, ['checkout', '-B', 'main', 'origin/main']);
        } else {
          git(root, ['checkout', '--detach', startRef]);
        }
      } catch {
        /* 回执会记录实际发生的动作；这里不掩盖上面的结果。 */
      }
    }

    // 2) deploy：只允许显式声明的部署工作流。
    // 当天没有需要改的文件（no_file_writes）时按“无改动”处理：部署只是把 main 上
    // 已合并的版本重新发布一次，不是绕过验证；真正失败/未过 CI 的代码动作仍然跳过。
    if (autonomy.deploy) {
      const codeAction = actions.find((action) => action.action === 'code_change');
      const noChangeNeeded = codeAction?.status === 'rejected' && codeAction?.error === 'no_file_writes';
      if (codeAction && codeAction.status !== 'merged' && !noChangeNeeded) {
        actions.push({action: 'deploy', status: 'skipped', error: 'code_change_not_merged'});
      } else if (!token || !repository) {
        actions.push({action: 'deploy', status: 'failed', error: 'github_token_missing'});
      } else {
        try {
          await githubApi(fetcher, token, repository, `/actions/workflows/${autonomy.deploy.workflow}/dispatches`, 'POST', {ref: 'main'});
          actions.push({action: 'deploy', status: 'dispatched', workflow: autonomy.deploy.workflow});
        } catch (error) {
          actions.push({action: 'deploy', status: 'failed', workflow: autonomy.deploy.workflow, error: String(error?.message || error).slice(0, 200)});
        }
      }
    }

    // 3) mail
    if (autonomy.mail) {
      const mailAction = {action: 'mail', status: 'skipped', to_count: autonomy.mail.to.length, recipient_domains: [...new Set(autonomy.mail.to.map((addr) => addr.split('@')[1]))]};
      actions.push(mailAction);
      const body = autonomy.mail.body || outputs.map((output) => output?.text || '').join('\n\n');
      if (!body.trim()) {
        mailAction.status = 'failed';
        mailAction.error = 'empty_mail_body';
      } else if (!env.MAIL_SMTP_USER || !(env.MAIL_SMTP_AUTH_CODE || env.MAIL_SMTP_PASSWORD)) {
        mailAction.status = 'failed';
        mailAction.error = 'mail_credentials_missing';
      } else {
        const tmp = fs.mkdtempSync(path.join(env.RUNNER_TEMP || '/tmp', 'deep-mail-'));
        const bodyFile = path.join(tmp, 'body.txt');
        const metaFile = path.join(tmp, 'meta.json');
        fs.writeFileSync(bodyFile, body);
        fs.writeFileSync(metaFile, JSON.stringify({
          schema: 'ltzzz.deep-superagent.email-meta.v1',
          date: new Date(clock()).toISOString().slice(0, 10),
          subject: autonomy.mail.subject,
          body_file: bodyFile,
          contains_mail_body: false,
          counts: {autonomy_revision: AUTONOMY_REVISION},
        }, null, 2));
        const sendReceipt = `knowledge/results/deep-superagent/autonomy/mail-${taskId}-${runId}.json`;
        try {
          execFileSync('python3', ['scripts/send-mail.py', '--meta', metaFile, '--receipt', sendReceipt], {
            cwd: root,
            env: {...env, AUTOLOOP_MAIL_TO: autonomy.mail.to.join(',')},
            encoding: 'utf8',
            timeout: 120000,
          });
          mailAction.status = 'sent';
          mailAction.receipt = sendReceipt;
        } catch (error) {
          mailAction.status = 'failed';
          mailAction.error = String(error?.message || error).slice(0, 200);
        }
      }
    }

    receipt.status = actions.every((action) => ['merged', 'dispatched', 'sent', 'skipped_blocked'].includes(action.status)) ? 'executed' : 'partial';
    if (!actions.length) receipt.status = 'no_actions';
    receipt.completed_at_utc = new Date(clock()).toISOString();
  } catch (error) {
    receipt.status = 'failed';
    receipt.error = String(error?.message || error).slice(0, 200);
  }

  // 回执只落公开事实，不落正文、不落收件人完整地址。
  try {
    const abs = path.join(root, receiptPath);
    fs.mkdirSync(path.dirname(abs), {recursive: true});
    fs.writeFileSync(abs, JSON.stringify(receipt, null, 1) + '\n');
  } catch {
    receipt.receipt_write_error = true;
  }
  return {...receipt, receipt_path: receiptPath, needs_gpt_decision: false};
}
