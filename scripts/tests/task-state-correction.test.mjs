// 历史任务状态修正账本测试：只追加、保留原始记录、修正有依据、哈希链可核验。
// 对应工单 §一.3/§一.5：六条误判必须修正，但任何一条都不得覆盖或删除旧记录。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  CORRECTION_REFS,
  DEFAULT_DAILY,
  REPO_ROOT,
  buildCorrectionsFromDaily,
  verifyCorrections,
} from '../record-task-state-correction.mjs';
import {
  CORRECTION_SCHEMA,
  appendCorrection,
  entryHash,
  validateCorrection,
  verifyCorrectionLedger,
} from '../mail/corrections.mjs';
import {sha256} from '../mail/corrections.mjs';

const DAILY_FILE = path.join(REPO_ROOT, DEFAULT_DAILY);

function readDaily() {
  return JSON.parse(fs.readFileSync(DAILY_FILE, 'utf8'));
}

function tmpFile(name) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-corr-'));
  return {dir, file: path.join(dir, name)};
}

test('六条误判全部生成修正记录，且每条都保留原始状态与裁决依据', () => {
  const daily = readDaily();
  const records = buildCorrectionsFromDaily(daily, {sourcePath: DEFAULT_DAILY});
  assert.equal(records.length, 6);
  assert.deepEqual(records.map((r) => r.task_ref), CORRECTION_REFS);

  for (const record of records) {
    assert.equal(record.schema, CORRECTION_SCHEMA);
    assert.equal(record.preserves_original, true);
    assert.match(record.correction_id, /^CORR-20261117-00[1-6]$/);

    const original = daily.routes.find((route) => route.ref === record.task_ref);
    assert.ok(original, `来源日回执必须仍含 ${record.task_ref}`);
    assert.equal(record.original_state.route, original.route, '原始 route 必须原样保留');
    assert.equal(record.original_state.seat_route, original.seat_route);
    assert.equal(record.original_state.snapshot.title, original.title);
    assert.equal(record.corrected_state.route, original.recheck_route);
    assert.notEqual(record.original_state.route, record.corrected_state.route);
    assert.equal(record.basis.ruling_message_id, original.ruling.msg);
    assert.equal(record.corrected_state.decision_id, original.ruling.decision_id);
    assert.equal(record.basis.ruling_at, original.ruling.at);
    assert.equal(record.basis.evidence_path, DEFAULT_DAILY);
  }
});

test('来源缺裁决依据时拒绝修正，不靠推断补状态', () => {
  const daily = {
    generated_at_utc: '2026-11-17T00:00:00Z',
    routes: [{ref: CORRECTION_REFS[0], route: 'needs_gpt_decision', seat_route: 'needs_gpt_decision', title: 'x', recheck_route: 'decided_pending_execution'}],
  };
  assert.throws(() => buildCorrectionsFromDaily(daily), /没有完整裁决依据/);
});

test('来源缺 recheck_route 时拒绝猜测修正后状态', () => {
  const daily = {
    generated_at_utc: '2026-11-17T00:00:00Z',
    routes: [{
      ref: CORRECTION_REFS[0], route: 'needs_gpt_decision', seat_route: 'needs_gpt_decision', title: 'x',
      ruling: {msg: 'm', decision_id: 'D', at: '2026-11-16T00:00:00Z'},
    }],
  };
  assert.throws(() => buildCorrectionsFromDaily(daily), /缺少 recheck_route/);
});

test('账本只追加：重复执行不重复记账，也不改已有行', () => {
  const {file} = tmpFile('ledger.jsonl');
  const daily = readDaily();
  const records = buildCorrectionsFromDaily(daily, {sourcePath: DEFAULT_DAILY});
  for (const record of records) {
    assert.equal(appendCorrection(file, record).appended, true);
  }
  const afterFirst = fs.readFileSync(file, 'utf8');
  assert.equal(afterFirst.trim().split('\n').length, 6);

  for (const record of records) {
    const again = appendCorrection(file, record);
    assert.equal(again.appended, false);
    assert.equal(again.reason, 'duplicate');
  }
  assert.equal(fs.readFileSync(file, 'utf8'), afterFirst, '重复执行不得改写已有记录');
});

test('哈希链：每条 prev_sha256 指向前一条，entry_sha256 自校验', () => {
  const {file} = tmpFile('ledger.jsonl');
  const records = buildCorrectionsFromDaily(readDaily(), {sourcePath: DEFAULT_DAILY});
  for (const record of records) appendCorrection(file, record);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines[0].prev_sha256, null);
  for (let i = 1; i < lines.length; i += 1) {
    assert.equal(lines[i].prev_sha256, lines[i - 1].entry_sha256);
  }
  for (const line of lines) assert.equal(line.entry_sha256, entryHash(line));
});

