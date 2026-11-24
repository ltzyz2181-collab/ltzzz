import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildTodoReport, 
  REQUEST_SCHEMA,
  SUMMARY_SCHEMA,
  buildEmail,
  buildSummary,
  collectEvidence,
  extractAsks,
  redactReason,
  redactText,
  summarizeQueueReport,
  writeSummary,
} from '../daily-ops-summary.mjs';

const queueReport = (run = '50000000001') => ({
  schema: 'ltzzz.deep-superagent.queue.v1',
  run_id: run,
  at_utc: '2026-11-19T01:10:00.000Z',
  status: 'queue_results_verified',
  items: [
    {
      task_id: 'DSA-DONE-01', package_id: 'PKG-DONE', status: 'job_terminal_observed',
      job: {
        status: 'completed_pending_external_acceptance', model_calls: 3,
        outputs: [{text: 'Mock public output; no external acceptance.'}],
      },
    },
    {
      task_id: 'DSA-GPT-01', package_id: 'PKG-GPT', status: 'job_terminal_observed',
      job: {
        status: 'needs_gpt_decision', model_calls: 2,
        plan: {needs_gpt_decision: true, reason: '涉及签名路径，需 GPT 裁决'},
        outputs: [{text: 'ROUTE | B2 | needs_gpt_decision | 涉及签名\nASK | B2 | gpt | 请裁决签名边界与范围'}],
      },
    },
    {
      task_id: 'DSA-OWNER-01', package_id: 'PKG-OWNER', status: 'job_terminal_observed',
      job: {
        status: 'needs_owner_decision', model_calls: 1,
        outputs: [{text: 'ASK | B4 | owner | 请给出归并后的任务分配'}],
      },
    },
    {
      task_id: 'DSA-BLOCKED-01', package_id: 'PKG-BLOCKED', status: 'blocked',
      error: 'upstream_gateway_timeout_504', job: {status: 'blocked'},
    },
  ],
});

const dailyReport = {
  schema: 'ltzzz.deep-superagent.daily.v1', run_id: '50000000002',
  at_utc: '2026-11-19T00:40:00.000Z', task_id: 'DEEP-DAILY-SUPERVISION',
  status: 'daily_result_readback_complete', model_calls: 3,
};

const intake = {
  status: 'partial', at: '2026-11-19T00:23:00.000Z',
  gmail_fullbox: {status: 'ok'}, agent_mail: {status: 'missing'},
  qq_fullbox: {status: 'ok', count: 3},
  counts: {open_or_dispatch: 12},
  gmail_rulings: {status: 'ok', today_count: 1, decision_ids: ['GPT-TEST-20261119-01']},
};

const evidence = (overrides = {}) => ({
  queueReports: [{path: 'knowledge/results/deep-superagent/queue-50000000001-attempt-1.json', body: queueReport()}],
  dailyReports: [{path: 'knowledge/results/deep-superagent/daily-50000000002-attempt-1.json', body: dailyReport}],
  intake,
  oversight: {date: '2026-11-18', backlog: {open_warning_cases: 10}},
  cardsToday: ['DEEP-SUPERAGENT-20261119-DAILY-1.json'],
  ...overrides,
});

test('队列回执被分为完成、待 GPT、待 owner、阻塞四类', () => {
  const items = summarizeQueueReport(queueReport());
  assert.equal(items.length, 4);
  assert.equal(items[0].needs_gpt_decision, false);
  assert.equal(items[1].needs_gpt_decision, true);
  assert.deepEqual(items[1].asks, [{ref: 'B2', target: 'gpt', ask: '请裁决签名边界与范围'}]);
  assert.equal(items[2].needs_owner_decision, true);
  assert.equal(items[3].status, 'blocked');
});

test('每日合并只汇总公开回执并生成三段式邮件', () => {
  const summary = buildSummary({date: '2026-11-19', now: new Date('2026-11-19T02:10:00.000Z'), evidence: evidence()});
  assert.equal(summary.schema, SUMMARY_SCHEMA);
  assert.equal(summary.counts.done, 2);
  assert.equal(summary.counts.needs_gpt_decision, 1);
  assert.equal(summary.counts.needs_owner_decision, 1);
  assert.equal(summary.counts.blocked, 1);
  assert.equal(summary.merge_performed, false);
  assert.equal(summary.deploy_performed, false);
  assert.equal(summary.secrets_included, false);
  assert.equal(summary.mail.gmail_rulings.today_count, 1);
  assert.match(summary.email.body, /qq=ok/);
  assert.match(summary.email.subject, /完成=2/);
  assert.match(summary.email.subject, /待GPT裁决=1/);
  assert.match(summary.email.body, /一、今天完成了什么/);
  assert.match(summary.email.body, /三、需要 GPT 裁决/);
  assert.match(summary.email.body, /四、下一步/);
  assert.match(summary.email.body, /ASK B2：请裁决签名边界与范围/);
  assert.doesNotMatch(summary.email.body, /password|app_password|authorization/i);
});

