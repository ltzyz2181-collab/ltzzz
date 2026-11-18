import {after, test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
  writeSync,
} from 'node:fs';
import {tmpdir} from 'node:os';
import {basename, dirname, join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {
  ACCEPTANCE_GATE_ALLOWLIST,
  PHASE1_REVISION,
  REPO_ROOT,
  acquireLedgerLock,
  appendReceipt,
  assertAppendOnly,
  buildReceipt,
  canonicalJson,
  classifyIntent,
  gateOutcome,
  hashObject,
  normalizeOrder,
  readLedger,
  readLockState,
  reclaimStaleLock,
  resolveLedgerPath,
  validateAcceptanceCriteria,
  validateEvidence,
  validateOrder,
  verifyGateResult,
  verifyReceipt,
} from '../hire-phase1.mjs';

const DELIVERABLE = 'knowledge/results/hire/deliverables/HIRE-SAMPLE-20261116-01-report.md';
const SPEC = 'docs/HIRE-AI-PHASE1-SPEC-20261116.md';
const SAMPLE_ACCEPTED = 'ops/hire/orders/HIRE-SAMPLE-20261116-01.json';
const SAMPLE_FORBIDDEN = 'ops/hire/orders/HIRE-SAMPLE-20261116-02-forbidden.json';
const CLI = join(REPO_ROOT, 'scripts', 'hire-phase1.mjs');
const MODULE_URL = pathToFileURL(join(REPO_ROOT, 'scripts', 'hire-phase1.mjs')).href;
const FIXED_AT = '2026-11-16T00:00:00.000Z';

const baseOrder = (overrides = {}) => ({
  order_id: 'HIRE-TEST-20261116-01',
  idempotency_key: 'HIRE-TEST-20261116-01.attempt-1',
  role: 'repo_audit_seat',
  objective: 'read docs and report broken links',
  acceptance_gate: 'deliverable-audit',
  acceptance_criteria: [
    {id: 'size', kind: 'file_min_bytes', path: DELIVERABLE, min_bytes: 1},
    {id: 'structure', kind: 'markdown_headings', path: DELIVERABLE, min_count: 3},
  ],
  evidence_paths: [DELIVERABLE],
  rollback: 'git revert',
  salary: 'none',
  seat: 'doubao',
  ...overrides,
});

// appendReceipt() now enforces the write boundary itself, so a temp ledger must
// also be a valid repo-relative ledger path: a unique dot-file directly under
// knowledge/results/hire/ (the ledger pattern allows no subdirectory). The
// relative path resolves against REPO_ROOT, not the process cwd.
const tempLedgers = [];
const tempLedger = () => {
  const rel = `knowledge/results/hire/.tmp-${process.pid}-${randomBytes(6).toString('hex')}.jsonl`;
  tempLedgers.push(rel);
  return rel;
};
after(() => {
  for (const rel of tempLedgers) {
    for (const suffix of ['', '.lock', '.lock.reclaim']) {
      rmSync(join(REPO_ROOT, `${rel}${suffix}`), {force: true});
    }
  }
});

// An `accepted` receipt can only come from a real gate run; that is the point
// of the v1.1 repair, so the tests never manufacture one.
const acceptReceipt = (overrides = {}) => {
  const order = baseOrder(overrides);
  const outcome = gateOutcome(order);
  assert.equal(outcome.state, 'accepted', `expected the gate to accept, got ${outcome.reason}`);
  return buildReceipt(order, outcome, {at: FIXED_AT});
};

const refuseReceipt = (overrides = {}) => {
  const order = baseOrder(overrides);
  return buildReceipt(order, {
    state: 'refused',
    reason: 'gate_failed:synthetic',
    gate: {id: order.acceptance_gate, kind: 'order_acceptance', ran: true, ok: false, output_sha256: '0'.repeat(64)},
  }, {at: FIXED_AT});
};

// Fixtures must live inside the allowed evidence roots, so they are created
// under knowledge/results/hire/ and removed afterwards.
const repoFixtures = (t) => {
  const dir = mkdtempSync(join(REPO_ROOT, 'knowledge', 'results', 'hire', '.tmp-'));
  const rel = `knowledge/results/hire/${basename(dir)}`;
  t.after(() => rmSync(dir, {recursive: true, force: true}));
  const write = (name, content) => {
    writeFileSync(join(dir, name), content);
    return `${rel}/${name}`;
  };
  return {dir, rel, write};
};

const runCli = (args) => spawnSync(process.execPath, [CLI, ...args], {
  cwd: REPO_ROOT,
  encoding: 'utf8',
  timeout: 120000,
});

const runChild = (code, env) => new Promise((resolveRun) => {
  const child = spawn(process.execPath, ['--input-type=module', '-e', code], {
    cwd: REPO_ROOT,
    env: {...process.env, MODULE_URL, ...env},
  });
  let stdout = '';
  let stderr = '';
  child.stdout.on('data', (chunk) => { stdout += chunk; });
  child.stderr.on('data', (chunk) => { stderr += chunk; });
  child.on('close', (status) => resolveRun({status, stdout, stderr}));
});

const APPEND_CHILD = `
const {buildReceipt, gateOutcome, appendReceipt} = await import(process.env.MODULE_URL);
const order = JSON.parse(process.env.HIRE_ORDER);
const receipt = buildReceipt(order, gateOutcome(order), {at: new Date().toISOString()});
const result = appendReceipt(process.env.HIRE_LEDGER, receipt);
process.stdout.write(JSON.stringify({state: receipt.state, appended: result.appended, duplicate: result.duplicate}));
`;

// ---------- 1. order structure ----------

test('order structure: required fields, unknown fields and the phase1 salary rule', () => {
  assert.deepEqual(validateOrder(baseOrder()), []);
  assert.ok(validateOrder({...baseOrder(), extra: 'x'}).includes('unknown_field:extra'));
  assert.ok(validateOrder({...baseOrder(), idempotency_key: undefined}).includes('missing_or_empty:idempotency_key'));
  assert.ok(validateOrder({...baseOrder(), salary: '10usd'}).includes('salary_must_be_none_in_phase1'));
  assert.ok(validateOrder(baseOrder({order_id: 'short'})).includes('invalid_order_id'));
});

test('order structure: acceptance criteria are mandatory, content-bearing and bound to evidence', () => {
  assert.ok(validateOrder({...baseOrder(), acceptance_criteria: undefined}).includes('missing_or_empty:acceptance_criteria'));
  assert.ok(validateOrder({...baseOrder(), acceptance_criteria: []}).includes('missing_or_empty:acceptance_criteria'));

  const sizeOnly = validateOrder(baseOrder({
    acceptance_criteria: [{id: 'size', kind: 'file_min_bytes', path: DELIVERABLE, min_bytes: 1}],
  }));
  assert.ok(sizeOnly.includes('acceptance_criteria_missing_content_check'));

  const outsideEvidence = validateOrder(baseOrder({
    acceptance_criteria: [{id: 'other', kind: 'contains_all', path: SPEC, needles: ['Phase1']}],
  }));
  assert.ok(outsideEvidence.includes(`criterion_path_not_in_evidence_paths:${SPEC}`));

  assert.ok(validateAcceptanceCriteria([{id: 'x', kind: 'unknown', path: DELIVERABLE}], [DELIVERABLE])
    .includes('unknown_criterion_kind:unknown'));
  assert.ok(validateAcceptanceCriteria([
    {id: 'dup', kind: 'no_placeholder', path: DELIVERABLE},
    {id: 'dup', kind: 'no_placeholder', path: DELIVERABLE},
  ], [DELIVERABLE]).includes('duplicate_criterion_id:dup'));
  assert.ok(validateAcceptanceCriteria([{id: 'h', kind: 'sha256', path: DELIVERABLE, sha256: 'nothex'}], [DELIVERABLE])
    .includes('invalid_criterion_sha256'));
  assert.ok(validateAcceptanceCriteria([{id: 'c', kind: 'contains_all', path: DELIVERABLE, needles: []}], [DELIVERABLE])
    .includes('invalid_criterion_needles'));
});

// ---------- 2. gate reality: self-check vs order acceptance ----------

test('a harness self-check gate can never accept an order', () => {
  const problems = validateOrder(baseOrder({acceptance_gate: 'phase1-smoke'}));
  assert.ok(problems.includes('gate_is_harness_self_check:phase1-smoke'));
  assert.equal(ACCEPTANCE_GATE_ALLOWLIST['phase1-smoke'].kind, 'harness_self_check');
  assert.equal(ACCEPTANCE_GATE_ALLOWLIST['deliverable-audit'].kind, 'order_acceptance');
});

test('the harness self-check gate passes on the current repository', () => {
  const result = runCli(['selfcheck']);
  assert.equal(result.status, 0, result.stdout + result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, true);
  assert.ok(payload.result.checks.every(check => check.ok));
});

test('order acceptance reads the real deliverable and refuses an empty one', (t) => {
  const fixtures = repoFixtures(t);
  const empty = fixtures.write('empty.md', '');
  const outcome = gateOutcome(baseOrder({
    acceptance_criteria: [
      {id: 'size', kind: 'file_min_bytes', path: empty, min_bytes: 1},
      {id: 'no-placeholder', kind: 'no_placeholder', path: empty},
    ],
    evidence_paths: [empty],
  }));
  assert.equal(outcome.state, 'refused');
  assert.match(outcome.reason, /gate_failed/);
});

test('order acceptance refuses a whitespace-only or unfinished deliverable', (t) => {
  const fixtures = repoFixtures(t);
  const blank = fixtures.write('blank.md', '   \n\n\t\n');
  const blankOutcome = gateOutcome(baseOrder({
    acceptance_criteria: [{id: 'size', kind: 'file_min_bytes', path: blank, min_bytes: 1}],
    evidence_paths: [blank],
  }));
  assert.equal(blankOutcome.state, 'refused');

  const unfinished = fixtures.write('unfinished.md', '# report\n\nTODO: write the findings\n');
  const unfinishedOutcome = gateOutcome(baseOrder({
    acceptance_criteria: [{id: 'done', kind: 'no_placeholder', path: unfinished}],
    evidence_paths: [unfinished],
  }));
  assert.equal(unfinishedOutcome.state, 'refused');
});

test('order acceptance refuses a wrong deliverable that misses its declared content criteria', (t) => {
  const fixtures = repoFixtures(t);
  const wrong = fixtures.write('wrong.md', '# Something else\n\n## Unrelated\n\n## Still unrelated\n');
  const outcome = gateOutcome(baseOrder({
    acceptance_criteria: [
      {id: 'size', kind: 'file_min_bytes', path: wrong, min_bytes: 1},
      {id: 'headings', kind: 'markdown_headings', path: wrong, min_count: 3, headings: ['复核范围']},
    ],
    evidence_paths: [wrong],
  }));
  assert.equal(outcome.state, 'refused');
  assert.match(outcome.reason, /gate_failed/);
});

test('a forged gate result is never accepted by the harness', () => {
  const order = baseOrder();
  const evidence = validateEvidence(order).evidence;
  const good = {
    schema: 'ltzzz.hire-gate.v1',
    gate: 'deliverable-audit',
    order_id: order.order_id,
    order_sha256: hashObject(normalizeOrder(order)),
    ok: true,
    criteria: order.acceptance_criteria.map(item => ({id: item.id, kind: item.kind, ok: true, detail: ''})),
    evidence,
    paid: false,
    financial_execution: false,
    amount_usd: 0,
  };
  assert.equal(verifyGateResult(order, good).ok, true);

  const forgedOrderHash = {...good, order_sha256: '0'.repeat(64)};
  assert.equal(verifyGateResult(order, forgedOrderHash).ok, false);
  assert.match(gateOutcome(order, {runner: () => forgedOrderHash}).reason, /gate_output_invalid/);

  const missingCriterion = {...good, criteria: good.criteria.slice(1)};
  assert.match(gateOutcome(order, {runner: () => missingCriterion}).reason, /gate_output_invalid/);

  const paidGate = {...good, paid: true};
  assert.match(gateOutcome(order, {runner: () => paidGate}).reason, /gate_output_invalid/);

  const changingEvidence = {...good, evidence: [{...evidence[0], sha256: '1'.repeat(64)}]};
  assert.match(gateOutcome(order, {runner: () => changingEvidence}).reason, /gate_output_invalid/);
});

test('a model cannot declare accepted without a passing gate result', () => {
  assert.throws(() => buildReceipt(baseOrder(), {state: 'accepted', reason: 'gate_exit_0'}), /receipt_gate_missing/);
  assert.throws(
    () => buildReceipt(baseOrder(), {
      state: 'accepted',
      reason: 'gate_exit_0',
      gate: {id: 'deliverable-audit', kind: 'order_acceptance', ran: false, ok: false, output_sha256: '0'.repeat(64)},
    }),
    /accepted_without_gate_pass/,
  );
  assert.throws(
    () => buildReceipt(baseOrder(), {
      state: 'accepted',
      reason: 'gate_exit_0',
      gate: {id: 'deliverable-audit', kind: 'harness_self_check', ran: true, ok: true, output_sha256: '0'.repeat(64)},
    }),
    /accepted_by_non_acceptance_gate/,
  );
  const partial = acceptReceipt();
  partial.gate.criteria = partial.gate.criteria.slice(1);
  assert.throws(() => verifyReceipt(partial), /accepted_without_full_criteria/);
});

// ---------- 3. command injection ----------

test('orders cannot inject a command, an argument or node -e as the gate', () => {
  const rejected = [
    'node -e "process.exit(0)"',
    'bash -c "rm -rf /"',
    'deliverable-audit --extra',
    'deliverable-audit; rm -rf /',
    '',
  ];
  for (const acceptance_gate of rejected) {
    const problems = validateOrder(baseOrder({acceptance_gate}));
    assert.ok(
      problems.some(problem => problem.startsWith('gate_not_allowlisted') || problem === 'missing_or_empty:acceptance_gate'),
      `${JSON.stringify(acceptance_gate)} was not rejected: ${problems.join(',')}`,
    );
  }
});

test('a sensitive order never reaches the gate runner', () => {
  let calls = 0;
  const runner = () => { calls += 1; return {}; };
  const outcome = gateOutcome(baseOrder({objective: 'transfer money to the ops wallet'}), {runner});
  assert.equal(outcome.state, 'needs_owner_decision');
  assert.equal(outcome.gate.ran, false);
  assert.equal(calls, 0);
});

test('the order file itself cannot escape ops/hire/orders', () => {
  const result = runCli(['validate', '../etc/passwd']);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /order_file_outside_orders_dir/);
});

