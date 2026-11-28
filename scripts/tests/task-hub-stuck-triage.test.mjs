import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  STUCK_SCHEMA,
  buildStuckTriage,
  classifyTask,
  triageBytes,
  writeStuckTriage,
} from '../task-hub-stuck-triage.mjs';

const NOW = new Date('2026-11-28T08:00:00.000Z');
const task = (overrides = {}) => ({
  number: 700, task_id: 'TASK-DEMO-20261128', seat: 'deep', state: 'new',
  title: '[TASK] ordinary engineering task', attempts: 0, lease_until: null,
  pr: null, invalid_delivered: false, delivered_evidence_problems: [], reopened: null,
  ...overrides,
});

test('blocked 状态映射为阻塞类并给出核实动作', () => {
  const r = classifyTask(task({state: 'blocked', title: '[TASK] RELAY QUOTA BROWSER FLOW'}), NOW);
  assert.equal(r.category, 'blocked_state');
  assert.equal(r.action, 'verify_blocker_and_request_owner_or_gpt_decision');
});

test('DECISION 标题映射为待裁决类，不自行执行', () => {
  const r = classifyTask(task({title: '[DECISION] 2026-11-28 three blockers'}), NOW);
  assert.equal(r.category, 'decision_needed');
  assert.equal(r.action, 'request_gpt_ruling_or_named_decision_channel');
});

test('五类保留家族只升级 GPT，动作名不带资金类指令', () => {
  for (const t of [
    task({title: '[TASK] REFUND terminal design'}),
    task({task_id: 'WALLET-P1-VERIFY', title: '[TASK] incremental verify'}),
    task({title: '[TASK] 私钥 助记词 根密钥 托管'}),
    task({task_id: 'PAYMENT-CAP', title: '[TASK] budget cap 0.05'}),
  ]) {
    const r = classifyTask(t, NOW);
    assert.equal(r.category, 'reserved_family');
    assert.equal(r.escalate_to, 'gpt');
    assert.equal(r.action, 'escalate_to_gpt_decision_only');
    assert.doesNotMatch(r.action, /refund|wallet|sign|pay|资金|退款|签名|钱包/i);
  }
});

test('过期租约标 stale（delivered 除外），未导致重复 claim 动作', () => {
  const stale = classifyTask(task({lease_until: '2026-11-20T09:52:41.260Z'}), NOW);
  assert.equal(stale.category, 'stale_lease');
  assert.match(stale.action, /reconcile_existing_attempt/);
  const delivered = classifyTask(task({state: 'delivered', lease_until: '2026-11-20T09:52:41.260Z'}), NOW);
  assert.equal(delivered.category, 'delivered_verify_evidence');
});

test('unblocked 重开且 0 尝试映射为待原任务号重领', () => {
  const r = classifyTask(task({reopened: {kind: 'unblocked', at: '2026-11-23T19:42:13Z'}}), NOW);
  assert.equal(r.category, 'reopened_awaiting_reclaim');
  assert.match(r.action, /original_task_id/);
});

test('本席 new 卡与未分席卡分开处理', () => {
  assert.equal(classifyTask(task({seat: 'workbuddy'}), NOW).category, 'own_seat_awaiting_claim');
  assert.equal(classifyTask(task({seat: null}), NOW).category, 'unassigned');
  assert.equal(classifyTask(task({seat: 'deep'}), NOW).category, 'new_awaiting_claim');
});

test('buildStuckTriage 兼容 tasks/items 两种字段并统计计数', () => {
  const snapshot = {
    schema: 'ltzzz.task-hub.v1', generated_at: '2026-11-28T07:08:24.335Z',
    counts: {open: 21, by_state: {new: 17, delivered: 3, blocked: 1}},
    tasks: [
      task({number: 703, title: '[DECISION] blockers', seat: null}),
      task({number: 522, state: 'blocked', title: '[TASK] RELAY BUDGET CAP'}),
      task({number: 473, seat: 'workbuddy'}),
      task({number: 640, state: 'delivered', pr: 'https://github.com/x/y/pull/687'}),
    ],
  };
  const out = buildStuckTriage({snapshot, now: NOW, date: '2026-11-28'});
  assert.equal(out.summary.schema, STUCK_SCHEMA);
  assert.equal(out.summary.source.generated_at, snapshot.generated_at);
  assert.equal(out.rows.length, 4);
  assert.equal(out.summary.by_category.decision_needed, 1);
  assert.equal(out.summary.by_category.blocked_state ?? 0, 0, 'blocked 且含 budget 词应归入保留家族');
  assert.equal(out.summary.by_category.reserved_family, 1);
  assert.equal(out.summary.by_category.own_seat_awaiting_claim, 1);
  assert.equal(out.summary.by_category.delivered_verify_evidence, 1);
  assert.equal(out.summary.totals.reserved_family_escalations, 1);
  const legacy = buildStuckTriage({snapshot: {items: [task({number: 1})]}, now: NOW, date: '2026-11-28'});
  assert.equal(legacy.rows.length, 1, '旧 items 字段仍可读');
});

test('writeStuckTriage 只写输出目录，不触碰输入快照', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-stuck-triage-'));
  const input = path.join(root, 'snapshot.json');
  const before = JSON.stringify({tasks: [task({number: 9, title: '[TASK] plain'})]});
  fs.writeFileSync(input, before, 'utf8');
  const snapshot = JSON.parse(before);
  const result = writeStuckTriage({root, snapshot, now: NOW, date: '2026-11-28'});
  assert.equal(result.status, 'written');
  assert.equal(fs.readFileSync(input, 'utf8'), before, '输入快照字节未变');
  assert.ok(fs.existsSync(path.join(root, result.files.latest)));
  assert.ok(fs.existsSync(path.join(root, result.files.dated)));
  const bytes = triageBytes(buildStuckTriage({snapshot, now: NOW, date: '2026-11-28'}));
  assert.ok(bytes.latest.endsWith('\n'));
  assert.equal(JSON.parse(bytes.latest).schema, STUCK_SCHEMA);
  fs.rmSync(root, {recursive: true, force: true});
});

test('missing 快照 fail soft：status missing 且不抛异常', () => {
  const out = buildStuckTriage({snapshot: null, now: NOW, date: '2026-11-28'});
  assert.equal(out.summary.source.status, 'missing');
  assert.equal(out.rows.length, 0);
});
