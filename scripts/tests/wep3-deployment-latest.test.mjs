// 回归：部署验收记录不得顶替成交回执。
//
// 背景：knowledge/results/wep3/latest.json 是「雇佣成交回执」，被 wep3.html、
// telegram/bot 渠道和 kimi-native-audit 作为审计源读取。部署巡检必须另存一份，
// 且成交信息只能以只读引用形式带出。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  buildDeploymentRecord,
  readSettlementSummary,
  writeDeploymentRecord,
  persistDeploymentRecord,
  ALL_VERDICTS,
  DEPLOYMENT_SCHEMA,
  DEPLOYMENT_REL_PATH,
  SETTLEMENT_RECEIPT_REL_PATH,
} from '../lib/wep3-deployment-latest.mjs';

const verdict = {
  serviceOk: true,
  expectedBlock: true,
  executionOccurred: false,
  blockedReason: 'existing_legacy_guard_denies_transaction_adapter',
  verdict: 'expected_safety_block',
};

const TRIGGER_COMMIT = '68871e5d1e7b2c459d544234cf8dd060314edfc0';

const report = {
  execution_id: '42774710300',
  run_attempt: '1',
  http: 200,
  service_verified: true,
  result: {source_commit: TRIGGER_COMMIT},
};

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wep3-deploy-latest-'));
}

test('预期的安全门记为健康', () => {
  const r = buildDeploymentRecord({verdict, report, triggerCommit: TRIGGER_COMMIT, now: new Date('2026-11-10T07:22:00Z')});
  assert.equal(r.schema, DEPLOYMENT_SCHEMA);
  assert.equal(r.verdict_is_healthy, true);
  assert.equal(r.signer_verdict, 'expected_safety_block');
  assert.equal(r.source_commit, TRIGGER_COMMIT);
  assert.equal(r.source_commit_valid, true);
  assert.equal(r.trigger_commit_valid, true);
  assert.equal(r.source_commit_match, true);
  assert.equal(r.deployment_verified, true);
  assert.equal(r.run_id, '42774710300');
});

test('source_commit 与 trigger_commit 必须是 40-hex 且完全匹配', () => {
  const mismatch = buildDeploymentRecord({verdict, report: {...report, result: {source_commit: 'a'.repeat(40)}}, triggerCommit: TRIGGER_COMMIT});
  assert.equal(mismatch.source_commit_valid, true);
  assert.equal(mismatch.source_commit_match, false);
  assert.equal(mismatch.verdict_is_healthy, false);
  assert.equal(mismatch.deployment_verified, false);

  const malformed = buildDeploymentRecord({verdict, report: {...report, result: {source_commit: 'not-a-sha'}}, triggerCommit: 'not-a-sha'});
  assert.equal(malformed.source_commit, null);
  assert.equal(malformed.source_commit_valid, false);
  assert.equal(malformed.trigger_commit, null);
  assert.equal(malformed.trigger_commit_valid, false);
  assert.equal(malformed.verdict_is_healthy, false);
});

test('所有 classifier verdict 均可持久化，且只有健康 verdict 加匹配提交才健康', () => {
  for (const name of ALL_VERDICTS) {
    const v = {...verdict, verdict: name, serviceOk: name === 'ready' || name === 'expected_safety_block'};
    const r = buildDeploymentRecord({verdict: v, report, triggerCommit: TRIGGER_COMMIT});
    assert.equal(r.signer_verdict, name);
    assert.equal(r.verdict_is_healthy, ['ready', 'expected_safety_block'].includes(name));
  }
  assert.throws(() => buildDeploymentRecord({verdict: {...verdict, verdict: 'unlisted'}, report, triggerCommit: TRIGGER_COMMIT}), /unknown_signer_verdict/);
});