// ---------- 4. English and Chinese funding / production refusal ----------

test('English funding, signing and production phrases are refused', () => {
  const phrases = [
    'transfer money',
    'transfer the funds',
    'withdraw funds',
    'withdrawing money',
    'send payment',
    'sending a payment',
    'sign transaction',
    'signing a transaction',
    'deploy to production',
    'deploying into production',
    'modify production configuration',
    'update the production config',
    'rotate production secrets',
    'transfer_money',
    'TRANSFER   MONEY',
  ];
  for (const phrase of phrases) {
    assert.ok(classifyIntent(phrase).length > 0, `not refused: ${JSON.stringify(phrase)}`);
  }
});

test('Chinese funding, signing and production phrases are refused', () => {
  const phrases = ['转账', '从 Safe 钱包转出资金并签名一笔交易', '部署到生产环境', '修改生产配置', '提现', '放款', '签署合约'];
  for (const phrase of phrases) {
    assert.ok(classifyIntent(phrase).length > 0, `not refused: ${phrase}`);
  }
});

test('split, synonym and invisible-character funding attempts are still refused', () => {
  const phrases = [
    '转 账', '付 款', '钱 包', '代付', '扣款', '划拨', '出钱', '打钱', '结算', '退款',
    'with draw funds', 'with_draw_funds', 'pay pal', 'pay out', 'cash out', 'top up',
    'payout 20 USDC', 'disburse the budget', 'reimburse the client', 'settle payment for invoice 7',
    'wal\u200Blet', 'wal\u00ADlet', '转\u2060账', 'ｗａｌｌｅｔ', 'send\u200Dpayment', 'transfer\u2060money',
  ];
  for (const phrase of phrases) assert.ok(classifyIntent(phrase).length > 0, 'not refused: ' + JSON.stringify(phrase));
});

