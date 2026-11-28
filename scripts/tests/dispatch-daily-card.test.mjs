import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {analyzeCardPrompt} from '../check-card-contract.mjs';
import {checkCard, loadPolicy} from '../dispatch-seat-policy.mjs';
import {normalizeTaskCard, parseTaskCard} from '../run-deep-superagent-queue.mjs';
import {fiduciaryInstructionHit, normalizeAutonomy} from '../deep-autonomy.mjs';
import {
  DATE_RE,
  buildDailyCard,
  buildOpsCard,
  cardPath,
  collectEvidence,
  opsCardPath,
  selectOpsRepoRead,
  writeDailyCard,
  writeDailyCards,
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

test('每日执行卡通过政策/合同/队列规范，并带可执行 autonomy', () => {
  const card = buildOpsCard({
    date: '2026-11-27',
    evidence: evidence(),
    policy,
    repoRead: ['knowledge/results/deep-superagent/backlog/latest.json'],
  });
  assert.equal(card.task_id, 'DEEP-SUPERAGENT-20261127-OPS-1');
  assert.equal(card.package_id, 'LTZZZ-DEEP-OPS-20261127-1');
  assert.equal(card.importance, 'high');
  assert.deepEqual(card.seats.map((seat) => seat.seat), ['deep', 'claude-relay', 'gpt-relay']);
  assert.deepEqual(checkCard(policy, card), []);
  assert.equal(analyzeCardPrompt(card.prompt).mixed, false);
  assert.deepEqual(card.autonomy, {
    mode: 'auto',
    repo_read: ['knowledge/results/deep-superagent/backlog/latest.json'],
    code_change: true,
    deploy: {workflow: 'deep-superagent.yml'},
  });
  assert.equal(fiduciaryInstructionHit(card.prompt).hit, false);
  const parsed = parseTaskCard(card);
  assert.equal(parsed.job.task_id, card.task_id);
  assert.equal(parsed.autonomy.mode, 'auto');
  assert.equal(parsed.autonomy.code_change, true);
  assert.deepEqual(Object.keys(parsed.job).sort(), ['data_classification', 'package_id', 'platform', 'prompt', 'task_id']);
});

test('执行卡要求中转席参与，但不在卡面写保留家族指令', () => {
  const card = buildOpsCard({date: '2026-11-27', evidence: evidence(), policy, repoRead: []});
  assert.match(card.prompt, /claude-relay 与 gpt-relay/);
  assert.match(card.prompt, /不得自证 provider\/model/);
  assert.match(card.prompt, /escalate_to=gpt/);
  // 边界句以“不得”开头，资金域扫描会整句剔除；模型输出仍按原文严格扫描。
  assert.equal(fiduciaryInstructionHit(card.prompt).hit, false);
});

test('执行卡把分流单里的真实任务 ID 带进卡面，并要求按注入证据核对', () => {
  const triage = {
    summary: {
      totals: {triaged_cases: 275, reserved_family_escalations: 0},
      by_seat: {qianwen: 82, deepseek: 73},
      oldest: [{
        task_id: 'QIANWEN-RETURN-2026-10-16',
        case_id: 'case-1',
        seat: 'qianwen',
        action: 'reconcile_external_return_with_original_claim',
        since: '2026-10-16',
      }],
      mail: {sampled: 60},
    },
  };
  const card = buildOpsCard({date: '2026-11-27', evidence: evidence(), policy, repoRead: [], triage});
  assert.match(card.prompt, /QIANWEN-RETURN-2026-10-16/);
  assert.match(card.prompt, /【仓库读取证据】/);
  assert.match(card.prompt, /summary\.json/);
  // latest.json 是完整记录，但超过注入预算时不会进 prompt；卡面不能谎称它已被注入。
  assert.match(card.prompt, /size_budget_exceeded/);
  assert.doesNotMatch(card.prompt, /latest\.json（逐条分流）和 summary\.json/);
  assert.match(card.prompt, /blocked_bridge_evidence_missing/);
  // 不允许用 T001… 占位 ID 冒充逐项分流。
  assert.doesNotMatch(card.prompt, /T001/);
  assert.equal(fiduciaryInstructionHit(card.prompt).hit, false);
});

test('repo_read 只选受信桥接层能读且总量在预算内的文件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-ops-read-'));
  try {
    const dir = path.join(root, 'knowledge/results/deep-superagent/backlog');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(path.join(dir, 'latest.json'), 'x'.repeat(50 * 1024));
    fs.writeFileSync(path.join(dir, 'summary.json'), 'x'.repeat(5 * 1024));
    assert.deepEqual(selectOpsRepoRead(root), [
      'knowledge/results/deep-superagent/backlog/latest.json',
      'knowledge/results/deep-superagent/backlog/summary.json',
    ]);
    fs.writeFileSync(path.join(dir, 'latest.json'), 'x'.repeat(59 * 1024));
    assert.deepEqual(selectOpsRepoRead(root), ['knowledge/results/deep-superagent/backlog/latest.json']);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('同日一次写入分诊卡与执行卡，重复运行保持幂等', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'deep-daily-cards-'));
  try {
    const triage = {summary: {totals: {triaged_cases: 275, reserved_family_escalations: 0}, oldest: [], mail: {sampled: 120}}};
    const first = writeDailyCards({root, date: '2026-11-27', evidence: evidence(), policy, triage});
    assert.deepEqual(first.cards.map((item) => item.status), ['created', 'created']);
    assert.ok(fs.existsSync(path.join(root, cardPath('2026-11-27'))));
    assert.ok(fs.existsSync(path.join(root, opsCardPath('2026-11-27'))));
    const second = writeDailyCards({root, date: '2026-11-27', evidence: evidence(), policy, triage});
    assert.deepEqual(second.cards.map((item) => item.status), ['already_exists', 'already_exists']);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('执行卡的 autonomy 规范化后仍拒绝保留家族写路径', () => {
  assert.throws(() => normalizeAutonomy({mode: 'auto', repo_read: ['.env']}), /denied_repo_read_path/);
});
