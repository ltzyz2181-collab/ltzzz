import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdirSync, mkdtempSync, readFileSync, symlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {
  ACCEPTANCE_GATE_ALLOWLIST,
  PHASE1_REVISION,
  REPO_ROOT,
  appendReceipt,
  assertAppendOnly,
  buildReceipt,
  gateOutcome,
  readLedger,
  validateEvidence,
  validateOrder,
  verifyReceipt,
} from '../hire-phase1.mjs';

const EVIDENCE = 'docs/HIRE-AI-PHASE1-SPEC-20261116.md';

const baseOrder = (overrides = {}) => ({
  order_id: 'HIRE-TEST-20261116-01',
  idempotency_key: 'HIRE-TEST-20261116-01.attempt-1',
  role: 'repo_audit_seat',
  objective: 'read docs and report broken links',
  acceptance_gate: 'phase1-smoke',
  evidence_paths: [EVIDENCE],
  rollback: 'git revert',
  salary: 'none',
  seat: 'doubao',
  ...overrides,
});

const tempLedger = () => join(mkdtempSync(join(tmpdir(), 'hire-phase1-')), 'ledger.jsonl');

const receipt = (overrides = {}, outcome = {state: 'accepted', reason: 'gate_exit_0'}, options = {}) => (
  buildReceipt(baseOrder(overrides), outcome, {at: '2026-11-16T00:00:00.000Z', ...options})
);