test('harmless objectives are not refused, so the refusal is not a blunt keyword filter', () => {
  for (const text of ['read docs and report broken links', 'audit the Phase1 spec against the implementation', '整理文档目录']) {
    assert.deepEqual(classifyIntent(text), [], `over-refused: ${text}`);
  }
});

test('a refused English order becomes needs_owner_decision with no gate execution', () => {
  const ledger = tempLedger();
  const order = baseOrder({objective: 'deploy to production and update the production configuration'});
  const outcome = gateOutcome(order);
  assert.equal(outcome.state, 'needs_owner_decision');
  const receipt = buildReceipt(order, outcome, {at: FIXED_AT});
  appendReceipt(ledger, receipt);
  const [row] = readLedger(ledger);
  assert.equal(row.state, 'needs_owner_decision');
  assert.equal(row.gate.ran, false);
  assert.deepEqual(row.gate.criteria, []);
});

// ---------- 5. evidence path restriction and symlinks ----------

test('evidence must live in an allowed root and exist', () => {
  assert.ok(validateOrder(baseOrder({evidence_paths: ['docs/__missing_hire_evidence__.md']}))
    .includes('missing_evidence_file:docs/__missing_hire_evidence__.md'));
  assert.ok(validateOrder(baseOrder({evidence_paths: ['scripts/hire-phase1.mjs']}))
    .includes('evidence_path_not_allowed:scripts/hire-phase1.mjs'));
  assert.ok(validateOrder(baseOrder({evidence_paths: ['/etc/passwd']}))
    .includes('invalid_evidence_path:/etc/passwd'));
  assert.ok(validateOrder(baseOrder({evidence_paths: []})).includes('missing_or_empty:evidence_paths'));
});

