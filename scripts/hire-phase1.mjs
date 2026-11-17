#!/usr/bin/env node
// LTZZZ AI-hires-AI Phase1 v1.1 — in-repo closed loop only, security hardened.
//
// Security boundaries:
// - an order can only be accepted by an `order_acceptance` gate; the harness
//   self-check gate can never accept an order;
// - acceptance criteria are declarative and are evaluated by the gate against
//   the real deliverable bytes, not against markers in source files;
// - the gate runs from a fixed allowlisted script, receives the order on stdin
//   (never as a command or argument) and must return a machine-readable result
//   that the harness re-binds to the evidence it hashed itself;
// - evidence paths are normalized, restricted to repo directories, must exist,
//   and their SHA-256 is recorded in the receipt;
// - receipts are canonical JSON with receipt_sha256 and order_sha256; appends
//   are locked, fully written or rolled back, idempotent; accepted is terminal;
// - the CLI ledger path is confined to `knowledge/results/hire/`;
// - no money, no credentials, no production writes.
import {createHash, randomBytes} from 'node:crypto';
import {
  closeSync,
  existsSync,
  fstatSync,
  fsyncSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  realpathSync,
  statSync,
  unlinkSync,
  writeSync,
} from 'node:fs';
import {dirname, isAbsolute, posix, relative, resolve, sep} from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath, pathToFileURL} from 'node:url';

export const REPO_ROOT = fileURLToPath(new URL('../', import.meta.url));
export const PHASE1_REVISION = 'hire-phase1-v1.1';
// v0 wrote `ledger.jsonl` with a different schema (no idempotency key / evidence
// metadata), so it stays frozen as historical evidence. v1 writes here.
export const DEFAULT_LEDGER_PATH = 'knowledge/results/hire/ledger-v1.jsonl';

// The CLI may only ever write inside this directory. Absolute paths, `..`,
// backslashes and symlinks are rejected by resolveLedgerPath().
export const LEDGER_DIR = 'knowledge/results/hire';
export const LEDGER_PATH_PATTERN = /^knowledge\/results\/hire\/[A-Za-z0-9._-]+\.jsonl$/;

export const ORDER_KEYS = Object.freeze([
  'order_id',
  'idempotency_key',
  'role',
  'objective',
  'acceptance_gate',
  'acceptance_criteria',
  'evidence_paths',
  'rollback',
  'salary',
  'seat',
]);
export const REQUIRED = Object.freeze([
  'order_id',
  'idempotency_key',
  'role',
  'objective',
  'acceptance_gate',
  'acceptance_criteria',
  'evidence_paths',
  'rollback',
  'seat',
]);

// Gate identity is explicit: a harness self-check proves the harness behaves,
// it never proves that an order's deliverable exists. Only `order_acceptance`
// gates may accept an order.
export const GATE_KINDS = Object.freeze(['harness_self_check', 'order_acceptance']);

// Explicit gate allowlist. Each gate is a fixed repository script; no order
// field can inject arguments or code. `node -e` and arbitrary node commands
// are therefore impossible. The order JSON is handed over on stdin.
export const ACCEPTANCE_GATE_ALLOWLIST = Object.freeze({
  'phase1-smoke': Object.freeze({
    kind: 'harness_self_check',
    script: 'scripts/hire/gates/phase1-smoke.mjs',
    args: Object.freeze([]),
    description: 'deterministic behavioural self-check of the Phase1 harness',
  }),
  'deliverable-audit': Object.freeze({
    kind: 'order_acceptance',
    script: 'scripts/hire/gates/deliverable-audit.mjs',
    args: Object.freeze([]),
    description: 'evaluates the declared acceptance criteria against the real deliverable bytes',
  }),
});

// Declarative acceptance criteria. Every criterion names one of the order's
// evidence files; at least one criterion must inspect content, so a non-empty
// but meaningless file cannot be accepted.
export const CRITERION_KINDS = Object.freeze({
  file_min_bytes: Object.freeze({required: ['id', 'kind', 'path', 'min_bytes'], content: false}),
  no_placeholder: Object.freeze({required: ['id', 'kind', 'path'], content: true}),
  markdown_headings: Object.freeze({required: ['id', 'kind', 'path', 'min_count'], optional: ['headings'], content: true}),
  contains_all: Object.freeze({required: ['id', 'kind', 'path', 'needles'], content: true}),
  json_keys: Object.freeze({required: ['id', 'kind', 'path', 'keys'], content: true}),
  sha256: Object.freeze({required: ['id', 'kind', 'path', 'sha256'], content: true}),
});

// A model seat may never accept an order that touches money, signing,
// credentials or a production write. Both English and Chinese are matched,
// including multi-word phrases: a single-token keyword list would miss
// "transfer money" or "deploy to production".
export const FORBIDDEN_INTENT_RULES = Object.freeze([
  // --- English phrases (separators may be spaces, underscores or hyphens) ---
  {id: 'transfer_money', re: /\btransfer(?:s|ring|red)?[\s_-]+(?:the[\s_-]+|all[\s_-]+|some[\s_-]+)?(?:money|funds?|cash|balance|usd|usdt|usdc|eth|btc|cny|rmb)\b/},
  {id: 'withdraw_funds', re: /\bwithdraw(?:s|ing|al|als)?[\s_-]+(?:the[\s_-]+|all[\s_-]+|some[\s_-]+)?(?:funds?|money|cash|balance|usdt|usdc|eth)\b/},
  {id: 'send_payment', re: /\b(?:send|sends|sending|sent|remit|remits|remitting)[\s_-]+(?:a[\s_-]+|the[\s_-]+|out[\s_-]+)?(?:payment|payments|money|funds?|remittance)\b/},
  {id: 'sign_transaction', re: /\b(?:sign|signs|signing|signed)[\s_-]+(?:a[\s_-]+|the[\s_-]+|any[\s_-]+)?(?:transaction|transactions|tx|txs|payload|message|message[\s_-]+hash|order|orders|contract[\s_-]+call)\b/},
  {id: 'deploy_to_production', re: /\bdeploy(?:s|ing|ment)?[\s_-]+(?:to[\s_-]+|into[\s_-]+|in[\s_-]+)?(?:production|prod|mainnet)\b/},
  {id: 'modify_production_config', re: /\b(?:modify|modifies|modifying|change|changes|changing|update|updates|updating|edit|edits|editing|write|writes|writing|patch|patches|patching|rotate|rotating)[\s_-]+(?:the[\s_-]+|a[\s_-]+)?(?:production|prod)[\s_-]+(?:configuration|config|configs|settings?|secrets?|environment|env|credentials?)\b/},
  {id: 'production_write', re: /\bproduction[\s_-]?(?:write|writes|writing|mutation|deploy|deployment)\b/},
  {id: 'private_key', re: /\bprivate[\s_-]?keys?\b/},
  {id: 'seed_phrase', re: /\b(?:seed|mnemonic)[\s_-]?(?:phrase|words)\b/},
  {id: 'api_secret', re: /\b(?:api[\s_-]?secrets?|client[\s_-]?secrets?|access[\s_-]?tokens?|refresh[\s_-]?tokens?)\b/},
  // --- English single tokens that are unambiguous on their own ---
  {id: 'funding', re: /\bfunding\b/},
  {id: 'disbursement', re: /\bdisbursements?\b/},
  {id: 'wallet', re: /\bwallets?\b/},
  {id: 'safe_wallet', re: /\bsafe[\s_-]?(?:wallet|multisig|module|transaction)\b/},
  {id: 'loan', re: /\b(?:loan|loans|lending|borrow|borrowing)\b/},
  {id: 'credential', re: /\bcredentials?\b/},
  // --- Chinese phrases and tokens ---
  {id: 'zh_transfer', re: /(转账|转出|汇款|打款|放款|提现|付款|支付|收款)/},
  {id: 'zh_wallet', re: /(钱包|私钥|助记词|密钥|凭据|口令|签名|签署|授权签名)/},
  {id: 'zh_funds', re: /(资金|余额|保证金|铸币|增发|销毁代币)/},
  {id: 'zh_prod', re: /(生产部署|部署到生产|生产环境|生产配置|线上配置|修改生产|发布到生产|合约部署)/},
]);

