import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  BRIEF_DIR,
  TRIAGE_SCHEMA,
  buildTriage,
  triageWarning,
  writeTriage,
} from '../build-deep-backlog-triage.mjs';

const warning = (overrides = {}) => ({
  case_id: 'case-000000000001',
  task_id: 'CONTROL-2026-10-18-deepseek',
  issue: 'blocked_reconcile_existing_attempt',
  assigned_to: 'deepseek',
  first_observed_at: '2026-10-22T02:13:57.698Z',
  severity: 'repeated_warning',
  ...overrides,
});

test('每个缺失阶段映射到确定的工程/证据动作，不产生资金类指令', () => {
  assert.equal(triageWarning(warning()).action, 'reconcile_existing_attempt_before_any_retry');
  assert.equal(triageWarning(warning({issue: 'review_missing'})).action, 'attach_independent_review_to_existing_artifact');
  assert.equal(triageWarning(warning({issue: 'revision_required'})).action, 'reopen_revision_under_original_task_id');
  assert.equal(triageWarning(warning({issue: 'external_return_claim_missing'})).action, 'reconcile_external_return_with_original_claim');
  assert.equal(triageWarning(warning({issue: 'engineering_completion_unverified'})).action, 'verify_engineering_completion_receipt');
  assert.equal(triageWarning(warning({issue: 'delivery_missing'})).action, 'verify_delivery_receipt');
  assert.equal(triageWarning(warning({issue: 'claim_missing'})).action, 'restore_original_claim_reference');
  assert.equal(triageWarning(warning({issue: 'never_seen_before'})).action, 'blocked_evidence_needed');
});

test('保留家族只标记 escalate_to=gpt，不写在动作里', () => {
  const row = triageWarning(warning({task_id: 'REFUND-TERMINAL-2026-11-01'}));
  assert.equal(row.action, 'escalate_reserved_family');
  assert.equal(row.escalate_to, 'gpt');
  // task_id 保留原值用于对账；动作名本身不得带资金类指令。
  assert.doesNotMatch(row.action, /refund|资金|退款|签名|钱包/i);
});

test('分流计数覆盖全部 275 条，邮件只保留公开元数据', () => {
  const warnings = Array.from({length: 275}, (_, index) => warning({
    case_id: `case-${String(index).padStart(12, '0')}`,
    task_id: `TASK-${String(index).padStart(3, '0')}`,
  }));
  const oversight = {
    backlog: {open_warning_cases: 275, unique_original_tasks: 275, not_rechecked_in_current_window: 232},
    warnings,
  };
  const intake = {
    counts: {open_or_dispatch: 200, unified: 1879},
    open_items: Array.from({length: 130}, (_, index) => ({
      ref: `ref${index}`,
      channel: 'qq_fullbox',
      status: 'unknown',
      age_days: 0.2,
      subject_short: 'must not be copied',
      task_ids: index % 2 ? ['DEEP-SUPERAGENT-20261127-OPS-1'] : [],
      has_dispatch_wording: index % 3 === 0,
    })),
  };
  const built = buildTriage({date: '2026-11-27', oversight, intake, mailLimit: 120});
  assert.equal(built.summary.schema, TRIAGE_SCHEMA);
  assert.equal(built.rows.length, 275);
  assert.equal(built.summary.totals.triaged_cases, 275);
  assert.equal(built.summary.totals.reserved_family_escalations, 0);
  assert.equal(built.mail.length, 120);
  assert.equal(built.summary.mail.with_dispatch_wording, 40);
  assert.equal(built.summary.mail.with_task_ids, 60);
  assert.doesNotMatch(JSON.stringify(built.mail), /subject|must not be copied/i);
});

test('写出的 latest.json 留在 repo_read 的 60KB 预算内', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-triage-'));
  try {
    const warnings = Array.from({length: 275}, (_, index) => warning({
      case_id: `case-${String(index).padStart(12, '0')}`,
      task_id: `DEEP-SUPERAGENT-2026-${String((index % 12) + 1).padStart(2, '0')}-${String(index).padStart(3, '0')}`,
    }));
    const result = writeTriage({
      root,
      date: '2026-11-27',
      oversight: {backlog: {open_warning_cases: 275}, warnings},
      intake: {counts: {open_or_dispatch: 200, unified: 1879}, open_items: []},
    });
    assert.ok(result.bytes.latest < 60 * 1024, `latest ${result.bytes.latest} bytes`);
    assert.ok(fs.existsSync(path.join(root, BRIEF_DIR, 'latest.json')));
    assert.ok(fs.existsSync(path.join(root, BRIEF_DIR, 'summary.json')));
    assert.ok(fs.existsSync(path.join(root, BRIEF_DIR, '2026-11-27.json')));
    // latest 全量 275 条且最老在前；按日文件保留 stage/severity 全文。
    const latest = JSON.parse(fs.readFileSync(path.join(root, BRIEF_DIR, 'latest.json'), 'utf8'));
    assert.equal(latest.rows.length, 275);
    assert.equal(latest.rows[0].since <= latest.rows.at(-1).since, true);
    assert.ok(latest.rows.every((row) => row.action && row.task));
    const dated = JSON.parse(fs.readFileSync(path.join(root, BRIEF_DIR, '2026-11-27.json'), 'utf8'));
    assert.equal(dated.rows.length, 275);
    assert.ok(dated.rows.every((row) => row.stage && row.severity));
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('日期非法时拒绝生成', () => {
  assert.throws(() => buildTriage({date: '../20261127'}), /invalid_triage_date/);
});