test('path traversal is rejected before the filesystem is touched', () => {
  for (const path of ['../etc/passwd', 'docs/../../etc/passwd', 'docs\\..\\..\\etc\\passwd']) {
    assert.ok(validateOrder(baseOrder({evidence_paths: [path]})).length > 0, `${JSON.stringify(path)} was accepted`);
  }
});

test('symlinked evidence is rejected even when the target is readable', (t) => {
  const fixtures = repoFixtures(t);
  const outside = join(tmpdir(), `hire-outside-${process.pid}.txt`);
  writeFileSync(outside, 'outside');
  t.after(() => rmSync(outside, {force: true}));
  symlinkSync(outside, join(fixtures.dir, 'link.md'));

  const result = validateEvidence({evidence_paths: [`${fixtures.rel}/link.md`]});
  assert.equal(result.ok, false);
  assert.ok(result.problems.includes(`symlink_evidence_forbidden:${fixtures.rel}/link.md`));
});

test('a symlinked directory cannot redirect evidence outside the allowed root', (t) => {
  const fixtures = repoFixtures(t);
  const outsideDir = mkdtempSync(join(tmpdir(), 'hire-outside-dir-'));
  t.after(() => rmSync(outsideDir, {recursive: true, force: true}));
  writeFileSync(join(outsideDir, 'secret.md'), 'secret');
  symlinkSync(outsideDir, join(fixtures.dir, 'linked-dir'));

  const result = validateEvidence({evidence_paths: [`${fixtures.rel}/linked-dir/secret.md`]});
  assert.equal(result.ok, false);
  assert.ok(result.problems.some(problem => /symlink|realpath/.test(problem)), result.problems.join(','));
});

// ---------- 6. hashes ----------

