#!/usr/bin/env node
// 2026-11-17 六条「已被裁决却仍记为待裁决」的历史任务状态修正。
//
// 对应工单 LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02 §一.3/§一.5：
// - 修正六条误判，但每条都必须保留原始记录（原 route/seat_route/标题）与修正依据
//   （裁决 decision_id、message_id、时间、来源文件哈希）；
// - 只追加，不覆盖、不删除：账本是 append-only JSONL，带 prev_sha256 哈希链；
// - 幂等：同一 correction_id 或同一 task_ref + decision_id 重复执行不会重复记账；
// - 可核验：--verify 同时检查账本哈希链与来源日回执里的原始记录是否仍与记录一致。
//
// 用法：
//   node scripts/record-task-state-correction.mjs --seed
//   node scripts/record-task-state-correction.mjs --verify [--json]

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  CORRECTION_SCHEMA,
  appendCorrection,
  buildCorrection,
  canonical,
  readCorrectionLedger,
  sha256,
} from './mail/corrections.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DEFAULT_LEDGER = 'ops/deep-superagent/corrections/2026-11-17-task-state.jsonl';
export const DEFAULT_DAILY = 'knowledge/results/deep-superagent/daily-2026-11-17.json';

// 六条误判的 ref；顺序按裁决时间升序，correction_id 依次编号。
export const CORRECTION_REFS = [
  '0c44d7ce5b18a34e',
  'cad495cb967efd7c',
  '6a5c732286808bf3',
  'adad792d0ef16422',
  '5556bddb2622ff00',
  '8d9a5f45ab685bbb',
];

// 原始状态哈希只覆盖「构成误判」的字段：日后日回执追加新的复核字段不会误报，
// 但改动 route/seat_route/标题本身会被 verify 抓出来。
export function originalStateOf(routeRecord) {
  return {
    ref: routeRecord.ref,
    route: routeRecord.route,
    seat_route: routeRecord.seat_route,
    title: routeRecord.title,
  };
}

export function findRouteRecord(daily, ref) {
  return (daily?.routes || []).find((route) => route.ref === ref) || null;
}

/**
 * 由日回执构造六条修正记录（纯函数，不写盘）。
 * 返回的每条记录都自带原始快照与裁决依据。
 */
export function buildCorrectionsFromDaily(daily, {
  sourcePath = DEFAULT_DAILY,
  evidenceSha256,
  recordedBy = 'claude-desktop-dev-seat',
  recordedAt = daily?.generated_at_utc || new Date().toISOString(),
} = {}) {
  const evidence = evidenceSha256 || sha256(JSON.stringify(daily));
  const records = [];
  CORRECTION_REFS.forEach((ref, index) => {
    const routeRecord = findRouteRecord(daily, ref);
    if (!routeRecord) throw new Error(`日回执缺少 ref=${ref}，拒绝生成不完整修正`);
    const ruling = routeRecord.ruling || {};
    if (!ruling.msg || !ruling.decision_id || !ruling.at) {
      throw new Error(`ref=${ref} 没有完整裁决依据（msg/decision_id/at），拒绝仅凭推断修正`);
    }
    if (!routeRecord.recheck_route) {
      throw new Error(`ref=${ref} 缺少 recheck_route，拒绝猜测修正后的状态`);
    }
    const record = buildCorrection({
      correctionId: `CORR-20261117-${String(index + 1).padStart(3, '0')}`,
      taskRef: ref,
      originalRoute: routeRecord.route,
      originalTitle: routeRecord.title,
      sourcePath,
      sourceRecord: originalStateOf(routeRecord),
      correctedRoute: routeRecord.recheck_route,
      decisionId: ruling.decision_id,
      rulingMessageId: ruling.msg,
      rulingAt: ruling.at,
      verdict: ruling.verdict || null,
      evidencePath: sourcePath,
      evidenceSha256: evidence,
      recordedBy,
      recordedAt,
      note: routeRecord.recheck || null,
    });
    record.original_state.seat_route = routeRecord.seat_route || null;
    record.original_state.snapshot = originalStateOf(routeRecord);
    record.basis.decision_id = ruling.decision_id;
    record.basis.verdict = ruling.verdict || null;
    records.push(record);
  });
  return records;
}

export function seedCorrections({ledgerPath = DEFAULT_LEDGER, dailyPath = DEFAULT_DAILY, root = REPO_ROOT, recordedBy} = {}) {
  const ledgerFile = path.isAbsolute(ledgerPath) ? ledgerPath : path.join(root, ledgerPath);
  const dailyFile = path.isAbsolute(dailyPath) ? dailyPath : path.join(root, dailyPath);
  const raw = fs.readFileSync(dailyFile, 'utf8');
  const daily = JSON.parse(raw);
  const records = buildCorrectionsFromDaily(daily, {
    sourcePath: dailyPath,
    evidenceSha256: sha256(raw),
    recordedBy,
  });
  const results = records.map((record) => appendCorrection(ledgerFile, record));
  const ledger = readCorrectionLedger(ledgerFile);
  return {
    ledger: ledgerPath,
    appended: results.filter((item) => item.appended).length,
    duplicates: results.filter((item) => item.reason === 'duplicate').length,
    results,
    ok: ledger.ok,
    count: ledger.count,
    errors: ledger.errors,
  };
}

