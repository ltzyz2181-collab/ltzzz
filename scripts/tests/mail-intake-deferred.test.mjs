import test from 'node:test';
import assert from 'node:assert/strict';
import {buildIntake, exitCodeFor} from '../run-mail-intake.mjs';

// CI（ubuntu-latest）没有 agently-cli 与 AGENTLY_CLI_SESSION。邮件采集按部署分工由云主机席位负责，
// 因此 CI 里 Agent Mail / 裁决跟踪只能记 not_configured_deferred，绝不能被记成 ok 或"读过"。
const base = (overrides = {}) => ({
  backlog: {status: 'missing', items: [], count: 0, open_count: 0},
  fullbox: {status: 'ok', count: 1, open_count: 1, messages: [], full_box_total: 10, body_reads: 0, window_truncated: false},
  tracker: null,
  backlogRun: {code: 1},
  gmailRun: {code: 0},
  trackerRun: {code: 2},
  now: new Date('2026-11-24T01:00:00.000Z'),
  ...overrides,
});

test('CI without agently credentials defers Agent Mail instead of failing the whole run', () => {
  const doc = buildIntake(base({env: {GITHUB_ACTIONS: 'true'}}));
  assert.equal(doc.status, 'ok_deferred_channels');
  assert.equal(doc.agent_mail.status, 'not_configured_deferred');
  assert.equal(doc.agent_mail.deferred_to, 'vm_seat');
  assert.equal(doc.ruling_tracker.status, 'not_configured_deferred');
  assert.deepEqual(doc.coverage.deferred_channels, ['agent_mail', 'ruling_tracker']);
  assert.deepEqual(doc.coverage.configured_channels, ['gmail_fullbox']);
  assert.equal(doc.gmail_fullbox.status, 'ok');
  assert.equal(exitCodeFor(doc.status), 0);
  // 关键：延后不等于读过。
  assert.notEqual(doc.agent_mail.status, 'ok');
});

test('outside CI the same credential failure stays a real failure (no silent deferral)', () => {
  const doc = buildIntake(base({env: {}}));
  assert.equal(doc.status, 'partial');
  assert.notEqual(doc.agent_mail.status, 'not_configured_deferred');
  assert.equal(doc.coverage.deferred_channels.length, 0);
  assert.equal(exitCodeFor(doc.status), 2);
});

test('a failed configured channel still prevents ok_deferred_channels', () => {
  const doc = buildIntake(base({
    env: {GITHUB_ACTIONS: 'true'},
    fullbox: {status: 'failed', count: 0, open_count: 0, messages: []},
    gmailRun: {code: 3},
  }));
  assert.ok(['partial', 'failed'].includes(doc.status));
  assert.equal(exitCodeFor(doc.status), doc.status === 'failed' ? 3 : 2);
});

test('configured-but-broken agent mail in CI is not deferred', () => {
  const doc = buildIntake(base({env: {GITHUB_ACTIONS: 'true', AGENTLY_CLI_SESSION: 'stub-session'}, backlogRun: {code: 3}}));
  assert.notEqual(doc.agent_mail.status, 'not_configured_deferred');
  assert.ok(['partial', 'failed'].includes(doc.status));
});
