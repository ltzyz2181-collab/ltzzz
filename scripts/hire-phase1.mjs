#!/usr/bin/env node
// LTZZZ AI-hires-AI Phase1 v1 — in-repo closed loop only, security hardened.
//
// Security boundaries:
// - acceptance_gate is an allowlisted gate ID, never a free-form command.
// - evidence paths are normalized, restricted to repo directories, must exist,
//   and their SHA-256 is recorded in the receipt.
// - receipts are canonical JSON with receipt_sha256 and order_sha256; appends
//   are locked and idempotent; accepted is terminal.
// - no money, no credentials, no production writes.
import {createHash} from 'node:crypto';
import {
  closeSync,
  existsSync,
  fsyncSync,
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
export const PHASE1_REVISION = 'hire-phase1-v1';
// v0 wrote `ledger.jsonl` with a different schema (no idempotency key / evidence
// metadata), so it stays frozen as historical evidence. v1 writes here.
export const DEFAULT_LEDGER_PATH = 'knowledge/results/hire/ledger-v1.jsonl';

export const ORDER_KEYS = Object.freeze([
  'order_id',
  'idempotency_key',
  'role',
  'objective',
  'acceptance_gate',
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
  'evidence_paths',
  'rollback',
  'seat',
]);

// A model seat may never accept an order that touches money, signing,
// credentials or a production write. Both English and Chinese terms are
// checked because order objectives may be written in either language.
export const FORBIDDEN_INTENT = Object.freeze([
  'funding', 'signing', 'wallet', 'safe', 'disbursement', 'loan',
  'credential', 'secret', 'production_write', 'deploy_production',
  '钱包', '私钥', '签名', '转账', '放款', '资金', '凭据', '密钥',
  '生产写', '生产部署', '付款', '支付', '提现', '合约部署',
]);

export const RECEIPT_STATES = new Set(['accepted', 'refused', 'needs_owner_decision']);

// Evidence may only come from these repository roots. Paths are repo-relative
// POSIX paths; absolute paths, traversal and symlinks are rejected.
export const EVIDENCE_ALLOWED_ROOTS = Object.freeze([
  'docs',
  'knowledge/results/hire',
]);

// Explicit gate allowlist. Each gate is a fixed repository script; no order
// field can inject arguments or code. `node -e` and arbitrary node commands
// are therefore impossible.
export const ACCEPTANCE_GATE_ALLOWLIST = Object.freeze({
  'phase1-smoke': Object.freeze({
    script: 'scripts/hire/gates/phase1-smoke.mjs',
    args: Object.freeze([]),
    description: 'deterministic read-only Phase1 spec smoke check',
  }),
});

const ORDER_ID = /^[A-Za-z0-9._-]{6,120}$/;
const IDEMPOTENCY_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,159}$/;
const HASH = /^[0-9a-f]{64}$/;
const MAX_EVIDENCE_PATHS = 20;
const MAX_EVIDENCE_BYTES = 10 * 1024 * 1024;
const MAX_PATH_LENGTH = 512;
const SAFE_ENV_KEYS = ['PATH', 'LANG', 'LC_ALL', 'TZ', 'TMPDIR'];

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

// ---------- order validation ----------

export function classifyIntent(text) {
  const low = String(text || '')
    .normalize('NFKC')
    .replace(/[​-‍﻿]/g, '')
    .toLowerCase();
  return FORBIDDEN_INTENT.filter(word => low.includes(word));
}