// Kept for backwards compatibility: callers that only need the raw token list.
export const FORBIDDEN_INTENT = Object.freeze([
  ...new Set(FORBIDDEN_INTENT_RULES.flatMap(rule => [rule.id])),
]);

export const RECEIPT_STATES = new Set(['accepted', 'refused', 'needs_owner_decision']);

// Evidence may only come from these repository roots. Paths are repo-relative
// POSIX paths; absolute paths, traversal and symlinks are rejected.
export const EVIDENCE_ALLOWED_ROOTS = Object.freeze([
  'docs',
  'knowledge/results/hire',
]);

const ORDER_ID = /^[A-Za-z0-9._-]{6,120}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const CRITERION_ID = /^[A-Za-z0-9._-]{2,64}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_EVIDENCE_PATHS = 20;
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MAX_ACCEPTANCE_CRITERIA = 12;
const MAX_PATH_LENGTH = 512;
const SAFE_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR'];
const GATE_SCHEMA = 'ltzzz.hire-gate.v1';

const sha256Text = (text) => createHash('sha256').update(String(text), 'utf8').digest('hex');
const sha256Bytes = (bytes) => createHash('sha256').update(bytes).digest('hex');

function fail(code, detail) {
  const error = new Error(detail ? `${code}:${detail}` : code);
  error.code = code;
  throw error;
}

export function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