test('没有 GPT 待裁决项时也明确写“没有”，不伪造裁决', () => {
  const report = queueReport();
  report.items = report.items.filter((item) => item.task_id !== 'DSA-GPT-01');
  const summary = buildSummary({
    date: '2026-11-19', evidence: evidence({queueReports: [{path: 'queue.json', body: report}]}),
  });
  assert.equal(summary.counts.needs_gpt_decision, 0);
  assert.match(summary.email.body, /今天没有需要 GPT 裁决的项/);
});

test('邮件摄入缺失时写 unknown，不写成“没有邮件”', () => {
  const summary = buildSummary({date: '2026-11-19', evidence: evidence({intake: null})});
  assert.equal(summary.mail.status, 'unknown');
  assert.equal(summary.mail.gmail_rulings.status, 'unknown');
  assert.match(summary.email.body, /status=unknown/);
});

test('脱敏函数去掉长 token 与金额', () => {
  const text = redactText('send 100 USDC and token abcdefghijklmnopqrstuvwxyz123456');
  assert.match(text, /<amount>/);
  assert.match(text, /<token>/);
  assert.doesNotMatch(text, /100 USDC|abcdefghijklmnopqrstuvwxyz/);
});

test('原因码保留原意，只有像凭据的长串才打码', () => {
  // 2026-11-19 实测：coordinator_plan_unparseable 恰好 28 字符，被旧规则吃成 <token>
  assert.equal(redactReason('coordinator_plan_unparseable'), 'coordinator_plan_unparseable');
  assert.equal(redactReason('upstream_gateway_timeout_504'), 'upstream_gateway_timeout_504');
  assert.equal(redactReason(''), '');
  assert.equal(redactReason('ghp_abcdefghijklmnopqrstuvwxyz0123456789'), '<token>');
  assert.equal(redactReason('0123456789abcdef0123456789abcdef01234567'), '<token>');
});

