// 部署验收记录：独立于「成交回执」的第二份状态。
//
// 为什么不能直接写 knowledge/results/wep3/latest.json：
// 那个文件是**雇佣任务成交回执**（status / paid / tx_hash / source），被 11 处读取，
// 包括 wep3.html 的「最近实际回执」、telegram/bot 渠道，以及 kimi-native-audit 作为
// 审计源（source_receipt + 哈希）。把部署巡检写进去，会让「最近一笔雇佣」看起来
// 刚发生/刚失败，并污染审计证据链。
//
// 所以这里只写 knowledge/results/wep3/deployment-latest.json，
// 成交信息仅以 settlement 只读引用的形式带出，绝不顶替。

import fs from 'node:fs';
import path from 'node:path';

export const DEPLOYMENT_SCHEMA = 'ltzzz.wep3.deployment-latest.v1';
export const DEPLOYMENT_REL_PATH = 'knowledge/results/wep3/deployment-latest.json';
export const SETTLEMENT_RECEIPT_REL_PATH = 'knowledge/results/wep3/latest.json';
export const HEALTHY_VERDICTS = ['ready', 'expected_safety_block'];
const ALL_VERDICTS = [...HEALTHY_VERDICTS, 'http_not_ok', 'schema_mismatch', 'unexpected_execution', 'unknown_block'];

export function buildDeploymentRecord({verdict, report = {}, triggerCommit = null, settlement = null, now = new Date()}) {
  if (!verdict || !ALL_VERDICTS.includes(verdict.verdict)) {
    throw new Error('unknown_signer_verdict');
  }

  return {
    schema: DEPLOYMENT_SCHEMA,
    kind: 'deployment_acceptance',
    note: '这是部署与验收巡检，不是雇佣成交回执；成交请看 latest.json',
    at: new Date(now).toISOString(),
    run_id: report.execution_id || null,
    run_attempt: String(report.run_attempt || '1'),
    trigger_commit: triggerCommit || null,
    source_commit: report.result?.source_commit || null,
    http: typeof report.http === 'number' ? report.http : null,
    service_verified: report.service_verified === true,
    signer_verdict: verdict.verdict,
    signer_expected_block: verdict.expectedBlock === true,
    signer_blocked_reason: verdict.blockedReason || null,
    verdict_is_healthy: HEALTHY_VERDICTS.includes(verdict.verdict),
    settlement,
  };
}

export function readSettlementSummary(root = '.') {
  const p = path.join(root, SETTLEMENT_RECEIPT_REL_PATH);
  if (!fs.existsSync(p)) return null;
  try {
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      receipt_at: typeof d.at === 'string' ? d.at : null,
      status: typeof d.status === 'string' ? d.status : null,
      paid: d.paid === true,
      tx_hash: typeof d.tx_hash === 'string' ? d.tx_hash : null,
    };
  } catch {
    return null;
  }
}

export function writeDeploymentRecord({verdict, report = {}, root = '.', triggerCommit = null, now = new Date()}) {
  const record = buildDeploymentRecord({
    verdict,
    report,
    triggerCommit,
    settlement: readSettlementSummary(root),
    now,
  });
  const target = path.join(root, DEPLOYMENT_REL_PATH);
  fs.mkdirSync(path.dirname(target), {recursive: true});
  fs.writeFileSync(target, JSON.stringify(record, null, 2));
  return record;
}
