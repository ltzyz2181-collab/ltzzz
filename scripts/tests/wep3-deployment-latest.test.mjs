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

const report = {
  execution_id: '42774710300',
  run_attempt: '1',
  http: 200,
  service_verified: true,
  result: {source_commit: '68871e5d1e7b2c459d544234cf8dd060314edfc0'},
};

function sandbox() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'wep3-deploy-latest-'));
}

test('预期的安全门记为健康', () => {
  const r = buildDeploymentRecord({verdict, report, now: new Date('2026-11-10T07:22:00Z')});
  assert.equal(r.schema, DEPLOYMENT_SCHEMA);
  assert.equal(r.verdict_is_healthy, true);
  assert.equal(r.signer_verdict, 'expected_safety_block');
  assert.equal(r.source_commit, '68871e5d1e7b2c459d544234cf8dd060314edfc0');
  assert.equal(r.run_id, '42774710300');
});

test('真实异常判定不算健康', () => {
  const bad = {...verdict, serviceOk: false, expectedBlock: false, executionOccurred: true, blockedReason: null, verdict: 'unexpected_execution'};
  const r = buildDeploymentRecord({verdict: bad, report});
  assert.equal(r.verdict_is_healthy, false);
  assert.equal(r.signer_verdict, 'unexpected_execution');
});

test('未知判定必须抛错，不得写入', () => {
  assert.throws(() => buildDeploymentRecord({verdict: {...verdict, verdict: 'whatever'}, report}), /unknown_signer_verdict/);
  assert.throws(() => buildDeploymentRecord({verdict: null, report}), /unknown_signer_verdict/);
});

test('不得把成交字段写成自己的字段', () => {
  const r = buildDeploymentRecord({verdict, report});
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

  writeDeploymentRecord({verdict, report, root});

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
  writeDeploymentRecord({verdict, report, root});
  const written = JSON.parse(fs.readFileSync(path.join(root, DEPLOYMENT_REL_PATH), 'utf8'));
  assert.equal(written.settlement, null);
});