test('accepted evidence records the real byte hash and size', () => {
  const result = validateEvidence({evidence_paths: [DELIVERABLE]});
  assert.equal(result.ok, true, result.problems.join(','));
  const bytes = readFileSync(join(REPO_ROOT, DELIVERABLE));
  assert.deepEqual(result.evidence[0], {
    path: DELIVERABLE,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
  });
});

test('receipt, order, evidence and gate tampering are rejected', () => {
  const receiptTamper = acceptReceipt();
  receiptTamper.receipt_sha256 = '0'.repeat(64);
  assert.throws(() => verifyReceipt(receiptTamper), /receipt_sha256_mismatch/);

  const orderTamper = acceptReceipt();
  orderTamper.order.objective = 'read docs and report different links';
  assert.throws(() => verifyReceipt(orderTamper), /order_sha256_mismatch/);

  const evidenceTamper = acceptReceipt();
  evidenceTamper.evidence[0].sha256 = '0'.repeat(64);
  assert.throws(() => verifyReceipt(evidenceTamper), /receipt_sha256_mismatch/);

  const gateTamper = acceptReceipt();
  gateTamper.gate.output_sha256 = '0'.repeat(64);
  assert.throws(() => verifyReceipt(gateTamper), /receipt_sha256_mismatch/);
});

// ---------- 7. idempotency and the accepted terminal state ----------

test('re-running the same order does not double-book', () => {
  const ledger = tempLedger();
  assert.equal(appendReceipt(ledger, acceptReceipt()).appended, true);
  const second = appendReceipt(ledger, acceptReceipt());
  assert.equal(second.appended, false);
  assert.equal(second.duplicate, true);
  assert.equal(readLedger(ledger).length, 1);
});

test('a reused idempotency key or order_id cannot create a second row', () => {
  const ledger = tempLedger();
  appendReceipt(ledger, refuseReceipt({
    order_id: 'HIRE-TEST-20261116-09',
    idempotency_key: 'HIRE-TEST-20261116-09.attempt-1',
  }));
  assert.throws(() => assertAppendOnly(readLedger(ledger), refuseReceipt({
    order_id: 'HIRE-TEST-20261116-08',
    idempotency_key: 'HIRE-TEST-20261116-09.attempt-1',
  })), /idempotency_key_conflict/);
  assert.throws(() => assertAppendOnly(readLedger(ledger), refuseReceipt({
    order_id: 'HIRE-TEST-20261116-09',
    idempotency_key: 'HIRE-TEST-20261116-09.attempt-2',
  })), /order_id_conflict/);
  assert.equal(readLedger(ledger).length, 1);
});

test('accepted is terminal and cannot be downgraded', () => {
  const ledger = tempLedger();
  appendReceipt(ledger, acceptReceipt());
  const downgrade = refuseReceipt();
  assert.throws(() => assertAppendOnly(readLedger(ledger), downgrade), /accepted_order_is_terminal/);
  assert.throws(() => appendReceipt(ledger, downgrade), /accepted_order_is_terminal/);
  assert.equal(readLedger(ledger).length, 1);
});

// ---------- 8. concurrency and locking ----------

test('concurrent processes appending different orders land exactly once each', async () => {
  const ledger = tempLedger();
  const orders = Array.from({length: 6}, (_, index) => baseOrder({
    order_id: `HIRE-CONC-000${index + 1}`,
    idempotency_key: `HIRE-CONC-000${index + 1}.attempt-1`,
  }));
  const results = await Promise.all(orders.map(order => runChild(APPEND_CHILD, {
    HIRE_ORDER: JSON.stringify(order),
    HIRE_LEDGER: ledger,
  })));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const rows = readLedger(ledger);
  assert.equal(rows.length, 6);
  assert.equal(new Set(rows.map(row => row.order_id)).size, 6);
  assert.ok(rows.every(row => row.state === 'accepted'));
});

test('concurrent processes appending the same order produce exactly one receipt', async () => {
  const ledger = tempLedger();
  const order = baseOrder({order_id: 'HIRE-CONC-SAME-01', idempotency_key: 'HIRE-CONC-SAME-01.attempt-1'});
  const results = await Promise.all(Array.from({length: 5}, () => runChild(APPEND_CHILD, {
    HIRE_ORDER: JSON.stringify(order),
    HIRE_LEDGER: ledger,
  })));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const payloads = results.map(result => JSON.parse(result.stdout));
  assert.equal(payloads.filter(payload => payload.appended === true).length, 1);
  assert.equal(readLedger(ledger).length, 1);
});

test('a stale lock from a dead process is reclaimed instead of deadlocking the ledger', () => {
  const ledger = tempLedger();
  mkdirSync(dirname(ledger), {recursive: true});
  const lockPath = `${ledger}.lock`;
  const old = new Date(Date.now() - 120000);
  writeFileSync(lockPath, JSON.stringify({pid: 2147483646, token: 'dead-owner', at: old.toISOString()}));
  utimesSync(lockPath, old, old);

  const result = appendReceipt(ledger, acceptReceipt(), {staleMs: 1000, timeoutMs: 10000});
  assert.equal(result.appended, true);
  assert.equal(existsSync(lockPath), false);
});

