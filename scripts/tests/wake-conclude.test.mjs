import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseVerdicts,
  isReservedTopic,
  planConclusion,
  pickSeat,
  buildDispatchCard,
  dispatchTitle
} from '../lib/wake-conclude.mjs';

const C = (id, body, at = '2026-11-21T06:00:00Z') => ({id, body, created_at: at});

test('parseVerdicts reads seat and stance and ignores malformed lines', () => {
  const verdicts = parseVerdicts([
    C(1, '[verdict] seat=deep stance=agree reason=方向对'),
    C(2, 'noise\n[verdict] seat=doubao stance=disagree reason=太早'),
    C(3, '[verdict] seat=qianwen stance=maybe reason=x')
  ]);
  assert.deepEqual(verdicts.map(v => [v.seat, v.stance]), [['deep', 'agree'], ['doubao', 'disagree']]);
  assert.equal(verdicts[0].reason, '方向对');
});

test('reserved families are detected in both languages', () => {
  assert.equal(isReservedTopic('把退款终态改成自动'), true);
  assert.equal(isReservedTopic('调整钱包签名流程'), true);
  assert.equal(isReservedTopic('Refund finality'), true);
  assert.equal(isReservedTopic('优化派单队列'), false);
});

test('a single seat is not a discussion', () => {
  const plan = planConclusion({topic: '优化派单', verdicts: [{seat: 'deep', stance: 'agree'}]});
  assert.equal(plan.action, 'request_evidence');
  assert.equal(plan.reason, 'not_enough_seats');
});

test('two agreeing seats produce a dispatch plan with an execution seat', () => {
  const plan = planConclusion({
    topic: '重构派单脚本',
    verdicts: [{seat: 'deep', stance: 'agree'}, {seat: 'doubao', stance: 'agree'}]
  });
  assert.equal(plan.action, 'dispatch');
  assert.equal(plan.seat, 'desktop_claude', '代码类议题归主开发');
  assert.equal(plan.agrees, 2);
});

test('disagreement escalates instead of dispatching', () => {
  const plan = planConclusion({
    topic: '换主模型',
    verdicts: [{seat: 'deep', stance: 'agree'}, {seat: 'kimi_cn', stance: 'disagree'}]
  });
  assert.equal(plan.action, 'escalate');
  assert.equal(plan.verdict, 'split');
});

test('reserved topics never dispatch even when everyone agrees', () => {
  const plan = planConclusion({
    topic: '自动退款审批',
    verdicts: [{seat: 'deep', stance: 'agree'}, {seat: 'doubao', stance: 'agree'}]
  });
  assert.equal(plan.action, 'recommend_only');
  assert.equal(plan.reason, 'reserved_family');
});

test('the dispatch card keeps source, reasons and acceptance wording', () => {
  const body = buildDispatchCard({
    topic: '统一派单标签',
    sourceIssue: 536,
    seats: ['deep', 'doubao'],
    verdicts: [{seat: 'deep', stance: 'agree', reason: '少一次人工'}, {seat: 'doubao', stance: 'agree', reason: '可测'}]
  });
  assert.match(body, /#536/);
  assert.match(body, /deep\` agree：少一次人工/);
  assert.match(body, /CI 绿/);
  assert.match(body, /not_required/);
  assert.equal(dispatchTitle('x'.repeat(80)).length <= 67, true);
});

test('seat picking follows the topic', () => {
  assert.equal(pickSeat('修 PR 测试'), 'desktop_claude');
  assert.equal(pickSeat('调整派单节奏'), 'deep');
});
