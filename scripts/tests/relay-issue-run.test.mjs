import test from 'node:test';
import assert from 'node:assert/strict';
import {seatRouteFromLabels, extractPrompt, buildPromptFile, SEAT_MODELS} from '../relay-issue-run.mjs';

test('按标签路由到两个中转席位', () => {
  assert.equal(seatRouteFromLabels([{name: 'relay:run'}, {name: 'seat:relay_gpt'}]), 'relay_gpt');
  assert.equal(seatRouteFromLabels(['seat:relay_claude']), 'relay_claude');
  assert.equal(seatRouteFromLabels(['relay:run']), null);
});

test('席位到模型/档位的映射固定', () => {
  assert.equal(SEAT_MODELS.relay_gpt.model, 'gpt-6.1-sol');
  assert.equal(SEAT_MODELS.relay_claude.model, 'claude-sonnet-4-6');
  assert.equal(SEAT_MODELS.relay_gpt.profile, 'adjudication');
});

test('正文为空时不产出提示词', () => {
  assert.equal(extractPrompt('   ').prompt, '');
  assert.equal(buildPromptFile({number: 1, body: ''}, {seat: 'relay_gpt'}).error, 'relay_issue_body_empty');
});

test('超长正文截断并标记截断', () => {
  const r = extractPrompt('a'.repeat(60), {maxChars: 20});
  assert.equal(r.prompt.length, 20);
  assert.equal(r.truncated, true);
});

test('提示词带边界声明且保留原正文', () => {
  const built = buildPromptFile({number: 610, body: '请裁决 X'}, {seat: 'relay_gpt'});
  assert.equal(built.error, undefined);
  assert.match(built.header, /Issue #610/);
  assert.match(built.header, /不得触碰资金/);
  assert.match(built.header, /请裁决 X/);
});

test('未知席位直接报错，不猜模型', () => {
  assert.equal(buildPromptFile({number: 1, body: 'x'}, {seat: 'relay_other'}).error, 'relay_issue_seat_unknown');
});