// Stable canonical JSON. Hashes must not depend on object property order.
export function canonicalJson(value) {
  if (value === null) return 'null';
  const type = typeof value;
  if (type === 'string' || type === 'boolean') return JSON.stringify(value);
  if (type === 'number') {
    if (!Number.isFinite(value)) fail('invalid_json_number');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(item => item === undefined ? 'null' : canonicalJson(item)).join(',')}]`;
  }
  if (type === 'object') {
    if (!isPlainObject(value)) fail('invalid_json_object');
    const keys = Object.keys(value).filter(key => value[key] !== undefined).sort();
    return `{${keys.map(key => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  }
  fail('invalid_json_type', type);
}

export function hashObject(value) {
  return sha256Text(canonicalJson(value));
}

// ---------- evidence ----------

export function normalizeEvidencePaths(value) {
  if (value === undefined || value === null || value === '') {
    return {ok: false, paths: [], problems: ['missing_or_empty:evidence_paths']};
  }
  if (!Array.isArray(value) && typeof value !== 'string') {
    return {ok: false, paths: [], problems: ['invalid_evidence_paths']};
  }
  const problems = [];
  const list = Array.isArray(value) ? value : [value];
  if (list.length === 0) {
    return {ok: false, paths: [], problems: ['missing_or_empty:evidence_paths']};
  }
  if (list.length > MAX_EVIDENCE_PATHS) {
    problems.push('invalid_evidence_paths_count');
  }
  const paths = [];
  for (const item of list) {
    if (typeof item !== 'string') {
      problems.push('invalid_evidence_paths');
      continue;
    }
    const raw = item.trim().replace(/\/+$/, '');
    if (!raw || raw.length > MAX_PATH_LENGTH) {
      problems.push(`invalid_evidence_path:${raw || '(empty)'}`);
      continue;
    }
    if (isAbsolute(raw) || raw.includes('\0') || raw.includes('\\')) {
      problems.push(`invalid_evidence_path:${raw}`);
      continue;
    }
    const normalized = posix.normalize(raw);
    if (normalized === '.' || normalized.startsWith('../') || normalized.includes('/../')) {
      problems.push(`evidence_path_traversal:${raw}`);
      continue;
    }
    paths.push(normalized);
  }
  if (new Set(paths).size !== paths.length) problems.push('duplicate_evidence_path');
  return {ok: problems.length === 0, paths, problems: [...new Set(problems)]};
}

export function isWithinAllowedRoot(repoRelativePath) {
  return EVIDENCE_ALLOWED_ROOTS.some(root => (
    repoRelativePath === root || repoRelativePath.startsWith(`${root}/`)
  ));
}

export function validateEvidence(order, {root = REPO_ROOT} = {}) {
  const normalized = normalizeEvidencePaths(order?.evidence_paths);
  const problems = [...normalized.problems];
  if (!normalized.ok) return {ok: false, problems, evidence: [], paths: normalized.paths};

  let rootReal;
  try {
    rootReal = realpathSync(root);
    if (!statSync(rootReal).isDirectory()) throw new Error('not_a_directory');
  } catch {
    return {ok: false, problems: ['invalid_evidence_root'], evidence: [], paths: normalized.paths};
  }

  const evidence = [];
  for (const repoPath of normalized.paths) {
    if (!isWithinAllowedRoot(repoPath)) {
      problems.push(`evidence_path_not_allowed:${repoPath}`);
      continue;
    }
    const absolute = resolve(rootReal, repoPath);
    const rootRelative = relative(rootReal, absolute);
    if (rootRelative.startsWith(`..${sep}`) || rootRelative === '..' || isAbsolute(rootRelative)) {
      problems.push(`evidence_path_escape:${repoPath}`);
      continue;
    }
    let lstat;
    try {
      lstat = lstatSync(absolute);
    } catch {
      problems.push(`missing_evidence_file:${repoPath}`);
      continue;
    }
    if (lstat.isSymbolicLink()) {
      problems.push(`symlink_evidence_forbidden:${repoPath}`);
      continue;
    }
    if (!lstat.isFile()) {
      problems.push(`evidence_not_regular_file:${repoPath}`);
      continue;
    }
    if (lstat.size > MAX_EVIDENCE_BYTES) {
      problems.push(`evidence_too_large:${repoPath}`);
      continue;
    }
    let real;
    try {
      real = realpathSync(absolute);
    } catch {
      problems.push(`evidence_unreadable:${repoPath}`);
      continue;
    }
    const realRelative = relative(rootReal, real).split(sep).join('/');
    if (realRelative.startsWith('..') || isAbsolute(realRelative) || !isWithinAllowedRoot(realRelative)) {
      problems.push(`evidence_realpath_outside_allowed_root:${repoPath}`);
      continue;
    }
    let bytes;
    try {
      bytes = readFileSync(real);
    } catch {
      problems.push(`evidence_unreadable:${repoPath}`);
      continue;
    }
    if (bytes.length > MAX_EVIDENCE_BYTES) {
      problems.push(`evidence_too_large:${repoPath}`);
      continue;
    }
    evidence.push({path: repoPath, sha256: sha256Bytes(bytes), bytes: bytes.length});
  }

  return {
    ok: problems.length === 0,
    problems: [...new Set(problems)],
    evidence,
    paths: normalized.paths,
  };
}

// ---------- acceptance criteria ----------

export function validateAcceptanceCriteria(criteria, evidencePaths = []) {
  if (criteria === undefined || criteria === null) {
    return ['missing_or_empty:acceptance_criteria'];
  }
  if (!Array.isArray(criteria) || criteria.length === 0) {
    return ['missing_or_empty:acceptance_criteria'];
  }
  const problems = [];
  if (criteria.length > MAX_ACCEPTANCE_CRITERIA) problems.push('invalid_acceptance_criteria_count');
  const allowedPaths = new Set(Array.isArray(evidencePaths) ? evidencePaths : []);
  const ids = new Set();
  let hasContentCheck = false;

  for (const criterion of criteria) {
    if (!isPlainObject(criterion)) {
      problems.push('invalid_acceptance_criterion');
      continue;
    }
    const spec = CRITERION_KINDS[criterion.kind];
    if (!spec) {
      problems.push(`unknown_criterion_kind:${String(criterion.kind)}`);
      continue;
    }
    const allowedKeys = new Set([...spec.required, ...(spec.optional || [])]);
    for (const key of Object.keys(criterion)) {
      if (!allowedKeys.has(key)) problems.push(`unknown_criterion_field:${criterion.kind}.${key}`);
    }
    for (const key of spec.required) {
      if (criterion[key] === undefined || criterion[key] === null || criterion[key] === '') {
        problems.push(`missing_criterion_field:${criterion.kind}.${key}`);
      }
    }
    if (typeof criterion.id !== 'string' || !CRITERION_ID.test(criterion.id)) {
      problems.push(`invalid_criterion_id:${String(criterion.id)}`);
    } else if (ids.has(criterion.id)) {
      problems.push(`duplicate_criterion_id:${criterion.id}`);
    } else {
      ids.add(criterion.id);
    }
    if (typeof criterion.path !== 'string' || !allowedPaths.has(criterion.path)) {
      problems.push(`criterion_path_not_in_evidence_paths:${String(criterion.path)}`);
    }
    if (spec.content) hasContentCheck = true;

    switch (criterion.kind) {
      case 'file_min_bytes':
        if (!Number.isSafeInteger(criterion.min_bytes) || criterion.min_bytes < 1 || criterion.min_bytes > MAX_EVIDENCE_BYTES) {
          problems.push('invalid_criterion_min_bytes');
        }
        break;
      case 'markdown_headings':
        if (!Number.isSafeInteger(criterion.min_count) || criterion.min_count < 1 || criterion.min_count > 1000) {
          problems.push('invalid_criterion_min_count');
        }
        if (criterion.headings !== undefined) {
          if (!Array.isArray(criterion.headings) || criterion.headings.length === 0
            || criterion.headings.some(item => typeof item !== 'string' || !item.trim() || item.length > 200)) {
            problems.push('invalid_criterion_headings');
          }
        }
        break;
      case 'contains_all':
        if (!Array.isArray(criterion.needles) || criterion.needles.length === 0 || criterion.needles.length > MAX_EVIDENCE_PATHS
          || criterion.needles.some(item => typeof item !== 'string' || !item.trim() || item.length > 200)) {
          problems.push('invalid_criterion_needles');
        }
        break;
      case 'json_keys':
        if (!Array.isArray(criterion.keys) || criterion.keys.length === 0 || criterion.keys.length > 20
          || criterion.keys.some(item => typeof item !== 'string' || !/^[A-Za-z0-9_.-]{1,80}$/.test(item))) {
          problems.push('invalid_criterion_keys');
        }
        break;
      case 'sha256':
        if (typeof criterion.sha256 !== 'string' || !HASH.test(criterion.sha256)) {
          problems.push('invalid_criterion_sha256');
        }
        break;
      default:
        break;
    }
  }

  if (!hasContentCheck) problems.push('acceptance_criteria_missing_content_check');
  return [...new Set(problems)];
}

// ---------- order validation ----------

export function classifyIntent(text) {
  if (text === undefined || text === null) return [];
  if (typeof text !== 'string') return ['invalid_intent_text'];
  const low = text
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase();
  return FORBIDDEN_INTENT_RULES
    .filter(rule => rule.re.test(low))
    .map(rule => rule.id);
}

export function validateOrder(order, {root = REPO_ROOT} = {}) {
  if (!isPlainObject(order)) return ['order_not_an_object'];
  const problems = [];
  for (const key of Object.keys(order)) {
    if (!ORDER_KEYS.includes(key)) problems.push(`unknown_field:${key}`);
  }
  for (const key of REQUIRED) {
    if (key === 'evidence_paths' || key === 'acceptance_criteria') continue;
    if (typeof order[key] !== 'string' || !order[key].trim()) problems.push(`missing_or_empty:${key}`);
  }
  if (order.order_id && !ORDER_ID.test(order.order_id)) problems.push('invalid_order_id');
  if (order.idempotency_key && !IDEMPOTENCY_KEY.test(order.idempotency_key)) {
    problems.push('invalid_idempotency_key');
  }
  if (order.acceptance_gate) {
    const gate = ACCEPTANCE_GATE_ALLOWLIST[order.acceptance_gate];
    if (!gate) problems.push(`gate_not_allowlisted:${order.acceptance_gate}`);
    else if (gate.kind !== 'order_acceptance') problems.push(`gate_is_harness_self_check:${order.acceptance_gate}`);
  }
  if (order.salary !== undefined && order.salary !== null && order.salary !== 'none') {
    problems.push('salary_must_be_none_in_phase1');
  }
  for (const [key, max] of [['role', 128], ['objective', 2000], ['rollback', 2000], ['seat', 64]]) {
    if (typeof order[key] === 'string' && order[key].trim().length > max) problems.push(`field_too_long:${key}`);
  }
  const evidence = validateEvidence(order, {root});
  problems.push(...evidence.problems);
  problems.push(...validateAcceptanceCriteria(order.acceptance_criteria, normalizeEvidencePaths(order.evidence_paths).paths));
  return [...new Set(problems)];
}

export function normalizeOrder(order) {
  const evidence = normalizeEvidencePaths(order?.evidence_paths);
  if (!evidence.ok) fail('invalid_evidence_paths', evidence.problems.join(','));
  return {
    order_id: order.order_id,
    idempotency_key: order.idempotency_key,
    role: order.role,
    objective: order.objective,
    acceptance_gate: order.acceptance_gate,
    acceptance_criteria: order.acceptance_criteria,
    evidence_paths: evidence.paths,
    rollback: order.rollback,
    salary: order.salary ?? 'none',
    seat: order.seat,
  };
}

// ---------- acceptance gate ----------

function safeEnv() {
  const env = {};
  for (const key of SAFE_ENV_KEYS) {
    if (typeof process.env[key] === 'string') env[key] = process.env[key];
  }
  return env;
}

function resolveGateScript(gateId) {
  const gate = ACCEPTANCE_GATE_ALLOWLIST[gateId];
  if (!gate) fail('gate_not_allowlisted', gateId);
  const scriptPath = resolve(REPO_ROOT, gate.script);
  const rootRelative = relative(REPO_ROOT, scriptPath);
  if (rootRelative.startsWith('..') || isAbsolute(rootRelative)) fail('gate_script_outside_repo');
  let stat;
  try {
    stat = lstatSync(scriptPath);
  } catch {
    fail('gate_script_missing', gate.script);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('gate_script_invalid', gate.script);
  // Re-check after resolving: a symlinked parent directory must not redirect
  // the allowlisted gate outside the repository.
  let realScript;
  let realRoot;
  try {
    realScript = realpathSync(scriptPath);
    realRoot = realpathSync(REPO_ROOT);
  } catch {
    fail('gate_script_unreadable', gate.script);
  }
  const realRelative = relative(realRoot, realScript);
  if (realRelative.startsWith('..') || isAbsolute(realRelative)) fail('gate_script_outside_repo');
  return {gate, realScript};
}

// The order travels over stdin. It is never interpolated into a command line,
// so no field of the order can become an argument, a flag or code.
function defaultRunner(gateId, order) {
  const {gate, realScript} = resolveGateScript(gateId);
  const stdout = execFileSync(process.execPath, [realScript, ...gate.args], {
    cwd: REPO_ROOT,
    input: order === undefined ? '' : canonicalJson(order),
    stdio: ['pipe', 'pipe', 'pipe'],
    encoding: 'utf8',
    timeout: 180000,
    maxBuffer: 4 * 1024 * 1024,
    env: safeEnv(),
  });
  try {
    return JSON.parse(stdout);
  } catch {
    fail('gate_output_not_json', String(stdout).slice(0, 120));
  }
}

// The harness never trusts a gate's own verdict. It re-binds the gate result to
// the order it validated and to the evidence bytes it hashed itself.
export function verifyGateResult(order, result) {
  if (!isPlainObject(result)) return {ok: false, problem: 'gate_result_not_an_object'};
  if (result.schema !== GATE_SCHEMA) return {ok: false, problem: 'gate_schema_mismatch'};
  if (result.gate !== order?.acceptance_gate) return {ok: false, problem: 'gate_id_mismatch'};
  if (result.order_id !== order?.order_id) return {ok: false, problem: 'gate_order_id_mismatch'};
  if (result.order_sha256 !== hashObject(normalizeOrder(order))) return {ok: false, problem: 'gate_order_sha256_mismatch'};
  if (result.paid !== false || result.financial_execution !== false) return {ok: false, problem: 'gate_must_not_pay'};
  if (result.amount_usd !== 0) return {ok: false, problem: 'gate_must_not_spend'};
  if (result.ok !== true) return {ok: false, problem: 'gate_reported_failure'};

  const criteria = order?.acceptance_criteria;
  if (!Array.isArray(result.criteria) || result.criteria.length !== criteria.length) {
    return {ok: false, problem: 'gate_criteria_count_mismatch'};
  }
  for (let index = 0; index < criteria.length; index += 1) {
    const actual = result.criteria[index];
    if (!isPlainObject(actual) || actual.id !== criteria[index].id || actual.kind !== criteria[index].kind) {
      return {ok: false, problem: `gate_criterion_mismatch:${criteria[index].id}`};
    }
    if (actual.ok !== true) return {ok: false, problem: `gate_criterion_not_met:${criteria[index].id}`};
  }

  const expectedEvidence = validateEvidence(order).evidence;
  if (!Array.isArray(result.evidence) || result.evidence.length !== expectedEvidence.length) {
    return {ok: false, problem: 'gate_evidence_count_mismatch'};
  }
  for (let index = 0; index < expectedEvidence.length; index += 1) {
    const actual = result.evidence[index];
    const expected = expectedEvidence[index];
    if (!isPlainObject(actual) || actual.path !== expected.path
      || actual.sha256 !== expected.sha256 || actual.bytes !== expected.bytes) {
      return {ok: false, problem: `gate_evidence_mismatch:${expected.path}`};
    }
  }
  return {ok: true, problem: null};
}

export function gateOutcome(order, {runner = defaultRunner} = {}) {
  const intentText = [order?.objective, order?.role, order?.acceptance_gate].filter(Boolean).join(' ');
  const forbidden = classifyIntent(intentText);
  const gateId = order?.acceptance_gate ?? null;
  if (forbidden.length) {
    return {
      state: 'needs_owner_decision',
      reason: `forbidden_intent:${forbidden.join(',')}`,
      gate: {id: gateId, kind: null, ran: false, ok: false, reason: 'forbidden_intent'},
    };
  }
  const gate = ACCEPTANCE_GATE_ALLOWLIST[gateId];
  if (!gate) {
    return {
      state: 'refused',
      reason: 'gate_not_allowlisted',
      gate: {id: gateId, kind: null, ran: false, ok: false, reason: 'gate_not_allowlisted'},
    };
  }
  if (gate.kind !== 'order_acceptance') {
    return {
      state: 'refused',
      reason: 'gate_is_harness_self_check',
      gate: {id: gateId, kind: gate.kind, ran: false, ok: false, reason: 'gate_is_harness_self_check'},
    };
  }

  let result;
  try {
    result = runner(gateId, order);
  } catch (error) {
    return {
      state: 'refused',
      reason: `gate_failed:${String(error?.message ?? error).slice(0, 200)}`,
      gate: {id: gateId, kind: gate.kind, ran: true, ok: false, output_sha256: null},
    };
  }

  const verified = verifyGateResult(order, result);
  if (!verified.ok) {
    return {
      state: 'refused',
      reason: `gate_output_invalid:${verified.problem}`,
      gate: {
        id: gateId,
        kind: gate.kind,
        ran: true,
        ok: false,
        output_sha256: isPlainObject(result) ? hashObject(result) : null,
      },
    };
  }
  return {
    state: 'accepted',
    reason: 'gate_exit_0',
    gate: {
      id: gateId,
      kind: gate.kind,
      ran: true,
      ok: true,
      output_sha256: hashObject(result),
      criteria: result.criteria.map(item => ({id: item.id, kind: item.kind, ok: item.ok === true, detail: String(item.detail ?? '').slice(0, 160)})),
    },
  };
}

// ---------- receipts ----------

function normalizeGateBlock(gate, order, state) {
  if (!isPlainObject(gate)) fail('receipt_gate_missing');
  const block = {
    id: gate.id ?? null,
    kind: gate.kind ?? null,
    ran: gate.ran === true,
    ok: gate.ok === true,
    output_sha256: gate.output_sha256 ?? null,
    reason: gate.reason === undefined ? null : gate.reason,
    criteria: Array.isArray(gate.criteria)
      ? gate.criteria.map(item => ({id: item.id, kind: item.kind, ok: item.ok === true, detail: String(item.detail ?? '').slice(0, 160)}))
      : [],
  };
  if (state === 'accepted') {
    if (!block.ran || !block.ok) fail('accepted_without_gate_pass');
    if (block.kind !== 'order_acceptance') fail('accepted_by_non_acceptance_gate');
    if (!HASH.test(String(block.output_sha256))) fail('accepted_without_gate_output_hash');
    const declared = order?.acceptance_criteria ?? [];
    if (block.criteria.length !== declared.length) fail('accepted_without_full_criteria');
    for (let index = 0; index < declared.length; index += 1) {
      if (block.criteria[index].id !== declared[index].id || block.criteria[index].ok !== true) {
        fail('accepted_without_full_criteria');
      }
    }
  }
  if (state === 'needs_owner_decision' && block.ran) fail('owner_decision_with_gate_run');
  return block;
}

export function buildReceipt(order, outcome, {at = new Date().toISOString(), root = REPO_ROOT} = {}) {
  if (!RECEIPT_STATES.has(outcome?.state)) fail('invalid_receipt_state');
  if (typeof outcome.reason !== 'string' || !outcome.reason) fail('invalid_receipt_reason');
  const problems = validateOrder(order, {root});
  if (problems.length) fail('invalid_order', problems.join(','));
  const normalized = normalizeOrder(order);
  const gateBlock = normalizeGateBlock(outcome.gate, normalized, outcome.state);
  const forbidden = classifyIntent([normalized.objective, normalized.role, normalized.acceptance_gate].join(' '));
  if (forbidden.length && outcome.state !== 'needs_owner_decision') {
    fail('forbidden_intent_requires_owner_decision', forbidden.join(','));
  }
  if (!forbidden.length && outcome.state === 'needs_owner_decision') {
    fail('owner_decision_without_forbidden_intent');
  }
  const evidence = validateEvidence(normalized, {root});
  if (!evidence.ok) fail('invalid_evidence', evidence.problems.join(','));

  const body = {
    order_id: normalized.order_id,
    idempotency_key: normalized.idempotency_key,
    role: normalized.role,
    seat: normalized.seat,
    state: outcome.state,
    reason: outcome.reason,
    acceptance_gate: normalized.acceptance_gate,
    gate: gateBlock,
    evidence_paths: normalized.evidence_paths,
    evidence: evidence.evidence,
    rollback: normalized.rollback,
    order: normalized,
    order_sha256: hashObject(normalized),
    revision: PHASE1_REVISION,
    at,
    paid: false,
    financial_execution: false,
    amount_usd: 0,
  };
  return {...body, receipt_sha256: hashObject(body)};
}

function validateOrderSnapshot(order) {
  if (!isPlainObject(order)) return ['order_not_an_object'];
  const problems = [];
  for (const key of Object.keys(order)) {
    if (!ORDER_KEYS.includes(key)) problems.push(`unknown_field:${key}`);
  }
  for (const key of REQUIRED) {
    if (key === 'evidence_paths' || key === 'acceptance_criteria') continue;
    if (typeof order[key] !== 'string' || !order[key].trim()) problems.push(`missing_or_empty:${key}`);
  }
  if (!ORDER_ID.test(order.order_id || '')) problems.push('invalid_order_id');
  if (!IDEMPOTENCY_KEY.test(order.idempotency_key || '')) problems.push('invalid_idempotency_key');
  const gate = ACCEPTANCE_GATE_ALLOWLIST[order.acceptance_gate || ''];
  if (!gate) problems.push(`gate_not_allowlisted:${order.acceptance_gate}`);
  else if (gate.kind !== 'order_acceptance') problems.push(`gate_is_harness_self_check:${order.acceptance_gate}`);
  if (order.salary !== 'none') problems.push('salary_must_be_none_in_phase1');
  const evidence = normalizeEvidencePaths(order.evidence_paths);
  if (!evidence.ok) problems.push(...evidence.problems);
  else {
    for (const path of evidence.paths) {
      if (!isWithinAllowedRoot(path)) problems.push(`evidence_path_not_allowed:${path}`);
    }
  }
  problems.push(...validateAcceptanceCriteria(order.acceptance_criteria, evidence.paths));
  return [...new Set(problems)];
}

function verifyGateBlock(gate, receipt) {
  if (!isPlainObject(gate)) fail('receipt_gate_missing');
  if (gate.id !== receipt.order.acceptance_gate) fail('receipt_gate_mismatch');
  if (receipt.state === 'accepted') {
    if (gate.ran !== true || gate.ok !== true) fail('accepted_without_gate_pass');
    if (gate.kind !== 'order_acceptance') fail('accepted_by_non_acceptance_gate');
    if (typeof gate.output_sha256 !== 'string' || !HASH.test(gate.output_sha256)) fail('accepted_without_gate_output_hash');
    const declared = receipt.order.acceptance_criteria;
    if (!Array.isArray(gate.criteria) || gate.criteria.length !== declared.length) fail('accepted_without_full_criteria');
    for (let index = 0; index < declared.length; index += 1) {
      const item = gate.criteria[index];
      if (!isPlainObject(item) || item.id !== declared[index].id || item.ok !== true) {
        fail('accepted_without_full_criteria');
      }
    }
  }
  if (receipt.state === 'needs_owner_decision' && gate.ran === true) fail('owner_decision_with_gate_run');
  if (receipt.state === 'refused' && gate.ran === true && gate.ok === true) fail('refused_with_gate_pass');
}

export function verifyReceipt(receipt) {
  if (!isPlainObject(receipt)) fail('receipt_not_an_object');
  if (receipt.revision !== PHASE1_REVISION) fail('unsupported_revision', String(receipt.revision));
  if (!RECEIPT_STATES.has(receipt.state)) fail('invalid_receipt_state');
  if (receipt.paid !== false || receipt.financial_execution !== false) fail('phase1_must_not_pay');
  if (receipt.amount_usd !== 0) fail('phase1_must_not_spend');
  if (typeof receipt.reason !== 'string' || !receipt.reason) fail('invalid_receipt_reason');
  if (typeof receipt.at !== 'string' || !Number.isFinite(Date.parse(receipt.at))) fail('invalid_receipt_at');
  if (typeof receipt.idempotency_key !== 'string' || !IDEMPOTENCY_KEY.test(receipt.idempotency_key)) {
    fail('invalid_idempotency_key');
  }
  if (!isPlainObject(receipt.order)) fail('order_snapshot_missing');
  const snapshotProblems = validateOrderSnapshot(receipt.order);
  if (snapshotProblems.length) fail('invalid_order_snapshot', snapshotProblems.join(','));
  if (receipt.order_sha256 !== hashObject(receipt.order)) fail('order_sha256_mismatch');

  for (const key of ['order_id', 'role', 'seat', 'acceptance_gate', 'rollback', 'idempotency_key']) {
    if (receipt[key] !== receipt.order[key]) fail(`receipt_order_mismatch:${key}`);
  }
  if (!Array.isArray(receipt.evidence_paths)
    || receipt.evidence_paths.length !== receipt.order.evidence_paths.length
    || receipt.evidence_paths.some((path, index) => path !== receipt.order.evidence_paths[index])) {
    fail('receipt_order_mismatch:evidence_paths');
  }
  if (!Array.isArray(receipt.evidence) || receipt.evidence.length !== receipt.order.evidence_paths.length) {
    fail('invalid_evidence_metadata');
  }
  for (let index = 0; index < receipt.evidence.length; index += 1) {
    const item = receipt.evidence[index];
    if (!isPlainObject(item)
      || item.path !== receipt.order.evidence_paths[index]
      || typeof item.sha256 !== 'string' || !HASH.test(item.sha256)
      || !Number.isSafeInteger(item.bytes) || item.bytes < 0) {
      fail('invalid_evidence_metadata');
    }
  }

  verifyGateBlock(receipt.gate, receipt);

  const forbidden = classifyIntent([receipt.order.objective, receipt.order.role, receipt.order.acceptance_gate].join(' '));
  if (forbidden.length && receipt.state !== 'needs_owner_decision') {
    fail('forbidden_intent_requires_owner_decision', forbidden.join(','));
  }
  if (!forbidden.length && receipt.state === 'needs_owner_decision') {
    fail('owner_decision_without_forbidden_intent');
  }

  const body = {...receipt};
  delete body.receipt_sha256;
  if (receipt.receipt_sha256 !== hashObject(body)) fail('receipt_sha256_mismatch');
  return true;
}

// Append-only: exact idempotent replays are no-ops; an idempotency key or an
// order_id cannot be reused for different content; accepted is terminal.
//
// Duplicate detection deliberately ignores `at`/`receipt_sha256`: re-running the
// same immutable order produces a fresh timestamp, but it is still the same
// execution and must not be booked twice.
export function assertAppendOnly(previous, next) {
  verifyReceipt(next);
  const sameKey = previous.find(receipt => receipt.idempotency_key === next.idempotency_key);
  if (sameKey) {
    verifyReceipt(sameKey);
    if (sameKey.order_sha256 !== next.order_sha256) fail('idempotency_key_conflict');
    if (sameKey.state === next.state && sameKey.reason === next.reason) {
      return {duplicate: true, existing: sameKey};
    }
    if (sameKey.state === 'accepted') fail('accepted_order_is_terminal');
    fail('idempotency_key_conflict');
  }
  const sameOrder = previous.find(receipt => receipt.order_id === next.order_id);
  if (sameOrder) {
    if (sameOrder.state === 'accepted') fail('accepted_order_is_terminal');
    fail('order_id_conflict');
  }
  return {duplicate: false};
}

export function readLedger(ledgerPath) {
  if (!existsSync(ledgerPath)) return [];
  const raw = readFileSync(ledgerPath, 'utf8');
  if (!raw.trim()) return [];
  const lines = raw.split('\n');
  const receipts = [];
  const seenKeys = new Set();
  const seenOrders = new Set();
  const acceptedOrders = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim()) {
      if (index === lines.length - 1) continue;
      fail(`invalid_ledger_line_${index + 1}`, 'blank_line');
    }
    let receipt;
    try {
      receipt = JSON.parse(line);
    } catch {
      fail(`invalid_ledger_line_${index + 1}`, 'invalid_json');
    }
    try {
      verifyReceipt(receipt);
    } catch (error) {
      fail(`invalid_ledger_line_${index + 1}`, error.message);
    }
    if (seenKeys.has(receipt.idempotency_key)) {
      fail(`invalid_ledger_line_${index + 1}`, 'duplicate_idempotency_key');
    }
    seenKeys.add(receipt.idempotency_key);
    if (seenOrders.has(receipt.order_id)) {
      fail(`invalid_ledger_line_${index + 1}`, 'duplicate_order_id');
    }
    seenOrders.add(receipt.order_id);
    if (acceptedOrders.has(receipt.order_id)) {
      fail(`invalid_ledger_line_${index + 1}`, 'accepted_order_is_terminal');
    }
    if (receipt.state === 'accepted') acceptedOrders.add(receipt.order_id);
    receipts.push(receipt);
  }
  return receipts;
}