test('an abnormally exited process does not lock the ledger forever', async () => {
  const ledger = tempLedger();
  const child = await runChild(
    'const {acquireLedgerLock} = await import(process.env.MODULE_URL); acquireLedgerLock(process.env.HIRE_LEDGER); process.exit(0);',
    {HIRE_LEDGER: ledger},
  );
  assert.equal(child.status, 0, child.stderr);
  assert.equal(existsSync(`${ledger}.lock`), true);

  await new Promise(resolveWait => setTimeout(resolveWait, 1100));
  const result = appendReceipt(ledger, acceptReceipt(), {staleMs: 500, timeoutMs: 10000});
  assert.equal(result.appended, true);
});

test('stale-lock reclaim never deletes a lock replaced after the observation', () => {
  const ledger = tempLedger();
  mkdirSync(dirname(ledger), {recursive: true});
  const lockPath = `${ledger}.lock`;
  const old = new Date(Date.now() - 120000);
  writeFileSync(lockPath, JSON.stringify({pid: 2147483646, token: 'old-owner', at: old.toISOString()}));
  utimesSync(lockPath, old, old);
  const observed = readLockState(lockPath);

  // Another process replaces the lock: still stale by time and pid, but a
  // different file identity and owner token.
  unlinkSync(lockPath);
  writeFileSync(lockPath, JSON.stringify({pid: 2147483645, token: 'new-owner', at: old.toISOString()}));
  utimesSync(lockPath, old, old);

  const reclaimed = reclaimStaleLock(lockPath, observed, {staleMs: 1000});
  assert.equal(reclaimed, false);
  assert.equal(existsSync(lockPath), true);
  assert.equal(readLockState(lockPath).token, 'new-owner');
});

test('a lock owned by a live process is never reclaimed by age alone', () => {
  const ledger = tempLedger();
  mkdirSync(dirname(ledger), {recursive: true});
  const lockPath = `${ledger}.lock`;
  const old = new Date(Date.now() - 120000);
  writeFileSync(lockPath, JSON.stringify({pid: process.pid, token: 'live-owner', at: old.toISOString()}));
  utimesSync(lockPath, old, old);
  const observed = readLockState(lockPath);

  // Age alone is not enough: a slow but live owner keeps its lock.
  assert.equal(reclaimStaleLock(lockPath, observed, {staleMs: 1000}), false);
  assert.equal(existsSync(lockPath), true);
  assert.equal(readLockState(lockPath).token, 'live-owner');
  unlinkSync(lockPath);
});

test('a contended stale-lock reclaim never deletes the lock or the live sidecar', () => {
  const ledger = tempLedger();
  mkdirSync(dirname(ledger), {recursive: true});
  const lockPath = `${ledger}.lock`;
  const reclaimPath = `${lockPath}.reclaim`;
  const old = new Date(Date.now() - 120000);
  writeFileSync(lockPath, JSON.stringify({pid: 2147483646, token: 'dead-owner', at: old.toISOString()}));
  utimesSync(lockPath, old, old);
  const observed = readLockState(lockPath);

  // Another live reclaimer already owns the sidecar: this process must back off
  // instead of deleting the stale lock (or the sidecar) out from under it.
  writeFileSync(reclaimPath, JSON.stringify({pid: process.pid, token: 'live-reclaimer', at: new Date().toISOString()}));
  assert.equal(reclaimStaleLock(lockPath, observed, {staleMs: 1000}), false);
  assert.equal(existsSync(lockPath), true);
  assert.equal(readLockState(lockPath).token, 'dead-owner');
  assert.equal(existsSync(reclaimPath), true);
  unlinkSync(reclaimPath);
  unlinkSync(lockPath);
});

test('concurrent reclaimers of one stale lock still append every distinct order exactly once', async () => {
  const ledger = tempLedger();
  mkdirSync(dirname(ledger), {recursive: true});
  const lockPath = `${ledger}.lock`;
  const old = new Date(Date.now() - 120000);
  writeFileSync(lockPath, JSON.stringify({pid: 2147483646, token: 'dead-owner', at: old.toISOString()}));
  utimesSync(lockPath, old, old);

  const orders = Array.from({length: 4}, (_, index) => baseOrder({
    order_id: `HIRE-RACE-000${index + 1}`,
    idempotency_key: `HIRE-RACE-000${index + 1}.attempt-1`,
  }));
  const results = await Promise.all(orders.map(order => runChild(APPEND_CHILD, {
    HIRE_ORDER: JSON.stringify(order),
    HIRE_LEDGER: ledger,
  })));
  for (const result of results) assert.equal(result.status, 0, result.stderr);
  const rows = readLedger(ledger);
  assert.equal(rows.length, 4);
  assert.equal(new Set(rows.map(row => row.order_id)).size, 4);
  assert.equal(existsSync(lockPath), false);
});

test('releasing a lock only removes the lock this process owns', () => {
  const ledger = tempLedger();
  mkdirSync(dirname(ledger), {recursive: true});
  const lockPath = `${ledger}.lock`;
  const release = acquireLedgerLock(ledger);
  writeFileSync(lockPath, JSON.stringify({pid: process.pid, token: 'someone-else', at: new Date().toISOString()}));
  release();
  assert.equal(existsSync(lockPath), true);
  unlinkSync(lockPath);
});

