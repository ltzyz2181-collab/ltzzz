import test from 'node:test';
import assert from 'node:assert/strict';
import {summarize} from '../check-gpt-ruling-mail.mjs';

const msg = (created_at, subject, email = 'ltzyz2181@gmail.com') => ({created_at, subject, message_id: 'msg_' + created_at, from: {email}});

test('当日有裁决类回信：received=true 且计数正确', () => {
  const r = summarize([
    msg('2026-11-16T19:54:37Z', 'Re: LTZZZ AI雇佣AI Phase1 六项安全要求落地核对，请裁决'),
    msg('2026-11-16T19:51:00Z', 'Re: LTZZZ AI雇佣AI Phase1 六项安全要求落地核对，请裁决'),
    msg('2026-11-16T18:00:00Z', '自动通知：构建完成'),
    msg('2026-11-16T18:00:00Z', 'Re: 裁决', 'someone@agent.qq.com')
  ], new Date('2026-11-17T05:08:00Z'));
  assert.equal(r.received, true);
  assert.equal(r.today_count, 2);
  assert.equal(r.severity, 'ok');
  assert.equal(r.last_message_id, 'msg_2026-11-16T19:54:37Z');
});

test('当日没有裁决回信：明确报警并给天数', () => {
  const r = summarize([
    msg('2026-11-14T02:00:00Z', '[LTZZZ][集中裁决] 未裁决事项闭合'),
    msg('2026-11-15T02:00:00Z', '自动通知：构建完成')
  ], new Date('2026-11-17T05:08:00Z'));
  assert.equal(r.received, false);
  assert.equal(r.today_count, 0);
  assert.equal(r.severity, 'owner_attention');
  assert.ok(r.days_since_last_ruling >= 2);
  assert.match(r.note, /今日未见 GPT 裁决回信/);
});

test('窗口内一封裁决都没有：不得报成已收到', () => {
  const r = summarize([msg('2026-11-16T02:00:00Z', '构建完成')], new Date('2026-11-17T05:08:00Z'));
  assert.equal(r.received, false);
  assert.equal(r.last_message_id, null);
  assert.equal(r.severity, 'unknown');
});

test('GPT 主题为「Re: [GPT总控派单]」的回信必须计入，不得漏成没收到', () => {
  const r = summarize([
    msg('2026-11-22T20:58:13Z', 'Re: [LTZZZ][GPT总控派单] DEEP-SUPERAGENT-20261118-BACKLOG-2｜#436 当前证据修正'),
    msg('2026-11-22T19:57:42Z', 'Re: [GPT总控派单] REFUND-DEFENSE-F2-IDEMPOTENCY-DESIGN-20261118-01'),
    msg('2026-11-22T19:57:39Z', 'Re: [GPT总控派单] WALLET-P1-INCREMENTAL-VERIFY'),
    msg('2026-11-22T19:00:00Z', '自动通知：构建完成')
  ], new Date('2026-11-22T23:00:00Z'));
  assert.equal(r.received, true);
  assert.equal(r.today_count, 3);
  assert.equal(r.matched_by.keyword, 0);
  assert.equal(r.matched_by.reply_prefix, 3);
  assert.equal(r.severity, 'ok');
});

test('非 GPT 的 Re: 回信不计入', () => {
  const r = summarize([msg('2026-11-22T20:00:00Z', 'Re: [GPT总控派单] 某任务', 'other@agent.qq.com')], new Date('2026-11-22T23:00:00Z'));
  assert.equal(r.received, false);
  assert.equal(r.today_count, 0);
});
