// 历史任务状态修正账本：只追加、不改写、每条都带原始状态与修正依据。
//
// 约束（对应工单 §一.5）：
// - 原始记录不得覆盖或删除：original_state 里保存原 route、来源文件与来源记录哈希；
// - 修正必须有依据：basis 里保存裁决原文所在文件、文件哈希、裁决 message_id；
// - 同一 correction_id（或同一 task_ref + decision_id）重复追加是幂等的，不重复记账；
// - 每条记录用 prev_sha256 串成哈希链，任何历史行被改动都会在 verify 时暴露。

import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const CORRECTION_SCHEMA = 'ltzzz.deep-superagent.task-state-correction.v1';
export const CORRECTION_ID_RE = /^CORR-\d{8}-\d{3}$/;

export function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}

export function entryHash(record) {
  const copy = {...record};
  delete copy.entry_sha256;
  delete copy.prev_sha256;
  delete copy.__line; // parseLedger 附加的行号不属于记录内容
  return sha256(copy);
}

export function validateCorrection(record) {
  const errors = [];
  const need = (condition, message) => {
    if (!condition) errors.push(message);
  };
  need(record && typeof record === 'object', 'record_must_be_object');
  if (errors.length) return errors;
  need(record.schema === CORRECTION_SCHEMA, 'schema_invalid');
  need(CORRECTION_ID_RE.test(String(record.correction_id || '')), 'correction_id_invalid');
  need(typeof record.task_ref === 'string' && record.task_ref.length > 0, 'task_ref_missing');
  need(record.preserves_original === true, 'preserves_original_must_be_true');
  need(typeof record.recorded_by === 'string' && record.recorded_by.length > 0, 'recorded_by_missing');
  need(Number.isFinite(Date.parse(record.recorded_at || '')), 'recorded_at_invalid');

  const original = record.original_state || {};
  need(typeof original.route === 'string' && original.route.length > 0, 'original_state_route_missing');
  need(typeof original.source_path === 'string' && original.source_path.length > 0, 'original_state_source_path_missing');
  need(/^[0-9a-f]{64}$/.test(String(original.record_sha256 || '')), 'original_state_record_sha256_invalid');

  const corrected = record.corrected_state || {};
  need(typeof corrected.route === 'string' && corrected.route.length > 0, 'corrected_state_route_missing');
  need(corrected.route !== original.route, 'corrected_route_must_differ_from_original');
  need(typeof corrected.decision_id === 'string' && corrected.decision_id.length > 0, 'corrected_state_decision_id_missing');

  const basis = record.basis || {};
  need(typeof basis.ruling_message_id === 'string' && basis.ruling_message_id.length > 0, 'basis_ruling_message_id_missing');
  need(Number.isFinite(Date.parse(basis.ruling_at || '')), 'basis_ruling_at_invalid');
  need(typeof basis.evidence_path === 'string' && basis.evidence_path.length > 0, 'basis_evidence_path_missing');
  need(/^[0-9a-f]{64}$/.test(String(basis.evidence_sha256 || '')), 'basis_evidence_sha256_invalid');

  return errors;
}

export function parseLedger(text) {
  const records = [];
  const errors = [];
  const lines = String(text || '').split('\n');
  lines.forEach((line, index) => {
    if (!line.trim()) return;
    try {
      records.push({...JSON.parse(line), __line: index + 1});
    } catch {
      errors.push({line: index + 1, error: 'invalid_json'});
    }
  });
  return {records, errors};
}

export function verifyCorrectionLedger(text) {
  const {records, errors} = parseLedger(text);
  let prev = null;
  for (const record of records) {
    const expectedHash = entryHash(record);
    if (record.entry_sha256 !== expectedHash) {
      errors.push({line: record.__line, error: 'entry_hash_mismatch', expected: expectedHash, actual: record.entry_sha256 ?? null});
    }
    if ((record.prev_sha256 ?? null) !== prev) {
      errors.push({line: record.__line, error: 'chain_break', expected_prev: prev, actual_prev: record.prev_sha256 ?? null});
    }
    for (const problem of validateCorrection(record)) errors.push({line: record.__line, error: problem});
    prev = record.entry_sha256;
  }
  return {ok: errors.length === 0, count: records.length, errors, records};
}

export function readCorrectionLedger(file) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  return verifyCorrectionLedger(text);
}

/**
 * 追加一条修正记录；重复追加（同 correction_id 或同 task_ref+decision_id）幂等返回。
 * 追加前会先验证既有账本，账本已损坏时拒绝继续写，避免把坏链坐实。
 */
export function appendCorrection(file, record) {
  const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  const current = verifyCorrectionLedger(text);
  if (!current.ok) {
    return {appended: false, reason: 'ledger_invalid', errors: current.errors};
  }
  const errors = validateCorrection(record);
  if (errors.length) return {appended: false, reason: 'record_invalid', errors};

  const duplicate = current.records.find((existing) => (
    existing.correction_id === record.correction_id
    || (existing.task_ref === record.task_ref
      && existing.corrected_state?.decision_id === record.corrected_state?.decision_id)
  ));
  if (duplicate) {
    return {appended: false, reason: 'duplicate', correction_id: duplicate.correction_id, entry_sha256: duplicate.entry_sha256};
  }

  const prev = current.records.length ? current.records[current.records.length - 1].entry_sha256 : null;
  const entry = {...record, prev_sha256: prev};
  entry.entry_sha256 = entryHash(entry);
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.appendFileSync(file, JSON.stringify(entry) + '\n', 'utf8');
  return {appended: true, correction_id: entry.correction_id, entry_sha256: entry.entry_sha256};
}

export function buildCorrection({
  correctionId,
  taskRef,
  originalRoute,
  originalTitle,
  sourcePath,
  sourceRecord,
  correctedRoute,
  decisionId,
  rulingMessageId,
  rulingAt,
  verdict,
  evidencePath,
  evidenceSha256,
  recordedBy,
  recordedAt = new Date().toISOString(),
  note = null,
}) {
  return {
    schema: CORRECTION_SCHEMA,
    correction_id: correctionId,
    task_ref: taskRef,
    title: originalTitle || null,
    original_state: {
      route: originalRoute,
      source_path: sourcePath,
      record_sha256: sha256(sourceRecord),
    },
    corrected_state: {
      route: correctedRoute,
      decision_id: decisionId,
      ruling_message_id: rulingMessageId,
      ruling_at: rulingAt,
      verdict: verdict || null,
    },
    basis: {
      ruling_message_id: rulingMessageId,
      ruling_at: rulingAt,
      evidence_path: evidencePath,
      evidence_sha256: evidenceSha256,
      decision_seat: 'ltzyz2181@gmail.com',
      note: note || '裁决原件由 GPT 决定席发出，message_id 与时间取自日回执中已记录的 ruling 字段。',
    },
    recorded_by: recordedBy,
    recorded_at: recordedAt,
    preserves_original: true,
  };
}