test('真实异常判定不算健康', () => {
  const bad = {...verdict, serviceOk: false, expectedBlock: false, executionOccurred: true, blockedReason: null, verdict: 'unexpected_execution'};
  const r = buildDeploymentRecord({verdict: bad, report, triggerCommit: TRIGGER_COMMIT});
  assert.equal(r.verdict_is_healthy, false);
  assert.equal(r.signer_verdict, 'unexpected_execution');
});

test('未知判定必须抛错，不得写入', () => {
  assert.throws(() => buildDeploymentRecord({verdict: {...verdict, verdict: 'whatever'}, report}), /unknown_signer_verdict/);
  assert.throws(() => buildDeploymentRecord({verdict: null, report}), /unknown_signer_verdict/);
});

test('不得把成交字段写成自己的字段', () => {
  const r = buildDeploymentRecord({verdict, report, triggerCommit: TRIGGER_COMMIT});
  assert.equal(Object.hasOwn(r, 'paid'), false);
  assert.equal(Object.hasOwn(r, 'tx_hash'), false);
  assert.equal(r.kind, 'deployment_acceptance');
  assert.match(r.note, /不是雇佣成交回执/);
});

test('写盘时不会覆盖 latest.json', () => {
  const root = sandbox();
  const receiptPath = path.join(root, SETTLEMENT_RECEIPT_REL_PATH);
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  const settlement = JSON.stringify({at: '2026-11-02T01:44:32.360Z', status: 'live_contract_check_failed', paid: false, tx_hash: null}, null, 2);
  fs.writeFileSync(receiptPath, settlement);

  writeDeploymentRecord({verdict, report, root, triggerCommit: TRIGGER_COMMIT});

  assert.equal(fs.readFileSync(receiptPath, 'utf8'), settlement, 'latest.json 必须一字节不变');
  const written = JSON.parse(fs.readFileSync(path.join(root, DEPLOYMENT_REL_PATH), 'utf8'));
  assert.equal(written.kind, 'deployment_acceptance');
  assert.deepEqual(written.settlement, {
    receipt_at: '2026-11-02T01:44:32.360Z',
    status: 'live_contract_check_failed',
    paid: false,
    tx_hash: null,
  });
});

test('部署记录持久化失败必须显式返回错误，不得静默成功', () => {
  const root = sandbox();
  const target = path.join(root, DEPLOYMENT_REL_PATH);
  fs.mkdirSync(target, {recursive: true});
  const result = persistDeploymentRecord({verdict, report, root, triggerCommit: TRIGGER_COMMIT});
  assert.deepEqual(result, {ok: false, path: DEPLOYMENT_REL_PATH, error: 'deployment_record_write_failed'});
});

test('部署记录持久化成功返回可核验路径', () => {
  const root = sandbox();
  const result = persistDeploymentRecord({verdict, report, root, triggerCommit: TRIGGER_COMMIT});
  assert.equal(result.ok, true);
  assert.equal(result.path, DEPLOYMENT_REL_PATH);
  assert.equal(fs.existsSync(path.join(root, DEPLOYMENT_REL_PATH)), true);
});

test('成交摘要只读引用，不改写其内容', () => {
  const root = sandbox();
  const receiptPath = path.join(root, SETTLEMENT_RECEIPT_REL_PATH);
  fs.mkdirSync(path.dirname(receiptPath), {recursive: true});
  fs.writeFileSync(receiptPath, JSON.stringify({at: '2026-11-09T12:00:00Z', status: 'internal_credit_settled', paid: true, tx_hash: '0xabc'}));

  const s = readSettlementSummary(root);
  assert.deepEqual(s, {receipt_at: '2026-11-09T12:00:00Z', status: 'internal_credit_settled', paid: true, tx_hash: '0xabc'});
});

test('缺 latest.json 时不编造成交', () => {
  const root = sandbox();
  writeDeploymentRecord({verdict, report, root, triggerCommit: TRIGGER_COMMIT});
  const written = JSON.parse(fs.readFileSync(path.join(root, DEPLOYMENT_REL_PATH), 'utf8'));
  assert.equal(written.settlement, null);
});