export function validateOrder(order, {root = REPO_ROOT} = {}) {
  if (!isPlainObject(order)) return ['order_not_an_object'];
  const problems = [];
  for (const key of Object.keys(order)) {
    if (!ORDER_KEYS.includes(key)) problems.push(`unknown_field:${key}`);
  }
  for (const key of REQUIRED) {
    if (key === 'evidence_paths') continue;
    if (typeof order[key] !== 'string' || !order[key].trim()) problems.push(`missing_or_empty:${key}`);
  }
  if (order.order_id && !ORDER_ID.test(order.order_id)) problems.push('invalid_order_id');
  if (order.idempotency_key && !IDEMPOTENCY_KEY.test(order.idempotency_key)) {
    problems.push('invalid_idempotency_key');
  }
  if (order.acceptance_gate && !Object.hasOwn(ACCEPTANCE_GATE_ALLOWLIST, order.acceptance_gate)) {
    problems.push(`gate_not_allowlisted:${order.acceptance_gate}`);
  }
  if (order.salary !== undefined && order.salary !== null && order.salary !== 'none') {
    problems.push('salary_must_be_none_in_phase1');
  }
  for (const [key, max] of [['role', 128], ['objective', 2000], ['rollback', 2000], ['seat', 64]]) {
    if (typeof order[key] === 'string' && order[key].trim().length > max) problems.push(`field_too_long:${key}`);
  }
  problems.push(...validateEvidence(order, {root}).problems);
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

function defaultRunner(gateId) {
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
  execFileSync(process.execPath, [realScript, ...gate.args], {
    cwd: REPO_ROOT,
    stdio: 'pipe',
    encoding: 'utf8',
    timeout: 180000,
    env: safeEnv(),
  });
}

export function gateOutcome(order, {runner = defaultRunner} = {}) {
  const intentText = [order?.objective, order?.role, order?.acceptance_gate].filter(Boolean).join(' ');
  const forbidden = classifyIntent(intentText);
  if (forbidden.length) {
    return {state: 'needs_owner_decision', reason: `forbidden_intent:${forbidden.join(',')}`};
  }
  if (!order || !Object.hasOwn(ACCEPTANCE_GATE_ALLOWLIST, order.acceptance_gate)) {
    return {state: 'refused', reason: 'gate_not_allowlisted'};
  }
  try {
    runner(order.acceptance_gate);
    return {state: 'accepted', reason: 'gate_exit_0'};
  } catch (error) {
    return {state: 'refused', reason: `gate_failed:${String(error?.message ?? error).slice(0, 200)}`};
  }
}

// ---------- receipts ----------

export function buildReceipt(order, outcome, {at = new Date().toISOString(), root = REPO_ROOT} = {}) {
  if (!RECEIPT_STATES.has(outcome?.state)) fail('invalid_receipt_state');
  if (typeof outcome.reason !== 'string' || !outcome.reason) fail('invalid_receipt_reason');
  const problems = validateOrder(order, {root});
  if (problems.length) fail('invalid_order', problems.join(','));
  const normalized = normalizeOrder(order);
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
    if (key === 'evidence_paths') continue;
    if (typeof order[key] !== 'string' || !order[key].trim()) problems.push(`missing_or_empty:${key}`);
  }
  if (!ORDER_ID.test(order.order_id || '')) problems.push('invalid_order_id');
  if (!IDEMPOTENCY_KEY.test(order.idempotency_key || '')) problems.push('invalid_idempotency_key');
  if (!Object.hasOwn(ACCEPTANCE_GATE_ALLOWLIST, order.acceptance_gate || '')) {
    problems.push(`gate_not_allowlisted:${order.acceptance_gate}`);
  }
  if (order.salary !== 'none') problems.push('salary_must_be_none_in_phase1');
  const evidence = normalizeEvidencePaths(order.evidence_paths);
  if (!evidence.ok) problems.push(...evidence.problems);
  else {
    for (const path of evidence.paths) {
      if (!isWithinAllowedRoot(path)) problems.push(`evidence_path_not_allowed:${path}`);
    }
  }
  return [...new Set(problems)];
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

function acquireLedgerLock(ledgerPath, {timeoutMs = 5000, staleMs = 30000} = {}) {
  const lockPath = `${ledgerPath}.lock`;
  mkdirSync(dirname(ledgerPath), {recursive: true});
  const started = Date.now();
  for (;;) {
    try {
      const fd = openSync(lockPath, 'wx', 0o600);
      try {
        writeSync(fd, canonicalJson({pid: process.pid, at: new Date().toISOString()}));
      } finally {
        closeSync(fd);
      }
      let released = false;
      return () => {
        if (released) return;
        released = true;
        try { unlinkSync(lockPath); } catch {}
      };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let stale = false;
      try {
        const stat = statSync(lockPath);
        let owner = null;
        try { owner = JSON.parse(readFileSync(lockPath, 'utf8')); } catch {}
        if (Date.now() - stat.mtimeMs > staleMs && !isProcessAlive(owner?.pid)) stale = true;
      } catch {}
      if (stale) {
        try { unlinkSync(lockPath); } catch {}
        continue;
      }
      if (Date.now() - started >= timeoutMs) fail('ledger_locked', ledgerPath);
      sleepSync(10);
    }
  }
}

export function appendReceipt(ledgerPath, receipt, options = {}) {
  verifyReceipt(receipt);
  if (receipt.paid !== false || receipt.financial_execution !== false) fail('phase1_must_not_pay');
  if (receipt.amount_usd !== 0) fail('phase1_must_not_spend');

  const target = resolve(ledgerPath);
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
    const line = `${canonicalJson(receipt)}\n`;
    const fd = openSync(target, 'a', 0o600);
    try {
      writeSync(fd, line);
      fsyncSync(fd);
    } finally {
      closeSync(fd);
    }
    return {ledger: target, appended: true, duplicate: false, receipt_sha256: receipt.receipt_sha256};
  } finally {
    release();
  }
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

export function main(argv) {
  const [command, orderPath, ledgerPath] = argv;
  if (!['validate', 'run'].includes(command) || !orderPath) {
    console.error('usage: node scripts/hire-phase1.mjs validate|run <order.json> [ledger.jsonl]');
    return 2;
  }

  let order;
  try {
    order = JSON.parse(readFileSync(resolveOrderFile(orderPath), 'utf8'));
  } catch (error) {
    console.log(JSON.stringify({ok: false, state: 'refused', reason: error.code || 'invalid_order_file', detail: String(error.message).slice(0, 200), paid: false, financial_execution: false, amount_usd: 0}));
    return 1;
  }

  const problems = validateOrder(order);
  if (problems.length) {
    console.log(JSON.stringify({ok: false, state: 'refused', reason: 'invalid_order', problems, paid: false, financial_execution: false, amount_usd: 0}));
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
      revision: PHASE1_REVISION,
      evidence: evidence.evidence,
      paid: false,
      financial_execution: false,
      amount_usd: 0,
    }));
    return 0;
  }

  try {
    const outcome = gateOutcome(order);
    const receipt = buildReceipt(order, outcome);
    const target = ledgerPath
      ? (isAbsolute(ledgerPath) ? ledgerPath : resolve(REPO_ROOT, ledgerPath))
      : resolve(REPO_ROOT, DEFAULT_LEDGER_PATH);
    const result = appendReceipt(target, receipt);
    console.log(JSON.stringify({
      ok: true,
      state: receipt.state,
      reason: receipt.reason,
      ledger: target,
      appended: result.appended,
      duplicate: result.duplicate,
      receipt_sha256: result.receipt_sha256,
      order_sha256: receipt.order_sha256,
      paid: false,
      financial_execution: false,
      amount_usd: 0,
    }));
    return receipt.state === 'accepted' ? 0 : 1;
  } catch (error) {
    console.log(JSON.stringify({
      ok: false,
      state: 'refused',
      reason: error.code || 'invalid_receipt_or_ledger',
      detail: String(error.message).slice(0, 300),
      paid: false,
      financial_execution: false,
      amount_usd: 0,
    }));
    return 1;
  }
}

const invoked = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href === import.meta.url
  : false;
if (invoked) process.exitCode = main(process.argv.slice(2));
