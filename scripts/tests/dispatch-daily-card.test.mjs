import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeCardPrompt} from '../check-card-contract.mjs';
import {checkCard, loadPolicy} from '../dispatch-seat-policy.mjs';
import {normalizeTaskCard} from '../run-deep-superagent-queue.mjs';
import {
  DATE_RE,
  buildDailyCard,
  cardPath,
  collectEvidence,
  writeDailyCard,
} from '../dispatch-daily-card.mjs';

const policy = loadPolicy();
const evidence = (overrides = {}) => ({
  head: '0123456789ab',
  oversight_date: '2026-11-18',
  backlog: {
    open_warning_cases: 195,
    unique_original_tasks: 195,
    not_rechecked_in_current_window: 159,
    by_responsible_seat: {qianwen: 62, deepseek: 49, doubao: 43, grok: 32, gpt: 9},
  },
  mail: {
    status: 'partial',
    gmail_status: 'ok',
    agent_mail_status: 'missing',
    open_or_dispatch: 200,
    unified: 1133,
    at: '2026-11-18T02:29:51.596Z',
  },
  queue: {
    run_id: '44250221231',
    status: 'queue_results_verified',
    items: 2,
    task_statuses: [{task_id: 'DSA-TEST-01', status: 'job_terminal_observed', job_status: 'completed_pending_external_acceptance'}],
  },
  daily: {status: 'daily_result_readback_complete', generated_at_utc: '2026-11-18T07:48:00.000Z'},
  ...overrides,
});

test('每日卡通过派单政策、卡合同与队列规范', () => {
  const card = buildDailyCard({date: '2026-11-19', evidence: evidence(), policy});
  assert.match(card.task_id, /^DEEP-SUPERAGENT-20261119-DAILY-1$/);
  assert.equal(card.package_id, 'LTZZZ-DEEP-DAILY-20261119-1');
  assert.equal(card.importance, 'medium');
  assert.deepEqual(card.seats, [{seat: 'deep', role: 'primary_executor', decision_authority: false}]);
  assert.deepEqual(checkCard(policy, card), []);
  const contract = analyzeCardPrompt(card.prompt);
  assert.equal(contract.mixed, false);
  assert.equal(contract.has_nested_worker, true);
  assert.equal(normalizeTaskCard(card).task_id, card.task_id);
  assert.deepEqual(Object.keys(normalizeTaskCard(card)).sort(), ['data_classification', 'package_id', 'platform', 'prompt', 'task_id']);
});

test('规划席只看到 JSON 契约，ROUTE 行只出现在给 qianwen 的任务块内', () => {
  const card = buildDailyCard({date: '2026-11-19', evidence: evidence(), policy});
  const outer = card.prompt.slice(0, card.prompt.indexOf('【给 qianwen 的任务】'));
  assert.match(outer, /只输出一个 JSON 计划/);
  assert.match(outer, /"tasks":\[\{"seat":"qianwen"/);
  assert.doesNotMatch(outer, /^ROUTE \|/m);
  const nested = card.prompt.slice(card.prompt.indexOf('【给 qianwen 的任务】'));
  assert.match(nested, /^ROUTE \| <ref> \| <route> \|/m);
  assert.match(nested, /本次输入未给任何回执文件路径/);
  assert.match(nested, /C2 的 task_statuses=\[\] 与 C4 的 main_short_sha 只是上下文/);
});

test('同日重试卡用 suffix 区分任务、包与文件名', () => {
  const card = buildDailyCard({date: '2026-11-19', evidence: evidence(), policy, suffix: 2});
  assert.equal(card.task_id, 'DEEP-SUPERAGENT-20261119-DAILY-2');
  assert.equal(card.package_id, 'LTZZZ-DEEP-DAILY-20261119-2');
  assert.equal(cardPath('2026-11-19', 2), 'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261119-DAILY-2.json');
  assert.deepEqual(checkCard(policy, card), []);
  for (const suffix of [0, 10, 1.5, '2', null]) {
    assert.throws(() => buildDailyCard({date: '2026-11-19', evidence: evidence(), policy, suffix}), /invalid_daily_card_suffix/);
  }
});

test('日期非法时拒绝生成', () => {
  assert.match('2026-11-19', DATE_RE);
  assert.throws(() => buildDailyCard({date: '../20261119', evidence: evidence(), policy}), /invalid_daily_card_date/);
  assert.throws(() => buildDailyCard({date: '20261119', evidence: evidence(), policy}), /invalid_daily_card_date/);
});

test('同一日期重复写入保持幂等且不覆盖既有卡', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-daily-card-'));
  try {
    const first = writeDailyCard({root, date: '2026-11-19', evidence: evidence(), policy});
    assert.equal(first.status, 'created');
    const abs = path.join(root, cardPath('2026-11-19'));
    const before = fs.readFileSync(abs, 'utf8');
    const second = writeDailyCard({root, date: '2026-11-19', evidence: evidence(), policy});
    assert.equal(second.status, 'already_exists');
    assert.equal(fs.readFileSync(abs, 'utf8'), before);

    fs.writeFileSync(abs, JSON.stringify({...JSON.parse(before), prompt: 'tampered'}, null, 1) + '\n');
    const third = writeDailyCard({root, date: '2026-11-19', evidence: evidence(), policy});
    assert.equal(third.status, 'already_exists_different');
    assert.match(fs.readFileSync(abs, 'utf8'), /tampered/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('公开证据缺失时仍生成卡，但所有未知项写 unknown', () => {
  const card = buildDailyCard({
    date: '2026-11-20',
    evidence: collectEvidence(path.join(os.tmpdir(), 'definitely-missing-ltzzz-root'), {exec: () => { throw new Error('no git'); }}),
    policy,
  });
  assert.match(card.prompt, /open_warning_cases=unknown/);
  assert.match(card.prompt, /intake_status=unknown/);
  assert.match(card.prompt, /last_queue_run=unknown/);
  assert.match(card.prompt, /main_short_sha=unknown/);
  assert.deepEqual(checkCard(policy, card), []);
});

test('带 seats 但不带 importance 的卡在队列入口被 fails closed 拒绝', () => {
  const card = buildDailyCard({date: '2026-11-21', evidence: evidence(), policy});
  const broken = {...card};
  delete broken.importance;
  assert.throws(() => normalizeTaskCard(broken), /dispatch_seat_policy_violation/);
});