// ---------- locking ----------
//
// A lock is a file created with O_EXCL that carries a random owner token.
// Stale-lock reclaim never deletes a lock from an old observation:
//   1. the exact file identity (dev + inode + token) is captured by reading it;
//   2. a short-lived sidecar lock serialises reclaimers;
//   3. the identity is re-read *after* the sidecar is held;
//   4. only a lock whose identity is unchanged and still stale is unlinked.
// If another process replaced the lock in between, reclaim aborts and the
// caller retries the normal O_EXCL path.

function sleepSync(milliseconds) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, milliseconds);
}

function isProcessAlive(pid) {
  if (!Number.isSafeInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

function newLockToken() {
  return `${process.pid}-${Date.now().toString(36)}-${randomBytes(8).toString('hex')}`;
}

export function readLockState(lockPath) {
  let fd;
  try {
    fd = openSync(lockPath, 'r');
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
  try {
    const stat = fstatSync(fd);
    let owner = null;
    try {
      owner = JSON.parse(readFileSync(fd, 'utf8'));
    } catch {
      owner = null;
    }
    return {
      token: typeof owner?.token === 'string' ? owner.token : null,
      pid: Number.isSafeInteger(owner?.pid) ? owner.pid : null,
      at: typeof owner?.at === 'string' ? owner.at : null,
      dev: stat.dev,
      ino: stat.ino,
      mtimeMs: stat.mtimeMs,
    };
  } finally {
    closeSync(fd);
  }
}

function isLockStale(state, {staleMs, now}) {
  if (!state) return false;
  const age = now - state.mtimeMs;
  if (!Number.isFinite(age) || age <= staleMs) return false;
  return !isProcessAlive(state.pid);
}

function tryBreakStaleReclaimSidecar(reclaimPath, {staleMs, now}) {
  const state = readLockState(reclaimPath);
  if (!state) return;
  if (isLockStale(state, {staleMs, now})) {
    try { unlinkSync(reclaimPath); } catch {}
  }
}

// Returns true when the observed lock is gone and the caller may retry the
// O_EXCL create. Only a lock that is byte-identical (dev/inode) to the observed
// one is ever removed.
export function reclaimStaleLock(lockPath, observed, {staleMs = 30000, now = Date.now} = {}) {
  if (!observed) return true;
  const reclaimPath = `${lockPath}.reclaim`;
  let fd;
  try {
    fd = openSync(reclaimPath, 'wx', 0o600);
  } catch (error) {
    if (error.code !== 'EEXIST') throw error;
    tryBreakStaleReclaimSidecar(reclaimPath, {staleMs, now: now()});
    return false;
  }
  try {
    writeSync(fd, canonicalJson({pid: process.pid, token: newLockToken(), at: new Date().toISOString()}));
  } catch {
    // A malformed sidecar only weakens reclaimer serialisation, so keep going.
  } finally {
    closeSync(fd);
  }
  try {
    const current = readLockState(lockPath);
    if (!current) return true;
    // The lock was replaced while we waited: never delete the new one. The
    // inode can be recycled by the filesystem, so the owner token must also
    // still be the one we observed.
    if (current.dev !== observed.dev || current.ino !== observed.ino) return false;
    if (observed.token !== null && current.token !== observed.token) return false;
    if (!isLockStale(current, {staleMs, now: now()})) return false;
    try {
      unlinkSync(lockPath);
      return true;
    } catch (error) {
      if (error.code === 'ENOENT') return true;
      throw error;
    }
  } finally {
    try { unlinkSync(reclaimPath); } catch {}
  }
}

export function acquireLedgerLock(ledgerPath, {timeoutMs = 15000, staleMs = 30000, now = Date.now} = {}) {
  const lockPath = `${ledgerPath}.lock`;
  mkdirSync(dirname(ledgerPath), {recursive: true});
  const token = newLockToken();
  const started = now();
  for (;;) {
    let created = false;
    try {
      const fd = openSync(lockPath, 'wx', 0o600);
      try {
        writeSync(fd, canonicalJson({pid: process.pid, token, at: new Date().toISOString()}));
      } finally {
        closeSync(fd);
      }
      created = true;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    if (created) {
      let released = false;
      return () => {
        if (released) return;
        released = true;
        const current = readLockState(lockPath);
        // Only the owner may release: never unlink someone else's lock.
        if (current && current.token === token) {
          try { unlinkSync(lockPath); } catch {}
        }
      };
    }

    const observed = readLockState(lockPath);
    if (observed && isLockStale(observed, {staleMs, now: now()})) {
      // Another reclaimer may already hold the `.reclaim` sidecar. Only skip the
      // wait when the stale lock is actually gone; otherwise fall through to the
      // normal backoff so a contended reclaim cannot spin hot until the timeout.
      if (reclaimStaleLock(lockPath, observed, {staleMs, now})) continue;
    }
    if (now() - started >= timeoutMs) fail('ledger_locked', ledgerPath);
    sleepSync(10);
  }
}

// ---------- ledger append ----------

const DEFAULT_IO = Object.freeze({
  open: openSync,
  close: closeSync,
  write: writeSync,
  fsync: fsyncSync,
  ftruncate: ftruncateSync,
  fstat: fstatSync,
});

function writeAllSync(fd, buffer, io) {
  let offset = 0;
  while (offset < buffer.length) {
    const written = io.write(fd, buffer, offset, buffer.length - offset);
    if (!Number.isSafeInteger(written) || written <= 0) {
      fail('ledger_write_incomplete', `${offset}/${buffer.length}`);
    }
    offset += written;
  }
  return offset;
}

export function appendReceipt(ledgerPath, receipt, options = {}) {
  const io = {...DEFAULT_IO, ...(options.io || {})};
  verifyReceipt(receipt);
  if (receipt.paid !== false || receipt.financial_execution !== false) fail('phase1_must_not_pay');
  if (receipt.amount_usd !== 0) fail('phase1_must_not_spend');

  // The write boundary lives here, not only in main(): any module that imports
  // appendReceipt() gets the same confinement to knowledge/results/hire/. The
  // path must be repo-relative (or relative to an explicit `root` test seam),
  // normalized, inside LEDGER_DIR, and free of symlinked components.
  const root = options.root ?? REPO_ROOT;
  const target = resolveLedgerPath(ledgerPath, {root});
  const release = acquireLedgerLock(target, options);
  try {
    const previous = readLedger(target);
    const append = assertAppendOnly(previous, receipt);
    if (append.duplicate) {
      return {
        ledger: target,
        appended: false,
        duplicate: true,
        // Report the receipt already in the ledger, not the fresh attempt.
        receipt_sha256: append.existing.receipt_sha256,
        attempted_receipt_sha256: receipt.receipt_sha256,
      };
    }

    const buffer = Buffer.from(`${canonicalJson(receipt)}\n`, 'utf8');
    const fd = io.open(target, 'a', 0o600);
    try {
      const sizeBefore = io.fstat(fd).size;
      try {
        const written = writeAllSync(fd, buffer, io);
        if (written !== buffer.length) fail('ledger_write_incomplete', `${written}/${buffer.length}`);
        io.fsync(fd);
      } catch (error) {
        // Roll back to the pre-write length so a failed append never leaves a
        // silently corrupted JSONL tail behind.
        try {
          io.ftruncate(fd, sizeBefore);
          io.fsync(fd);
        } catch (rollbackError) {
          throw Object.assign(
            new Error(`ledger_write_failed_unrolled:${error.message}:${rollbackError.message}`),
            {code: 'ledger_write_failed_unrolled'},
          );
        }
        throw error;
      }
    } finally {
      io.close(fd);
    }
    return {ledger: target, appended: true, duplicate: false, receipt_sha256: receipt.receipt_sha256};
  } finally {
    release();
  }
}

// ---------- ledger path boundary ----------

// The CLI may not point the ledger anywhere it likes. Only a normalized,
// repo-relative path inside knowledge/results/hire/ that resolves to a regular
// file with no symlinked component is accepted.
export function resolveLedgerPath(input, {root = REPO_ROOT} = {}) {
  const raw = input === undefined || input === null || input === '' ? DEFAULT_LEDGER_PATH : input;
  if (typeof raw !== 'string') fail('ledger_path_invalid', 'not_a_string');
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_PATH_LENGTH) fail('ledger_path_invalid', 'length');
  if (isAbsolute(trimmed)) fail('ledger_path_absolute_forbidden', trimmed);
  if (trimmed.includes('\\') || trimmed.includes('\0')) fail('ledger_path_invalid', trimmed);
  const normalized = posix.normalize(trimmed);
  if (normalized !== trimmed) fail('ledger_path_invalid', 'not_normalized');
  if (normalized.startsWith('../') || normalized.includes('/../')) {
    fail('ledger_path_traversal', trimmed);
  }
  if (!LEDGER_PATH_PATTERN.test(normalized)) fail('ledger_path_outside_hire_dir', trimmed);

  let rootReal;
  try {
    rootReal = realpathSync(root);
  } catch {
    fail('ledger_root_unreadable', String(root));
  }

  // Walk every existing component: a symlinked directory would redirect the
  // write outside the allowed root even though the textual path looks fine.
  const segments = normalized.split('/');
  let walked = '';
  for (const segment of segments) {
    walked = walked ? `${walked}/${segment}` : segment;
    const absolute = resolve(rootReal, walked);
    let stat;
    try {
      stat = lstatSync(absolute);
    } catch (error) {
      if (error.code === 'ENOENT') break;
      fail('ledger_path_unreadable', walked);
    }
    if (stat.isSymbolicLink()) fail('ledger_path_symlink_forbidden', walked);
    if (walked === normalized && !stat.isFile()) fail('ledger_path_not_a_file', walked);
  }

  const absolute = resolve(rootReal, normalized);
  if (existsSync(absolute)) {
    let real;
    try {
      real = realpathSync(absolute);
    } catch {
      fail('ledger_path_unreadable', normalized);
    }
    const allowedReal = realpathSync(resolve(rootReal, LEDGER_DIR));
    const relativeToAllowed = relative(allowedReal, real);
    if (relativeToAllowed.startsWith('..') || isAbsolute(relativeToAllowed)) {
      fail('ledger_path_outside_hire_dir', normalized);
    }
  }
  return absolute;
}

// ---------- CLI ----------

function resolveOrderFile(orderPath) {
  const absolute = isAbsolute(orderPath) ? orderPath : resolve(REPO_ROOT, orderPath);
  const rootRelative = relative(REPO_ROOT, absolute).split(sep).join('/');
  if (rootRelative.startsWith('..') || !rootRelative.startsWith('ops/hire/orders/')) {
    fail('order_file_outside_orders_dir', orderPath);
  }
  let stat;
  try {
    stat = lstatSync(absolute);
  } catch {
    fail('order_file_missing', orderPath);
  }
  if (stat.isSymbolicLink() || !stat.isFile()) fail('order_file_invalid', orderPath);
  // A symlinked parent directory must not redirect the order outside the repo.
  let realFile;
  let realRoot;
  let realOrders;
  try {
    realFile = realpathSync(absolute);
    realRoot = realpathSync(REPO_ROOT);
    realOrders = realpathSync(resolve(REPO_ROOT, 'ops/hire/orders'));
  } catch {
    fail('order_file_unreadable', orderPath);
  }
  const realRootRelative = relative(realRoot, realFile);
  const realOrdersRelative = relative(realOrders, realFile);
  if (realRootRelative.startsWith('..') || isAbsolute(realRootRelative)
    || realOrdersRelative.startsWith('..') || isAbsolute(realOrdersRelative)) {
    fail('order_file_outside_orders_dir', orderPath);
  }
  return absolute;
}

function zeroFunds() {
  return {paid: false, financial_execution: false, amount_usd: 0};
}

export function main(argv) {
  const [command, orderPath, ledgerPath] = argv;
  if (!['validate', 'run', 'selfcheck'].includes(command)) {
    console.error('usage: node scripts/hire-phase1.mjs validate|run <order.json> [ledger.jsonl]');
    console.error('       node scripts/hire-phase1.mjs selfcheck');
    return 2;
  }

  if (command === 'selfcheck') {
    try {
      const result = defaultRunner('phase1-smoke', {});
      const ok = isPlainObject(result) && result.ok === true;
      console.log(JSON.stringify({ok, command: 'selfcheck', gate: 'phase1-smoke', result, ...zeroFunds()}));
      return ok ? 0 : 1;
    } catch (error) {
      console.log(JSON.stringify({ok: false, command: 'selfcheck', state: 'refused', reason: error.code || 'selfcheck_failed', detail: String(error.message).slice(0, 300), ...zeroFunds()}));
      return 1;
    }
  }

  if (!orderPath) {
    console.error('usage: node scripts/hire-phase1.mjs validate|run <order.json> [ledger.jsonl]');
    return 2;
  }

  let order;
  try {
    order = JSON.parse(readFileSync(resolveOrderFile(orderPath), 'utf8'));
  } catch (error) {
    console.log(JSON.stringify({ok: false, state: 'refused', reason: error.code || 'invalid_order_file', detail: String(error.message).slice(0, 200), ...zeroFunds()}));
    return 1;
  }

  const problems = validateOrder(order);
  if (problems.length) {
    console.log(JSON.stringify({ok: false, state: 'refused', reason: 'invalid_order', problems, ...zeroFunds()}));
    return 1;
  }

  if (command === 'validate') {
    const evidence = validateEvidence(order);
    console.log(JSON.stringify({
      ok: true,
      state: 'spec_valid',
      order_id: order.order_id,
      idempotency_key: order.idempotency_key,
      acceptance_gate: order.acceptance_gate,
      acceptance_criteria: order.acceptance_criteria.map(item => item.id),
      revision: PHASE1_REVISION,
      evidence: evidence.evidence,
      ...zeroFunds(),
    }));
    return 0;
  }

  try {
    const outcome = gateOutcome(order);
    const receipt = buildReceipt(order, outcome);
    // Hand the raw CLI value to appendReceipt(), which applies the same path
    // boundary; the resolved absolute path comes back as result.ledger.
    const result = appendReceipt(ledgerPath ?? DEFAULT_LEDGER_PATH, receipt);
    const target = result.ledger;
    console.log(JSON.stringify({
      ok: true,
      state: receipt.state,
      reason: receipt.reason,
      gate: receipt.gate.id,
      criteria: receipt.gate.criteria.map(item => item.id),
      ledger: target,
      appended: result.appended,
      duplicate: result.duplicate,
      receipt_sha256: result.receipt_sha256,
      order_sha256: receipt.order_sha256,
      ...zeroFunds(),
    }));
    return receipt.state === 'accepted' ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      state: 'refused',
      reason: error.code || 'invalid_receipt_or_ledger',
      detail: String(error.message).slice(0, 300),
      ...zeroFunds(),
    }));
    return 1;
  }
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (invoked) process.exitCode = main(process.argv.slice(2));
