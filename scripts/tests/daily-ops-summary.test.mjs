import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {buildMailTodo,
  buildTodoReport,
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
import {classifyReservedFamily} from '../lib/decision-families.mjs';

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
  assert.equal(items[1].reserved_family.key, 'signing_operations');
  assert.equal(items[1].decision_reclassified, false);
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

test('邮件摄入快照超过 30h 时标 stale，并在邮件里写明', () => {
  const oldIntake = {...intake, at: '2026-11-17T00:00:00.000Z'};
  const summary = buildSummary({
    date: '2026-11-19',
    now: new Date('2026-11-19T02:10:00.000Z'),
    evidence: evidence({intake: oldIntake}),
  });
  assert.equal(summary.counts.todo_intake_stale, true);
  assert.ok(summary.counts.todo_intake_age_hours > 30);
  assert.match(summary.email.body, /超过 30h，席位可能未运行 intake/);
  assert.ok(summary.next_steps.some((step) => /席位可能没跑 intake/.test(step)));
});

test('邮件摄入新鲜时不标 stale；缺 at 时写 unknown 而不是 0 小时', () => {
  const fresh = buildSummary({date: '2026-11-19', now: new Date('2026-11-19T02:10:00.000Z'), evidence: evidence()});
  assert.equal(fresh.counts.todo_intake_stale, false);
  assert.ok(fresh.counts.todo_intake_age_hours > 1 && fresh.counts.todo_intake_age_hours < 3);

  const noAt = {...intake};
  delete noAt.at;
  const missing = buildSummary({date: '2026-11-19', evidence: evidence({intake: noAt})});
  assert.equal(missing.counts.todo_intake_age_hours, null);
  assert.match(missing.email.body, /距今 unknown 小时/);
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

test('五类保留家族可分类；凭据配置与普通英文词不误判', () => {
  assert.equal(classifyReservedFamily('资金放款 100 USDC').key, 'funds_and_financial_asset_disposition');
  assert.equal(classifyReservedFamily('退款终态裁决').key, 'refund_finality');
  assert.equal(classifyReservedFamily('需要签名确认').key, 'signing_operations');
  assert.equal(classifyReservedFamily('私钥与助记词保管').key, 'private_keys_seed_phrases_root_keys');
  assert.equal(classifyReservedFamily('五签钱包操作').key, 'wallet_operations_including_five_signature_wallet');
  assert.equal(classifyReservedFamily('配置新的 API token 并轮换'), null);
  assert.equal(classifyReservedFamily('design review and assignment'), null);
});

test('非五类 needs_gpt_decision 降级为普通工程跟进，不再进裁决队列', () => {
  const report = {
    schema: 'ltzzz.deep-superagent.queue.v1', run_id: '50000000010',
    items: [{
      task_id: 'DSA-ORDINARY-01', package_id: 'PKG-ORDINARY', status: 'job_terminal_observed',
      job: {
        status: 'needs_gpt_decision', model_calls: 1,
        plan: {needs_gpt_decision: true, reason: 'coordinator_plan_unparseable'},
        review: {needs_gpt_decision: true, reason: '输出格式不合规，需补充字段'},
        outputs: [{text: 'ASK | B1 | gpt | 请提供邮件通道回执'}],
      },
    }],
  };
  const items = summarizeQueueReport(report);
  assert.equal(items[0].gpt_decision_requested, true);
  assert.equal(items[0].needs_gpt_decision, false);
  assert.equal(items[0].decision_reclassified, true);
  assert.equal(items[0].reserved_family, null);

  const summary = buildSummary({
    date: '2026-11-19',
    evidence: evidence({queueReports: [{path: 'queue.json', body: report}], dailyReports: []}),
  });
  assert.equal(summary.counts.needs_gpt_decision, 0);
  assert.equal(summary.counts.ordinary_in_progress, 1);
  assert.equal(summary.counts.done, 0, '降级项不是完成项');
  assert.equal(summary.ordinary_in_progress[0].task_id, 'DSA-ORDINARY-01');
  assert.match(summary.email.body, /普通工程跟进/);
  assert.match(summary.email.body, /DSA-ORDINARY-01/);
  assert.match(summary.email.body, /今天没有需要 GPT 裁决的项/);
  assert.ok(summary.next_steps.some((step) => /已降级为普通工程跟进/.test(step)));
});

test('needs_gpt_decision 没有任何说明时保持 GPT 复核，不自动放行', () => {
  const report = {
    schema: 'ltzzz.deep-superagent.queue.v1', run_id: '50000000011',
    items: [{
      task_id: 'DSA-NO-REASON', package_id: 'PKG-NO-REASON', status: 'job_terminal_observed',
      job: {status: 'needs_gpt_decision'},
    }],
  };
  const items = summarizeQueueReport(report);
  assert.equal(items[0].needs_gpt_decision, true);
  assert.equal(items[0].decision_reclassified, false);
  assert.equal(items[0].reserved_family, null);
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
        plan: {reason: '涉及资金放款路径，需 GPT 裁决'},
        review: {needs_gpt_decision: true, reason: 'C2 and C4 incorrectly routed as coordinator_close_with_receipt'},
        outputs: [{text: 'ASK | B1 | evidence | 需要邮件通道回执'}],
      },
    }],
  };
  const items = summarizeQueueReport(report);
  assert.equal(items[0].reason, '涉及资金放款路径，需 GPT 裁决');
  assert.equal(items[0].review_reason, 'C2 and C4 incorrectly routed as coordinator_close_with_receipt');
  assert.equal(items[0].reserved_family.key, 'funds_and_financial_asset_disposition');
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
    assert.equal(record.reason, '涉及资金放款路径，需 GPT 裁决');
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

const openItems = () => [
  {channel: 'gmail_fullbox', ref: 'aaa111', status: 'unknown', age_days: null, subject_short: '普通通知', task_ids: [], has_dispatch_wording: false, ruling_unread: false},
  {channel: 'agent_mail', ref: 'msg_x', status: 'open', age_days: 2.4, subject_short: 'ASK 关于 ghp_abcdefghijklmnopqrstuvwxyz0123456789', task_ids: ['TASK-1'], has_dispatch_wording: false, ruling_unread: false},
  {channel: 'gmail_fullbox', ref: 'bbb222', status: 'open', age_days: 10, subject_short: '裁决已到', task_ids: [], has_dispatch_wording: false, ruling_unread: true},
  {channel: 'gmail_fullbox', ref: 'ccc333', status: 'open', age_days: 5, subject_short: '请部署 worker', task_ids: [], has_dispatch_wording: true, ruling_unread: false},
];

test('邮件/仓库 open_items 生成 Top N 待办：裁决未读 > 派单词 > 带 Task > 时长', () => {
  const todo = buildTodoReport(null, {intake: {open_items: openItems(), counts: {open_or_dispatch: 4}}});
  assert.equal(todo.available, false, '追踪器缺失仍是 unknown');
  const open = todo.mail_open;
  assert.equal(open.available, true);
  assert.equal(open.total, 4);
  assert.equal(open.items[0].ref, 'bbb222', '裁决已到未读排最前');
  assert.equal(open.items[1].ref, 'ccc333', '含派单词其次');
  assert.equal(open.items[2].ref, 'msg_x', '带 Task ID 再次');
  assert.equal(open.items[2].task_id, 'TASK-1');
  assert.equal(open.items[2].age_days, 2.4);
  assert.equal(open.items[2].subject.includes('ghp_'), false, '主题里的凭据必须打码');
  assert.equal(open.items[3].age_days, null, '缺失时长保持 null，不编造');
  assert.equal(open.items[0].flags.includes('裁决已到未读'), true);
});

test('Top N 截断时声明总数，不假装列全', () => {
  const open = buildMailTodo({open_items: openItems(), counts: {open_or_dispatch: 1184}}, {limit: 2});
  assert.equal(open.shown, 2);
  assert.equal(open.total, 1184);
  assert.match(open.note, /另有 1182 条未列/);
});

test('邮件正文列出待办 Top N（通道/Task/时长），不含邮件正文', () => {
  const summary = buildSummary({date: '2026-11-19', evidence: evidence({
    intake: {...intake, open_items: openItems(), counts: {open_or_dispatch: 4}},
  })});
  assert.equal(summary.counts.todo_open_items, 4);
  assert.equal(summary.counts.todo_open_unread, 1);
  assert.match(summary.email.body, /邮件\/仓库待办 Top 4/);
  assert.match(summary.email.body, /\[gmail\] bbb222｜未处理 10天｜裁决已到未读/);
  assert.match(summary.email.body, /\[agent_mail\] msg_x task=TASK-1｜未处理 2\.4天/);
  assert.match(summary.email.body, /\[gmail\] aaa111｜时长未标注/);
  assert.match(summary.email.body, /先读正文并写 awaiting_decision/);
});

test('latest.json 缺 open_items 时写“无法列”，不写成“没有待办”', () => {
  const summary = buildSummary({date: '2026-11-19', evidence: evidence()});
  assert.match(summary.email.body, /缺 open_items 字段/);
  assert.doesNotMatch(summary.email.body, /没有待办/);
  assert.equal(summary.counts.todo_open_items, null);
});

test('邮件摄入整体缺失时不冒充“缺 open_items”', () => {
  const summary = buildSummary({date: '2026-11-19', evidence: evidence({intake: null})});
  assert.doesNotMatch(summary.email.body, /缺 open_items 字段/);
});
