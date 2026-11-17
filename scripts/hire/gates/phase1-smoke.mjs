#!/usr/bin/env node
// Harness self-check gate for AI-hire Phase1.
//
// This gate proves that the harness itself still behaves. It deliberately does
// NOT accept an order: "the source file contains a marker" is not evidence that
// a deliverable exists. Order acceptance belongs to `deliverable-audit`.
//
// Contract:
// - deterministic, read-only with respect to the repository;
// - no network, no credentials, no money;
// - exits 0 only when every behavioural assertion below holds.
import {
  ACCEPTANCE_GATE_ALLOWLIST,
  GATE_KINDS,
  buildReceipt,
  canonicalJson,
  classifyIntent,
  hashObject,
  resolveLedgerPath,
  validateOrder,
} from '../../hire-phase1.mjs';

const GATE_ID = 'phase1-smoke';
const checks = [];

function check(id, fn) {
  try {
    fn();
    checks.push({id, ok: true, detail: 'ok'});
  } catch (error) {
    checks.push({id, ok: false, detail: String(error?.message ?? error).slice(0, 200)});
  }
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const sampleOrder = () => ({
  order_id: 'HIRE-SELFCHECK-0001',
  idempotency_key: 'HIRE-SELFCHECK-0001.attempt-1',
  role: 'harness_self_check',
  objective: 'read docs and report broken links',
  acceptance_gate: 'deliverable-audit',
  acceptance_criteria: [
    {id: 'size', kind: 'file_min_bytes', path: 'docs/HIRE-AI-PHASE1-SPEC-20261116.md', min_bytes: 1},
    {id: 'content', kind: 'contains_all', path: 'docs/HIRE-AI-PHASE1-SPEC-20261116.md', needles: ['Phase1']},
  ],
  evidence_paths: ['docs/HIRE-AI-PHASE1-SPEC-20261116.md'],
  rollback: 'delete this probe order',
  salary: 'none',
  seat: 'claude',
});

// 1. Gate identity is explicit and both kinds exist.
check('gate-kinds', () => {
  for (const [id, gate] of Object.entries(ACCEPTANCE_GATE_ALLOWLIST)) {
    assert(GATE_KINDS.includes(gate.kind), `gate ${id} has unknown kind ${gate.kind}`);
  }
  assert(ACCEPTANCE_GATE_ALLOWLIST['deliverable-audit']?.kind === 'order_acceptance', 'order acceptance gate missing');
  assert(ACCEPTANCE_GATE_ALLOWLIST[GATE_ID]?.kind === 'harness_self_check', 'self-check gate has wrong kind');
});

// 2. A self-check gate can never accept an order.
check('selfcheck-gate-cannot-accept-order', () => {
  const problems = validateOrder({...sampleOrder(), acceptance_gate: GATE_ID});
  assert(problems.some(problem => problem.startsWith('gate_is_harness_self_check')), `expected rejection, got ${problems.join(',')}`);
});

// 3. Orders cannot inject a command as a gate.
check('gate-command-injection-rejected', () => {
  for (const acceptance_gate of ['node -e "process.exit(0)"', 'bash -c "rm -rf /"', 'deliverable-audit --evil']) {
    const problems = validateOrder({...sampleOrder(), acceptance_gate});
    assert(problems.some(problem => problem.startsWith('gate_not_allowlisted')), `${acceptance_gate} was not rejected`);
  }
});

// 4. Acceptance criteria are mandatory and must inspect content.
check('criteria-required', () => {
  const missing = validateOrder({...sampleOrder(), acceptance_criteria: undefined});
  assert(missing.includes('missing_or_empty:acceptance_criteria'), 'missing criteria accepted');
  const sizeOnly = validateOrder({...sampleOrder(), acceptance_criteria: [{id: 'size', kind: 'file_min_bytes', path: 'docs/HIRE-AI-PHASE1-SPEC-20261116.md', min_bytes: 1}]});
  assert(sizeOnly.includes('acceptance_criteria_missing_content_check'), 'size-only criteria accepted');
});

// 5. English and Chinese funding / production intent is refused.
check('forbidden-intent-en-zh', () => {
  const forbidden = ['transfer money', 'withdraw funds', 'send payment', 'sign transaction', 'deploy to production', 'modify production configuration', '从 Safe 钱包转出资金并签名一笔交易', '部署到生产环境'];
  for (const text of forbidden) {
    assert(classifyIntent(text).length > 0, `not refused: ${text}`);
  }
  assert(classifyIntent('read docs and report broken links').length === 0, 'harmless objective was refused');
});

// 6. Canonical hashing is order-independent.
check('canonical-json', () => {
  assert(canonicalJson({b: 1, a: 2}) === canonicalJson({a: 2, b: 1}), 'key order changed the hash input');
  assert(/^[0-9a-f]{64}$/.test(hashObject({a: 1})), 'hash is not sha256 hex');
});

// 7. The ledger path stays inside knowledge/results/hire/.
check('ledger-path-confined', () => {
  const rejected = ['/tmp/ledger.jsonl', '../ledger.jsonl', 'knowledge/results/hire/../../x.jsonl', 'knowledge/results/ledger.jsonl', 'knowledge\\results\\hire\\x.jsonl'];
  for (const candidate of rejected) {
    let threw = false;
    try { resolveLedgerPath(candidate); } catch { threw = true; }
    assert(threw, `escape path accepted: ${candidate}`);
  }
  assert(resolveLedgerPath(undefined).replaceAll('\\', '/').endsWith('knowledge/results/hire/ledger-v1.jsonl'), 'default ledger path changed');
});

// 8. An "accepted" receipt cannot be manufactured without a passing gate.
check('accepted-requires-gate', () => {
  let threw = false;
  try {
    buildReceipt(sampleOrder(), {state: 'accepted', reason: 'gate_exit_0'});
  } catch (error) {
    threw = /accepted_without_gate_pass|receipt_gate_missing/.test(String(error?.message));
  }
  assert(threw, 'accepted receipt was built without a gate result');
});

const ok = checks.every(item => item.ok);
process.stdout.write(`${JSON.stringify({
  schema: 'ltzzz.hire-gate.v1',
  gate: GATE_ID,
  ok,
  checks,
  paid: false,
  financial_execution: false,
  amount_usd: 0,
})}\n`);
if (!ok) {
  for (const item of checks.filter(entry => !entry.ok)) {
    process.stderr.write(`phase1-smoke: failed: ${item.id}: ${item.detail}\n`);
  }
  process.exit(1);
}