const rewriteLedger = (path, mutate) => {
  const rows = readFileSync(path, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  mutate(rows);
  writeFileSync(path, `${rows.map(row => JSON.stringify(row)).join('\n')}\n`);
};

// ---------- 1. acceptance_gate allowlist ----------

test('acceptance_gate accepts only the explicit allowlist', () => {
  assert.deepEqual(validateOrder(baseOrder()), []);
  assert.ok(Object.hasOwn(ACCEPTANCE_GATE_ALLOWLIST, 'phase1-smoke'));

  const rejected = [
    'node -e "process.exit(0)"',
    'node -e "require(\'fs\').rmSync(\'x\')"',
    'node scripts/hire-phase1.mjs',
    'bash -c "rm -rf /"',
    'phase1-smoke --extra',
    '',
  ];
  for (const acceptance_gate of rejected) {
    const problems = validateOrder(baseOrder({acceptance_gate}));
    assert.ok(
      problems.some(problem => problem.startsWith('gate_not_allowlisted') || problem === 'missing_or_empty:acceptance_gate'),
      `expected ${JSON.stringify(acceptance_gate)} to be rejected, got ${problems.join(',')}`,
    );
  }
});

test('disallowed gates and forbidden intent never reach the runner', () => {
  let calls = 0;
  const runner = () => { calls += 1; };

  const badGate = gateOutcome(baseOrder({acceptance_gate: 'node -e "process.exit(0)"'}), {runner});
  assert.equal(badGate.state, 'refused');
  assert.equal(badGate.reason, 'gate_not_allowlisted');

  const forbidden = gateOutcome(baseOrder({objective: 'move wallet funds and sign a tx'}), {runner});
  assert.equal(forbidden.state, 'needs_owner_decision');
  assert.match(forbidden.reason, /forbidden_intent/);

  assert.equal(calls, 0);
});

test('the allowlisted gate is deterministic and accepts the sample order', () => {
  const outcome = gateOutcome(baseOrder());
  assert.deepEqual(outcome, {state: 'accepted', reason: 'gate_exit_0'});
});

// ---------- 2. evidence path validation and SHA-256 ----------

test('evidence must live in an allowed repo directory and exist', () => {
  const missing = validateOrder(baseOrder({evidence_paths: ['docs/__missing_hire_evidence__.md']}));
  assert.ok(missing.includes('missing_evidence_file:docs/__missing_hire_evidence__.md'));

  const outside = validateOrder(baseOrder({evidence_paths: ['scripts/hire-phase1.mjs']}));
  assert.ok(outside.includes('evidence_path_not_allowed:scripts/hire-phase1.mjs'));

  const absolute = validateOrder(baseOrder({evidence_paths: ['/etc/passwd']}));
  assert.ok(absolute.includes('invalid_evidence_path:/etc/passwd'));

  const empty = validateOrder(baseOrder({evidence_paths: []}));
  assert.ok(empty.includes('missing_or_empty:evidence_paths'));
});

test('path traversal is rejected before the filesystem is touched', () => {
  for (const path of ['../etc/passwd', 'docs/../../etc/passwd']) {
    const problems = validateOrder(baseOrder({evidence_paths: [path]}));
    assert.ok(
      problems.includes(`evidence_path_traversal:${path}`),
      `expected traversal ${JSON.stringify(path)} to be rejected, got ${problems.join(',')}`,
    );
  }

  // Escaping docs/ into another repo directory must also be rejected, even
  // though normalization leaves it inside the repository.
  for (const path of ['docs/../scripts/hire-phase1.mjs', 'docs\\..\\..\\etc\\passwd']) {
    const problems = validateOrder(baseOrder({evidence_paths: [path]}));
    assert.ok(problems.length > 0, `expected ${JSON.stringify(path)} to be rejected`);
  }
});

test('symlinked evidence is rejected even when the link target is readable', () => {
  const root = mkdtempSync(join(tmpdir(), 'hire-evidence-root-'));
  mkdirSync(join(root, 'docs'));
  const outside = join(root, 'outside.txt');
  writeFileSync(outside, 'outside');
  symlinkSync(outside, join(root, 'docs', 'link.md'));

  const result = validateEvidence({evidence_paths: ['docs/link.md']}, {root});
  assert.equal(result.ok, false);
  assert.ok(result.problems.includes('symlink_evidence_forbidden:docs/link.md'));
});

test('accepted evidence records path, real byte SHA-256 and size', () => {
  const result = validateEvidence({evidence_paths: [EVIDENCE]});
  assert.equal(result.ok, true, result.problems.join(','));
  assert.equal(result.evidence.length, 1);

  const bytes = readFileSync(join(REPO_ROOT, EVIDENCE));
  const expected = createHash('sha256').update(bytes).digest('hex');
  assert.deepEqual(result.evidence[0], {path: EVIDENCE, sha256: expected, bytes: bytes.length});

  const built = receipt();
  assert.deepEqual(built.evidence, result.evidence);
});

// ---------- 3. receipt hashes and zero-fund invariants ----------

test('a fresh receipt is self-consistent and never pays', () => {
  const built = receipt();
  assert.equal(verifyReceipt(built), true);
  assert.equal(built.revision, PHASE1_REVISION);
  assert.match(built.receipt_sha256, /^[0-9a-f]{64}$/);
  assert.match(built.order_sha256, /^[0-9a-f]{64}$/);
  assert.equal(built.paid, false);
  assert.equal(built.financial_execution, false);
  assert.equal(built.amount_usd, 0);
});

test('receipt and order hash tampering is rejected', () => {
  const receiptTamper = receipt();
  receiptTamper.receipt_sha256 = '0'.repeat(64);
  assert.throws(() => verifyReceipt(receiptTamper), /receipt_sha256_mismatch/);

  const orderTamper = receipt();
  orderTamper.order.objective = 'read docs and report different links';
  assert.throws(() => verifyReceipt(orderTamper), /order_sha256_mismatch/);

  const evidenceTamper = receipt();
  evidenceTamper.evidence[0].sha256 = '0'.repeat(64);
  assert.throws(() => verifyReceipt(evidenceTamper), /receipt_sha256_mismatch/);
});

test('paid, financial_execution and amount_usd invariants are enforced on append', () => {
  const ledger = tempLedger();

  const paid = receipt();
  paid.paid = true;
  assert.throws(() => appendReceipt(ledger, paid), /phase1_must_not_pay/);

  const executed = receipt();
  executed.financial_execution = true;
  assert.throws(() => appendReceipt(ledger, executed), /phase1_must_not_pay/);

  const spent = receipt();
  spent.amount_usd = 1;
  assert.throws(() => appendReceipt(ledger, spent), /phase1_must_not_spend/);
});

// ---------- 4. idempotency and append-only ----------

test('re-running the same order does not double-book', () => {
  const ledger = tempLedger();
  const first = appendReceipt(ledger, receipt());
  assert.equal(first.appended, true);

  // Same immutable order, fresh timestamp: a replay, not a second execution.
  const replay = buildReceipt(baseOrder(), {state: 'accepted', reason: 'gate_exit_0'});
  assert.notEqual(replay.receipt_sha256, receipt().receipt_sha256);

  const second = appendReceipt(ledger, replay);
  assert.equal(second.appended, false);
  assert.equal(second.duplicate, true);
  assert.equal(readLedger(ledger).length, 1);
});

test('a reused idempotency key or order_id cannot create a second row', () => {
  const ledger = tempLedger();
  const first = receipt({}, {state: 'refused', reason: 'gate_failed:first'});
  appendReceipt(ledger, first);

  assert.throws(
    () => assertAppendOnly(readLedger(ledger), receipt({idempotency_key: 'HIRE-TEST-20261116-01.attempt-2'}, {state: 'refused', reason: 'gate_failed:first'})),
    /order_id_conflict/,
  );
  assert.throws(
    () => assertAppendOnly(readLedger(ledger), receipt({objective: 'read docs and report other links'}, {state: 'refused', reason: 'gate_failed:first'})),
    /idempotency_key_conflict/,
  );
  assert.equal(readLedger(ledger).length, 1);
});

test('accepted is terminal: it cannot be downgraded or replayed as another state', () => {
  const ledger = tempLedger();
  appendReceipt(ledger, receipt());

  const downgrade = buildReceipt(baseOrder(), {state: 'refused', reason: 'later'});
  assert.throws(() => assertAppendOnly(readLedger(ledger), downgrade), /accepted_order_is_terminal/);
  assert.throws(() => appendReceipt(ledger, downgrade), /accepted_order_is_terminal/);
  assert.equal(readLedger(ledger).length, 1);
});

// ---------- 5. readLedger integrity ----------

test('readLedger rejects tampered receipt_sha256, order_sha256 and paid flags', () => {
  const receiptLedger = tempLedger();
  appendReceipt(receiptLedger, receipt());
  rewriteLedger(receiptLedger, rows => { rows[0].receipt_sha256 = '0'.repeat(64); });
  assert.throws(() => readLedger(receiptLedger), /invalid_ledger_line_1:receipt_sha256_mismatch/);

  const orderLedger = tempLedger();
  appendReceipt(orderLedger, receipt());
  rewriteLedger(orderLedger, rows => { rows[0].order.objective = 'tampered'; });
  assert.throws(() => readLedger(orderLedger), /invalid_ledger_line_1:order_sha256_mismatch/);

  const paidLedger = tempLedger();
  appendReceipt(paidLedger, receipt());
  rewriteLedger(paidLedger, rows => { rows[0].paid = true; });
  assert.throws(() => readLedger(paidLedger), /invalid_ledger_line_1:phase1_must_not_pay/);

  const spentLedger = tempLedger();
  appendReceipt(spentLedger, receipt());
  rewriteLedger(spentLedger, rows => { rows[0].amount_usd = 1; });
  assert.throws(() => readLedger(spentLedger), /invalid_ledger_line_1:phase1_must_not_spend/);
});

test('readLedger rejects duplicate keys, duplicate orders and accepted downgrades', () => {
  const duplicateKey = tempLedger();
  appendReceipt(duplicateKey, receipt());
  const duplicateRow = JSON.parse(readFileSync(duplicateKey, 'utf8').trim());
  writeFileSync(duplicateKey, `${JSON.stringify(duplicateRow)}\n${JSON.stringify(duplicateRow)}\n`);
  assert.throws(() => readLedger(duplicateKey), /invalid_ledger_line_2:duplicate_idempotency_key/);

  const duplicateOrder = tempLedger();
  appendReceipt(duplicateOrder, receipt());
  const otherKey = receipt(
    {idempotency_key: 'HIRE-TEST-20261116-01.attempt-2'},
    {state: 'refused', reason: 'gate_failed:second'},
  );
  writeFileSync(duplicateOrder, `${JSON.stringify(duplicateRow)}\n${JSON.stringify(otherKey)}\n`);
  assert.throws(() => readLedger(duplicateOrder), /invalid_ledger_line_2:duplicate_order_id/);
});

test('normal ledger round-trips', () => {
  const ledger = tempLedger();
  appendReceipt(ledger, receipt());
  appendReceipt(ledger, receipt(
    {
      order_id: 'HIRE-TEST-20261116-02',
      idempotency_key: 'HIRE-TEST-20261116-02.attempt-1',
      objective: 'move wallet funds and sign a tx',
    },
    {state: 'needs_owner_decision', reason: 'forbidden_intent:safe'},
  ));
  const rows = readLedger(ledger);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map(row => row.state), ['accepted', 'needs_owner_decision']);
});