/**
 * 核验账本本身 + 每条修正与来源日回执的一致性。
 * 硬错误（哈希链断、字段缺失、来源记录被改）→ ok=false；文件整体哈希变化只作提示。
 */
export function verifyCorrections({ledgerPath = DEFAULT_LEDGER, dailyPath = DEFAULT_DAILY, root = REPO_ROOT} = {}) {
  const ledgerFile = path.isAbsolute(ledgerPath) ? ledgerPath : path.join(root, ledgerPath);
  const dailyFile = path.isAbsolute(dailyPath) ? dailyPath : path.join(root, dailyPath);
  const ledger = readCorrectionLedger(ledgerFile);
  const errors = [...ledger.errors];
  const warnings = [];
  const sourceChecks = [];

  let daily = null;
  let dailySha = null;
  try {
    const raw = fs.readFileSync(dailyFile, 'utf8');
    daily = JSON.parse(raw);
    dailySha = sha256(raw);
  } catch (error) {
    errors.push({error: 'source_unreadable', detail: String(error.message).slice(0, 160)});
  }

  if (daily) {
    for (const record of ledger.records) {
      const routeRecord = findRouteRecord(daily, record.task_ref);
      if (!routeRecord) {
        sourceChecks.push({ref: record.task_ref, ok: false, reason: 'source_record_missing'});
        errors.push({error: 'source_record_missing', correction_id: record.correction_id, ref: record.task_ref});
        continue;
      }
      const recomputed = sha256(canonical(originalStateOf(routeRecord)));
      const recorded = record.original_state?.record_sha256;
      const ruling = routeRecord.ruling || {};
      const rulingMatches = ruling.msg === record.basis?.ruling_message_id
        && ruling.at === record.basis?.ruling_at
        && ruling.decision_id === record.corrected_state?.decision_id;
      const ok = recomputed === recorded && rulingMatches;
      if (!ok) {
        errors.push({
          error: 'source_record_drift',
          correction_id: record.correction_id,
          ref: record.task_ref,
          hash_matches: recomputed === recorded,
          ruling_matches: rulingMatches,
        });
      }
      sourceChecks.push({ref: record.task_ref, ok, hash_matches: recomputed === recorded, ruling_matches: rulingMatches});
    }
    if (ledger.records.length) {
      const recordedEvidence = ledger.records[0].basis?.evidence_sha256;
      if (recordedEvidence && recordedEvidence !== dailySha) {
        warnings.push({
          kind: 'evidence_file_changed',
          note: '日回执文件整体哈希与记账时不同：逐条原始记录仍已逐个核对，仅提示取证时点差异。',
        });
      }
    }
  }

  return {
    ok: errors.length === 0,
    ledger: ledgerPath,
    daily: dailyPath,
    count: ledger.count,
    errors,
    warnings,
    source_checks: sourceChecks,
    records: ledger.records.map((record) => ({
      correction_id: record.correction_id,
      task_ref: record.task_ref,
      from: record.original_state?.route,
      to: record.corrected_state?.route,
      decision_id: record.corrected_state?.decision_id,
      entry_sha256: record.entry_sha256,
    })),
  };
}

export function parseArgs(argv = process.argv.slice(2)) {
  const get = (flag, fallback) => {
    const index = argv.indexOf(flag);
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
  };
  return {
    seed: argv.includes('--seed'),
    verify: argv.includes('--verify') || !argv.includes('--seed'),
    json: argv.includes('--json'),
    ledger: get('--ledger', DEFAULT_LEDGER),
    daily: get('--daily', DEFAULT_DAILY),
    recordedBy: get('--recorded-by', 'claude-desktop-dev-seat'),
  };
}

function main() {
  const args = parseArgs();
  let result;
  if (args.seed) {
    result = seedCorrections({ledgerPath: args.ledger, dailyPath: args.daily, recordedBy: args.recordedBy});
    result = {...result, verify: verifyCorrections({ledgerPath: args.ledger, dailyPath: args.daily})};
  } else {
    result = verifyCorrections({ledgerPath: args.ledger, dailyPath: args.daily});
  }
  const ok = result.ok && (result.verify ? result.verify.ok : true);
  if (args.json) {
    console.log(JSON.stringify({ok, ...result}, null, 2));
  } else {
    const verb = args.seed ? 'seed' : 'verify';
    console.log(`${verb} ${ok ? 'ok' : 'FAILED'} ledger=${result.ledger} count=${result.count}`);
    for (const check of result.source_checks || []) {
      console.log(`  ${check.ok ? 'ok' : 'FAIL'} ${check.ref}`);
    }
    for (const error of result.errors || []) console.log('  error ' + JSON.stringify(error));
  }
  process.exitCode = ok ? 0 : 1;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) main();

export const CORRECTION_LEDGER_SCHEMA = CORRECTION_SCHEMA;