test('verify 通过真实账本与来源日回执的逐条比对', () => {
  const {dir, file} = tmpFile('ledger.jsonl');
  const records = buildCorrectionsFromDaily(readDaily(), {sourcePath: DEFAULT_DAILY});
  for (const record of records) appendCorrection(file, record);
  const result = verifyCorrections({ledgerPath: file, dailyPath: DAILY_FILE});
  assert.equal(result.ok, true, JSON.stringify(result.errors));
  assert.equal(result.count, 6);
  assert.equal(result.source_checks.length, 6);
  assert.ok(result.source_checks.every((check) => check.ok));
  assert.ok(dir);
});

test('篡改账本任何一行都会被 verify 抓出', () => {
  const {file} = tmpFile('ledger.jsonl');
  const records = buildCorrectionsFromDaily(readDaily(), {sourcePath: DEFAULT_DAILY});
  for (const record of records) appendCorrection(file, record);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  const tampered = JSON.parse(lines[2]);
  tampered.corrected_state.route = 'closed_with_coordinator_receipt';
  lines[2] = JSON.stringify(tampered);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const result = verifyCorrections({ledgerPath: file, dailyPath: DAILY_FILE});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.error === 'entry_hash_mismatch'));
});

test('删除中间一行会断链，verify 必须失败', () => {
  const {file} = tmpFile('ledger.jsonl');
  const records = buildCorrectionsFromDaily(readDaily(), {sourcePath: DEFAULT_DAILY});
  for (const record of records) appendCorrection(file, record);
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n');
  lines.splice(3, 1);
  fs.writeFileSync(file, lines.join('\n') + '\n');
  const result = verifyCorrections({ledgerPath: file, dailyPath: DAILY_FILE});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.error === 'chain_break'));
});

test('来源日回执里的原始记录被改时，verify 报 source_record_drift', () => {
  const {dir, file} = tmpFile('ledger.jsonl');
  const dailyCopy = path.join(dir, 'daily.json');
  const daily = readDaily();
  fs.writeFileSync(dailyCopy, JSON.stringify(daily, null, 1) + '\n');
  const records = buildCorrectionsFromDaily(daily, {sourcePath: dailyCopy, evidenceSha256: sha256(fs.readFileSync(dailyCopy, 'utf8'))});
  for (const record of records) appendCorrection(file, record);
  assert.equal(verifyCorrections({ledgerPath: file, dailyPath: dailyCopy}).ok, true);

  const mutated = JSON.parse(fs.readFileSync(dailyCopy, 'utf8'));
  mutated.routes.find((route) => route.ref === CORRECTION_REFS[0]).route = 'needs_gpt_decision';
  mutated.routes.find((route) => route.ref === CORRECTION_REFS[0]).seat_route = 'closed_with_coordinator_receipt';
  fs.writeFileSync(dailyCopy, JSON.stringify(mutated, null, 1) + '\n');

  const result = verifyCorrections({ledgerPath: file, dailyPath: dailyCopy});
  assert.equal(result.ok, false);
  assert.ok(result.errors.some((error) => error.error === 'source_record_drift'));
  assert.ok(result.warnings.some((warning) => warning.kind === 'evidence_file_changed'));
});

test('记录字段校验：缺依据、改不成不同状态、缺保留标记都拒绝', () => {
  const base = buildCorrectionsFromDaily(readDaily(), {sourcePath: DEFAULT_DAILY})[0];
  assert.deepEqual(validateCorrection(base), []);

  const missingBasis = {...base, basis: {...base.basis, ruling_message_id: ''}};
  assert.ok(validateCorrection(missingBasis).includes('basis_ruling_message_id_missing'));

  const sameRoute = {...base, corrected_state: {...base.corrected_state, route: base.original_state.route}};
  assert.ok(validateCorrection(sameRoute).includes('corrected_route_must_differ_from_original'));

  const noPreserve = {...base, preserves_original: false};
  assert.ok(validateCorrection(noPreserve).includes('preserves_original_must_be_true'));

  const badId = {...base, correction_id: 'CORR-1'};
  assert.ok(validateCorrection(badId).includes('correction_id_invalid'));
});

test('账本已有坏行时拒绝继续追加，避免把坏链坐实', () => {
  const {file} = tmpFile('ledger.jsonl');
  fs.writeFileSync(file, '{"schema":"broken"}\n');
  const record = buildCorrectionsFromDaily(readDaily(), {sourcePath: DEFAULT_DAILY})[0];
  const result = appendCorrection(file, record);
  assert.equal(result.appended, false);
  assert.equal(result.reason, 'ledger_invalid');
  assert.equal(fs.readFileSync(file, 'utf8'), '{"schema":"broken"}\n', '坏账本不得被追加改写');
});

test('空账本 verify 视为通过（0 条），不伪造记录', () => {
  const result = verifyCorrectionLedger('');
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
});
