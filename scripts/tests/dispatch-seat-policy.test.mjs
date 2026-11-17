import test from 'node:test';
import assert from 'node:assert/strict';
import { loadPolicy, requiredSeats, buildCard, checkCard } from '../dispatch-seat-policy.mjs';

const policy = loadPolicy();

test('high 任务必须三席：deep 主办 + claude 与 gpt 中转复核', () => {
  const need = requiredSeats(policy, 'high');
  assert.deepEqual(need, [
    { seat: 'deep', role: 'primary_executor' },
    { seat: 'claude-relay', role: 'independent_review' },
    { seat: 'gpt-relay', role: 'independent_review' },
  ]);
});

test('medium 任务只要求 deep 单席', () => {
  assert.deepEqual(requiredSeats(policy, 'medium'), [{ seat: 'deep', role: 'primary_executor' }]);
});

test('template 生成的 high 卡合规且各席不持裁决权', () => {
  const card = buildCard({ policy, taskId: 'T-1', packageId: 'P-1', importance: 'high' });
  assert.equal(card.importance, 'high');
  assert.equal(card.seats.length, 3);
  assert.ok(card.seats.every((s) => s.decision_authority === false));
  assert.deepEqual(checkCard(policy, card), []);
});

test('缺 gpt 中转席直接判错', () => {
  const card = buildCard({ policy, taskId: 'T-2', packageId: 'P-2', importance: 'high' });
  card.seats = card.seats.filter((s) => s.seat !== 'gpt-relay');
  assert.ok(checkCard(policy, card).some((p) => p.includes('缺必需席位 gpt-relay')));
});

test('中转席自授裁决权必须判错', () => {
  const card = buildCard({ policy, taskId: 'T-3', packageId: 'P-3', importance: 'high' });
  card.seats.find((s) => s.seat === 'claude-relay').decision_authority = true;
  assert.ok(checkCard(policy, card).some((p) => p.includes('不得持有裁决权')));
});

test('历史卡（无 importance 无 seats）不判错', () => {
  assert.deepEqual(checkCard(policy, { task_id: 'OLD', package_id: 'P', prompt: 'x' }), []);
});

test('有 seats 但缺 importance 判错', () => {
  assert.ok(checkCard(policy, { task_id: 'X', package_id: 'P', seats: [] }).some((p) => p.includes('缺 importance')));
});
