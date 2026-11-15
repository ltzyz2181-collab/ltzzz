#!/usr/bin/env node
// LTZZZ AI-hires-AI Phase1 v0 — in-repo closed loop only.
// Hire order spec + machine-runnable acceptance gate + append-only receipt ledger + refusal right.
// No money, no credentials, no production writes: those orders must be refused with needs_owner_decision.
import {createHash} from 'node:crypto';
import {appendFileSync, existsSync, mkdirSync, readFileSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

export const PHASE1_REVISION = 'hire-phase1-v0';
export const ORDER_KEYS = ['order_id', 'role', 'objective', 'acceptance_gate', 'evidence_paths', 'rollback', 'salary', 'seat'];
export const REQUIRED = ['order_id', 'role', 'objective', 'acceptance_gate', 'evidence_paths', 'rollback', 'seat'];
// A model seat may never accept an order that touches money, signing, credentials or a production write.
export const FORBIDDEN_INTENT = ['funding', 'signing', 'wallet', 'safe', 'disbursement', 'loan', 'credential', 'secret', 'production_write', 'deploy_production'];
export const RECEIPT_STATES = new Set(['accepted', 'refused', 'needs_owner_decision']);

const ID = /^[A-Za-z0-9._-]{6,120}$/;
const sha256 = (s) => createHash('sha256').update(String(s)).digest('hex');

export function validateOrder(order) {
  const problems = [];
  if (!order || typeof order !== 'object' || Array.isArray(order)) return ['order_not_an_object'];
  for (const k of Object.keys(order)) if (!ORDER_KEYS.includes(k)) problems.push('unknown_field:' + k);
  for (const k of REQUIRED) if (typeof order[k] !== 'string' || !order[k].trim()) problems.push('missing_or_empty:' + k);
  if (order.order_id && !ID.test(order.order_id)) problems.push('invalid_order_id');
  if (Array.isArray(order.evidence_paths) || typeof order.evidence_paths !== 'string') problems.push('invalid_evidence_paths');
  if (order.salary !== undefined && order.salary !== null && order.salary !== 'none') problems.push('salary_must_be_none_in_phase1');
  if (order.acceptance_gate) {
    if (!order.acceptance_gate.startsWith('node ')) problems.push('gate_must_start_with_node');
    if (/[;&|`$><]/.test(order.acceptance_gate)) problems.push('gate_must_be_single_command_no_shell_metacharacters');
  }
  return problems;
}

export function classifyIntent(text) {
  const low = String(text || '').toLowerCase();
  return FORBIDDEN_INTENT.filter((w) => low.includes(w));
}

export function gateOutcome(order, {runner = defaultRunner} = {}) {
  if (classifyIntent(order.objective + ' ' + order.acceptance_gate).length) {
    return {state: 'needs_owner_decision', reason: 'forbidden_intent:' + classifyIntent(order.objective + ' ' + order.acceptance_gate).join(',')};
  }
  try {
    runner(order.acceptance_gate);
    return {state: 'accepted', reason: 'gate_exit_0'};
  } catch (e) {
    return {state: 'refused', reason: 'gate_failed:' + String(e && e.message ? e.message : e).slice(0, 200)};
  }
}

function defaultRunner(gate) {
  // Quote-aware tokenising so `node -e "process.exit(7)"` keeps its script intact.
  const tokens = gate.match(/"([^"]*)"|'([^']*)'|\S+/g) || [];
  const argv = tokens.slice(1).map((t) => t.replace(/^["']|["']$/g, ''));
  execFileSync(process.execPath, argv, {stdio: 'pipe', encoding: 'utf8', timeout: 180000});
}

export function buildReceipt(order, outcome, {at = new Date().toISOString()} = {}) {
  if (!RECEIPT_STATES.has(outcome.state)) throw Error('invalid_receipt_state');
  const body = {
    order_id: order.order_id,
    role: order.role,
    seat: order.seat,
    state: outcome.state,
    reason: outcome.reason,
    acceptance_gate: order.acceptance_gate,
    evidence_paths: order.evidence_paths,
    rollback: order.rollback,
    order_sha256: sha256(JSON.stringify(order)),
    revision: PHASE1_REVISION,
    at,
    paid: false,
    financial_execution: false,
    amount_usd: 0
  };
  return {...body, receipt_sha256: sha256(JSON.stringify(body))};
}

export function appendReceipt(ledgerPath, receipt) {
  if (!RECEIPT_STATES.has(receipt.state)) throw Error('invalid_receipt_state');
  if (receipt.paid !== false || receipt.financial_execution !== false) throw Error('phase1_must_not_pay');
  mkdirSync(dirname(ledgerPath), {recursive: true});
  appendFileSync(ledgerPath, JSON.stringify(receipt) + '\n', 'utf8');
  return ledgerPath;
}

export function readLedger(ledgerPath) {
  if (!existsSync(ledgerPath)) return [];
  return readFileSync(ledgerPath, 'utf8').split('\n').filter(Boolean).map((l, i) => {
    const r = JSON.parse(l);
    if (!RECEIPT_STATES.has(r.state)) throw Error('invalid_ledger_line_' + (i + 1));
    return r;
  });
}

// Append-only: a ledger may hold many states for one order, but an accepted receipt can never be rewritten.
export function assertAppendOnly(previous, next) {
  const accepted = previous.filter((r) => r.order_id === next.order_id && r.state === 'accepted');
  if (accepted.length && next.state !== 'accepted') throw Error('accepted_order_cannot_be_downgraded');
  return true;
}

function main(argv) {
  const [cmd, orderPath, ledgerPath] = argv;
  if (!['validate', 'run'].includes(cmd)) {
    console.error('usage: node scripts/hire-phase1.mjs validate|run <order.json> [ledger.jsonl]');
    process.exit(2);
  }
  const order = JSON.parse(readFileSync(resolve(orderPath), 'utf8'));
  const problems = validateOrder(order);
  if (problems.length) {
    console.log(JSON.stringify({ok: false, state: 'refused', reason: 'invalid_order', problems}));
    process.exit(1);
  }
  if (cmd === 'validate') {
    console.log(JSON.stringify({ok: true, state: 'spec_valid', order_id: order.order_id, revision: PHASE1_REVISION}));
    return;
  }
  const outcome = gateOutcome(order);
  const receipt = buildReceipt(order, outcome);
  const target = resolve(ledgerPath || 'knowledge/results/hire/ledger.jsonl');
  appendReceipt(target, receipt);
  console.log(JSON.stringify({ok: true, state: receipt.state, reason: receipt.reason, ledger: target, receipt_sha256: receipt.receipt_sha256}));
  process.exit(receipt.state === 'accepted' ? 0 : 1);
}

if (process.argv[1] && process.argv[1].endsWith('hire-phase1.mjs')) main(process.argv.slice(2));