test('needs_gpt_decision 没有 ASK | gpt 行时补裁决问题，并带上复核意见', () => {
  const report = {
    schema: 'ltzzz.deep-superagent.queue.v1', run_id: '50000000009',
    items: [{
      task_id: 'DSA-GPT-FALLBACK', package_id: 'PKG-FALLBACK', status: 'job_terminal_observed',
      job: {
        status: 'needs_gpt_decision', model_calls: 3,
        plan: {reason: 'coordinator_plan_unparseable'},
        review: {needs_gpt_decision: true, reason: 'C2 and C4 incorrectly routed as coordinator_close_with_receipt'},
        outputs: [{text: 'ASK | B1 | evidence | 需要邮件通道回执'}],
      },
    }],
  };
  const items = summarizeQueueReport(report);
  assert.equal(items[0].reason, 'coordinator_plan_unparseable');
  assert.equal(items[0].review_reason, 'C2 and C4 incorrectly routed as coordinator_close_with_receipt');
  const summary = buildSummary({
    date: '2026-11-19', evidence: evidence({queueReports: [{path: 'queue.json', body: report}]}),
  });
  assert.equal(summary.counts.needs_gpt_decision, 1);
  const [item] = summary.needs_gpt_decision;
  assert.equal(item.asks.length, 1);
  assert.equal(item.asks[0].target, 'gpt');
  assert.match(item.asks[0].ask, /decision_id/);
  assert.equal(item.related_asks.length, 1);
  assert.match(summary.email.body, /复核意见：C2 and C4/);

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-ops-gpt-'));
  try {
    const written = writeSummary({root, summary});
    const record = JSON.parse(fs.readFileSync(path.join(root, written.ruling_requests[0].path), 'utf8'));
    assert.equal(record.reason, 'coordinator_plan_unparseable');
    assert.equal(record.asks.length, 1);
    assert.equal(record.asks[0].target, 'gpt');
    assert.equal(record.related_asks.length, 1);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('裁决请求 append-only，重复写入不覆盖', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-ops-summary-'));
  try {
    const summary = buildSummary({date: '2026-11-19', evidence: evidence()});
    const first = writeSummary({root, summary});
    assert.equal(first.ruling_requests.length, 1);
    assert.equal(first.ruling_requests[0].status, 'created');
    const abs = path.join(root, first.ruling_requests[0].path);
    const record = JSON.parse(fs.readFileSync(abs, 'utf8'));
    assert.equal(record.schema, REQUEST_SCHEMA);
    assert.equal(record.status, 'awaiting_gpt');
    assert.equal(record.decision_authority, 'gpt_or_owner_only');
    assert.equal(record.contains_mail_body, false);
    assert.equal(record.contains_credentials, false);

    const before = fs.readFileSync(abs, 'utf8');
    const second = writeSummary({root, summary});
    assert.equal(second.ruling_requests[0].status, 'already_exists');
    assert.equal(fs.readFileSync(abs, 'utf8'), before);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('旧裁决请求缺 reason/asks 时追加 -rN 修正记录，不覆盖原文件', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-ops-rreq-'));
  try {
    const summary = buildSummary({date: '2026-11-19', evidence: evidence()});
    const dir = path.join(root, 'ops/deep-superagent/ruling-requests');
    fs.mkdirSync(dir, {recursive: true});
    const base = path.join(dir, 'RREQ-2026-11-19-DSA-GPT-01-50000000001.json');
    const legacy = {
      schema: REQUEST_SCHEMA,
      request_id: 'RREQ-2026-11-19-DSA-GPT-01-50000000001',
      reason: '<token>', asks: [], status: 'awaiting_gpt',
    };
    fs.writeFileSync(base, JSON.stringify(legacy, null, 1) + '\n');
    const before = fs.readFileSync(base, 'utf8');

    const written = writeSummary({root, summary});
    assert.equal(written.ruling_requests[0].status, 'superseded');
    assert.match(written.ruling_requests[0].path, /-r2\.json$/);
    assert.equal(fs.readFileSync(base, 'utf8'), before, '旧请求不得被覆盖');
    const fixed = JSON.parse(fs.readFileSync(path.join(root, written.ruling_requests[0].path), 'utf8'));
    assert.equal(fixed.supersedes, 'RREQ-2026-11-19-DSA-GPT-01-50000000001');
    assert.equal(fixed.request_id, 'RREQ-2026-11-19-DSA-GPT-01-50000000001-r2');
    assert.equal(fixed.reason, '涉及签名路径，需 GPT 裁决');
    assert.equal(fixed.asks.length, 1);

    const again = writeSummary({root, summary});
    assert.equal(again.ruling_requests[0].status, 'already_exists');
    assert.match(again.ruling_requests[0].path, /-r2\.json$/);
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('collectEvidence 在空仓库根下返回空证据而不是抛错', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'daily-ops-empty-'));
  try {
    const collected = collectEvidence(root, '2026-11-19');
    assert.deepEqual(collected.queueReports, []);
    assert.deepEqual(collected.dailyReports, []);
    assert.equal(collected.intake, null);
    assert.deepEqual(collected.cardsToday, []);
    const summary = buildSummary({date: '2026-11-19', evidence: collected});
    assert.equal(summary.counts.done, 0);
    assert.equal(summary.mail.status, 'unknown');
  } finally {
    fs.rmSync(root, {recursive: true, force: true});
  }
});

test('ASK 行只从公开输出提取，限制长度并忽略非 ASK 文本', () => {
  assert.deepEqual(extractAsks([{text: 'ROUTE | X | blocked\nASK | X | evidence | 缺少原始回执'}]), [
    {ref: 'X', target: 'evidence', ask: '缺少原始回执'},
  ]);
  assert.equal(extractAsks([{text: 'ROUTE | X | needs_gpt_decision'}]).length, 0);
  assert.equal(buildEmail({date: '2026-11-19', counts: {done: 0, needs_gpt_decision: 0, blocked: 0}, done: [], needs_gpt_decision: [], next_steps: [], mail: {gmail_rulings: {}}, dispatch: {card_count: 0}}).body.includes('今天没有新的 Deep 终态回执'), true);
});

test('待办区把超 24h 未回和已回未消费列出来，不只给计数', () => {
  const tracker = {
    counts: {threads: 43, answered: 25, pending_no_reply: 18, answered_but_unread: 1, pending_over_24h: 2},
    alerts: [
      {kind: 'no_reply_over_24h', thread: 'subject:短等待', waiting_hours: 25.5},
      {kind: 'no_reply_over_24h', thread: 'subject:长等待', waiting_hours: 161.2},
      {kind: 'other', thread: 'subject:忽略我', waiting_hours: 999},
    ],
    consume_gate: [{thread: 'task:DEEP-01', note: '裁决已到但未读'}],
  };
  const todo = buildTodoReport(tracker);
  assert.equal(todo.available, true);
  assert.equal(todo.over24h, 2);
  assert.equal(todo.consumeGate, 1);
  assert.equal(todo.top[0].thread, 'subject:长等待', '按等待时长降序');
  assert.equal(todo.top.length, 2, '非 no_reply_over_24h 的告警不计入待办');
});

test('裁决追踪缺失时写 unknown，不写成“没有待回”', () => {
  const todo = buildTodoReport(null);
  assert.equal(todo.available, false);
  const summary = buildSummary({date: '2026-11-19', evidence: evidence({rulingTracker: null})});
  assert.match(summary.email.body, /二、今日必须回（待办）/);
  assert.match(summary.email.body, /记为 unknown/);
});

test('待办会进入邮件正文并按等待时长列出', () => {
  const summary = buildSummary({date: '2026-11-19', evidence: evidence({
    rulingTracker: {counts: {threads: 43, answered: 25, pending_no_reply: 18, answered_but_unread: 1, pending_over_24h: 1},
      alerts: [{kind: 'no_reply_over_24h', thread: 'subject:老线程', waiting_hours: 161.2}], consume_gate: []},
  })});
  assert.equal(summary.counts.todo_over_24h, 1);
  assert.match(summary.email.body, /等待 161h｜subject:老线程/);
  assert.match(summary.email.body, /有 1 条裁决请求超过 24h 无回信/);
});