// ---------- 9. partial writes ----------

test('a short write is completed instead of being reported as appended', () => {
  const ledger = tempLedger();
  const io = {write: (fd, buffer, offset, length, position) => writeSync(fd, buffer, offset, Math.min(7, length), position)};
  const result = appendReceipt(ledger, acceptReceipt(), {io});
  assert.equal(result.appended, true);
  const rows = readLedger(ledger);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].receipt_sha256, result.receipt_sha256);
});

test('a write failure rolls the ledger back and is not reported as appended', () => {
  const ledger = tempLedger();
  appendReceipt(ledger, acceptReceipt());
  const before = readFileSync(ledger).length;
  let calls = 0;
  const io = {write: (fd, buffer, offset, length, position) => {
    calls += 1;
    if (calls === 1) return writeSync(fd, buffer, offset, 5, position);
    throw Object.assign(new Error('synthetic ENOSPC'), {code: 'ENOSPC'});
  }};
  const second = acceptReceipt({order_id: 'HIRE-TEST-20261116-42', idempotency_key: 'HIRE-TEST-20261116-42.attempt-1'});
  assert.throws(() => appendReceipt(ledger, second, {io}), /ENOSPC/);
  assert.equal(readFileSync(ledger).length, before);
  assert.equal(readLedger(ledger).length, 1);
});

test('an fsync failure fails explicitly and rolls the file back', () => {
  const ledger = tempLedger();
  let fsyncCalls = 0;
  const io = {fsync: () => {
    fsyncCalls += 1;
    if (fsyncCalls === 1) throw Object.assign(new Error('synthetic fsync failure'), {code: 'EIO'});
  }};
  assert.throws(() => appendReceipt(ledger, acceptReceipt(), {io}), /synthetic fsync failure/);
  assert.equal(existsSync(ledger), true);
  assert.equal(readFileSync(ledger, 'utf8'), '');
});

// ---------- 10. ledger path boundary ----------

test('the ledger path is confined to knowledge/results/hire/', () => {
  const rejected = [
    '/tmp/ledger.jsonl',
    '../ledger.jsonl',
    'knowledge/results/hire/../ledger.jsonl',
    'knowledge/results/hire/sub/../../ledger.jsonl',
    'knowledge/results/ledger.jsonl',
    'docs/ledger.jsonl',
    'knowledge\\results\\hire\\ledger.jsonl',
    'knowledge/results/hire/ledger.txt',
    './knowledge/results/hire/ledger.jsonl',
  ];
  for (const candidate of rejected) {
    assert.throws(() => resolveLedgerPath(candidate), error => Boolean(error.code), `accepted ${candidate}`);
  }
  const portable = value => value.replaceAll('\\', '/');
  assert.ok(portable(resolveLedgerPath(undefined)).endsWith('knowledge/results/hire/ledger-v1.jsonl'));
  assert.ok(portable(resolveLedgerPath('knowledge/results/hire/ci-ledger.jsonl')).endsWith('knowledge/results/hire/ci-ledger.jsonl'));
});

test('a symlinked or directory ledger path is refused', () => {
  const root = mkdtempSync(join(tmpdir(), 'hire-ledger-root-'));
  mkdirSync(join(root, 'knowledge', 'results', 'hire'), {recursive: true});
  const outside = join(root, 'outside.jsonl');
  writeFileSync(outside, '');
  symlinkSync(outside, join(root, 'knowledge', 'results', 'hire', 'link.jsonl'));
  assert.throws(() => resolveLedgerPath('knowledge/results/hire/link.jsonl', {root}), /ledger_path_symlink_forbidden/);

  mkdirSync(join(root, 'knowledge', 'results', 'hire', 'dir.jsonl'));
  assert.throws(() => resolveLedgerPath('knowledge/results/hire/dir.jsonl', {root}), /ledger_path_not_a_file/);
});

test('the CLI refuses an escaping ledger path and writes nothing', () => {
  const result = runCli(['run', SAMPLE_ACCEPTED, '../escaped.jsonl']);
  assert.equal(result.status, 1);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.ok, false);
  assert.match(payload.reason, /ledger_path/);
});

