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
    path: 'knowledge/results/deep-superagent/mail-intake/latest.json',
  },
  queue: {
    run_id: '44250221231',
    status: 'queue_results_verified',
    items: 2,
    task_statuses: [{task_id: 'DSA-TEST-01', status: 'job_terminal_observed', job_status: 'needs_gpt_decision'}],
    pending_gpt_decisions: 1,
    path: 'knowledge/results/deep-superagent/queue-44250221231-attempt-1.json',
  },
  daily: {
    status: 'done=2 needs_gpt_decision=1',
    generated_at_utc: '2026-11-18T07:48:00.000Z',
    pending_gpt_decisions: 1,
    path: 'knowledge/results/deep-superagent/daily-merge/latest.json',
  },
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

test('外层只描述目标，ROUTE 指令只出现在给 qianwen 的任务块内', () => {
  const card = buildDailyCard({date: '2026-11-19', evidence: evidence(), policy});
  const outer = card.prompt.slice(0, card.prompt.indexOf('【给 qianwen 的任务】'));
  assert.match(outer, /执行席只按该块执行/);
  assert.doesNotMatch(outer, /^ROUTE \|/m);
  assert.doesNotMatch(outer, /只输出一个 JSON 计划/);
  const nested = card.prompt.slice(card.prompt.indexOf('【给 qianwen 的任务】'));
  assert.match(nested, /^ROUTE \| <ref> \| <route> \|/m);
  assert.match(nested, /六个 ref 必须齐全/);
  assert.match(nested, /C2 task_statuses=/);
  assert.match(nested, /C4 main_short_sha=/);
});

test('可核实 ref 带上回执路径与待裁数量，汇总 ref 明确 path=none', () => {
  const card = buildDailyCard({date: '2026-11-19', evidence: evidence(), policy});
  assert.match(card.prompt, /C1 last_queue_run=44250221231 status=queue_results_verified items=2 pending_gpt_decisions=1 receipt_consistent=yes path=knowledge\/results\/deep-superagent\/queue-44250221231-attempt-1\.json/);
  assert.match(card.prompt, /C3 last_daily_merge=done=2 needs_gpt_decision=1 .*pending_gpt_decisions=1 receipt_consistent=yes path=knowledge\/results\/deep-superagent\/daily-merge\/latest\.json/);
  assert.match(card.prompt, /B1 .*receipt_consistent=no path=knowledge\/results\/deep-superagent\/mail-intake\/latest\.json/);
  assert.match(card.prompt, /A1 .*path=none/);
  assert.match(card.prompt, /A2 .*path=none/);
  assert.match(card.prompt, /ref，必须全部覆盖】A1 \/ A2 \/ B1 \/ B2 \/ C1 \/ C3/);
  assert.match(card.prompt, /不得省略、不得合并/);
  assert.match(card.prompt, /本卡只做分诊，不关闭任何项；不得输出 coordinator_close_with_receipt/);
  assert.match(card.prompt, /pending_gpt_decisions 大于 0 → needs_gpt_decision/);
  assert.doesNotMatch(card.prompt, /^coordinator_close_with_receipt \//m);
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

test('daily-merge 无顶层 status 时按 done/needs_gpt_decision 计数并给出不可变路径', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'dispatch-daily-evidence-'));
  try {
    const dir = path.join(root, 'knowledge/results/deep-superagent');
    fs.mkdirSync(path.join(dir, 'daily-merge'), {recursive: true});
    const dailyMerge = JSON.stringify({
      date: '2026-11-19',
      generated_at_utc: '2026-11-19T07:43:58.423Z',
      done: [{task_id: 'DEEP-DAILY-SUPERVISION'}],
      needs_gpt_decision: [{task_id: 'DEEP-SUPERAGENT-20261119-DAILY-2'}],
    });
    fs.writeFileSync(path.join(dir, 'daily-merge/2026-11-19.json'), dailyMerge);
    fs.writeFileSync(path.join(dir, 'daily-merge/latest.json'), dailyMerge);
    fs.writeFileSync(path.join(dir, 'queue-44488314090-attempt-1.json'), JSON.stringify({
      run_id: '44488314090',
      status: 'queue_results_verified',
      items: [{task_id: 'DEEP-SUPERAGENT-20261119-DAILY-4', status: 'job_terminal_observed', job: {status: 'needs_gpt_decision'}}],
    }));
    // 更新的 push 触发回执没有任务，C1 不应被它覆盖。
    fs.writeFileSync(path.join(dir, 'queue-44489000000-attempt-1.json'), JSON.stringify({
      run_id: '44489000000',
      status: 'no_new_queue_cards',
      items: [],
    }));
    const found = collectEvidence(root, {exec: () => '0123456789ab\n'});
    assert.equal(found.daily.status, 'done=1 needs_gpt_decision=1');
    assert.equal(found.daily.path, 'knowledge/results/deep-superagent/daily-merge/2026-11-19.json');
    assert.equal(found.queue.run_id, '44488314090');
    assert.equal(found.queue.path, 'knowledge/results/deep-superagent/queue-44488314090-attempt-1.json');
    assert.equal(found.queue.pending_gpt_decisions, 1);
    assert.equal(found.daily.pending_gpt_decisions, 1);
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