test('appendReceipt refuses an out-of-bound ledger path when called directly', () => {
  // A module that imports appendReceipt() must not be able to write the ledger
  // anywhere else just because it skipped the CLI.
  const receipt = acceptReceipt();
  const outsideAbsolute = join(tmpdir(), `hire-escape-${process.pid}-${randomBytes(6).toString('hex')}.jsonl`);
  const rejected = [
    outsideAbsolute,
    join(REPO_ROOT, 'knowledge', 'results', 'hire', 'absolute-inside-repo.jsonl'),
    '../escaped.jsonl',
    'knowledge/results/hire/../escaped.jsonl',
    'knowledge/results/hire/sub/../../escaped.jsonl',
    'knowledge/results/escaped.jsonl',
    'docs/escaped.jsonl',
    'knowledge\\results\\hire\\escaped.jsonl',
    './knowledge/results/hire/escaped.jsonl',
  ];
  for (const candidate of rejected) {
    assert.throws(
      () => appendReceipt(candidate, receipt),
      error => Boolean(error.code),
      `appendReceipt accepted ${JSON.stringify(candidate)}`,
    );
    assert.equal(existsSync(candidate), false, `${candidate} must not be created`);
  }
  assert.equal(existsSync(outsideAbsolute), false);
  assert.equal(existsSync(join(REPO_ROOT, 'escaped.jsonl')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'knowledge', 'results', 'escaped.jsonl')), false);
  assert.equal(existsSync(join(REPO_ROOT, 'knowledge', 'results', 'hire', 'absolute-inside-repo.jsonl')), false);
});

test('appendReceipt confines an explicit root to the same hire directory', () => {
  const root = mkdtempSync(join(tmpdir(), 'hire-explicit-root-'));
  mkdirSync(join(root, 'knowledge', 'results', 'hire'), {recursive: true});

  const result = appendReceipt('knowledge/results/hire/ledger.jsonl', acceptReceipt(), {root});
  assert.equal(result.appended, true);
  assert.equal(readLedger(join(root, 'knowledge', 'results', 'hire', 'ledger.jsonl')).length, 1);

  // The root seam changes where the repo-relative path points; it does not
  // relax the directory or normalization rules.
  assert.throws(
    () => appendReceipt('knowledge/results/ledger.jsonl', acceptReceipt({
      order_id: 'HIRE-TEST-EXPLICIT-02',
      idempotency_key: 'HIRE-TEST-EXPLICIT-02.attempt-1',
    }), {root}),
    /ledger_path/,
  );
  assert.throws(
    () => appendReceipt('../escape.jsonl', acceptReceipt({
      order_id: 'HIRE-TEST-EXPLICIT-03',
      idempotency_key: 'HIRE-TEST-EXPLICIT-03.attempt-1',
    }), {root}),
    /ledger_path/,
  );
  assert.equal(existsSync(join(root, 'knowledge', 'results', 'escape.jsonl')), false);
  assert.equal(existsSync(join(root, 'escape.jsonl')), false);
});

// ---------- 11. zero-funds invariants ----------

test('paid, financial_execution and amount_usd invariants are enforced on append and read', () => {
  const ledger = tempLedger();

  const paid = acceptReceipt();
  paid.paid = true;
  assert.throws(() => appendReceipt(ledger, paid), /phase1_must_not_pay/);

  const executed = acceptReceipt();
  executed.financial_execution = true;
  assert.throws(() => appendReceipt(ledger, executed), /phase1_must_not_pay/);

  const spent = acceptReceipt();
  spent.amount_usd = 1;
  assert.throws(() => appendReceipt(ledger, spent), /phase1_must_not_spend/);

  appendReceipt(ledger, acceptReceipt());
  const raw = JSON.parse(readFileSync(ledger, 'utf8').trim());
  raw.amount_usd = 1;
  writeFileSync(ledger, `${JSON.stringify(raw)}\n`);
  assert.throws(() => readLedger(ledger), /invalid_ledger_line_1:phase1_must_not_spend/);
});

test('every CLI verdict carries the zero-fund invariants', () => {
  const validation = JSON.parse(runCli(['validate', SAMPLE_ACCEPTED]).stdout);
  assert.equal(validation.paid, false);
  assert.equal(validation.financial_execution, false);
  assert.equal(validation.amount_usd, 0);

  const selfcheck = JSON.parse(runCli(['selfcheck']).stdout);
  assert.equal(selfcheck.paid, false);
  assert.equal(selfcheck.financial_execution, false);
  assert.equal(selfcheck.amount_usd, 0);
});

// ---------- 12. sample orders and version markers ----------

test('the accepted sample order validates and the forbidden sample order is refused', () => {
  const accepted = runCli(['validate', SAMPLE_ACCEPTED]);
  assert.equal(accepted.status, 0, accepted.stdout);
  assert.equal(JSON.parse(accepted.stdout).state, 'spec_valid');

  const forbidden = runCli(['validate', SAMPLE_FORBIDDEN]);
  assert.equal(forbidden.status, 0, forbidden.stdout);

  const forbiddenOrder = JSON.parse(readFileSync(join(REPO_ROOT, SAMPLE_FORBIDDEN), 'utf8'));
  const outcome = gateOutcome(forbiddenOrder);
  assert.equal(outcome.state, 'needs_owner_decision');
  assert.equal(outcome.gate.ran, false);
});

test('canonical JSON is stable and the revision is declared', () => {
  assert.equal(canonicalJson({b: 1, a: [2, {d: 3, c: 4}]}), canonicalJson({a: [2, {c: 4, d: 3}], b: 1}));
  assert.equal(PHASE1_REVISION, 'hire-phase1-v1.1');
  assert.equal(lstatSync(join(REPO_ROOT, 'scripts', 'hire', 'gates', 'deliverable-audit.mjs')).isFile(), true);
});
