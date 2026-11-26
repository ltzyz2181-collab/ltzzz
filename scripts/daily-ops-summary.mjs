#!/usr/bin/env node
// 每日合并：把 Deep 队列、日监督、邮件摄入和裁决请求合成一份可核验回执。
// 只读公开回执/脱敏元数据；不调用模型、不联网、不合并 PR、不部署、不动资金。
// 输出三件：
//   1) knowledge/results/deep-superagent/daily-merge/<date>.json（每日合并回执）
//   2) .../email-<date>.txt + email-<date>.meta.json（发信正文与主题，不含机密）
//   3) ops/deep-superagent/ruling-requests/*.json（需 GPT 裁决的公开请求，append-only）
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {classifyReservedFamily} from './lib/decision-families.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SUMMARY_SCHEMA = 'ltzzz.deep-superagent.daily-merge.v1';
export const REQUEST_SCHEMA = 'ltzzz.deep-superagent.ruling-request.v1';
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const ASK_RE = /^ASK\s*\|\s*([^|]{1,120})\|\s*(gpt|owner|evidence)\s*\|\s*(.{1,200})$/i;
const TOKEN_RE = /[A-Za-z0-9_-]{28,}/g;
const AMOUNT_RE = /[¥$€£]\s?[0-9][0-9.,]*|[0-9][0-9.,]*\s?(?:USDT|USDC|USD|CNY|ETH|BTC|元|美元)/gi;

const readJson = (root, rel, fallback = null) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return fallback;
  }
};

// 受控枚举是公开词汇，长度可能 ≥28（coordinator_close_with_receipt 等），
// 在句子里不能被长 token 规则误打成 <token>；打码前先占位，打码后还原。
// 只保护这份固定清单，任何不在清单里的长串仍按凭据处理。
const PROTECTED_CODES = [
  'coordinator_close_with_receipt',
  'coordinator_plan_unparseable',
  'needs_gpt_decision',
  'needs_owner_decision',
  'blocked_evidence_needed',
  'deploy_confirm_only',
  'completed_pending_external_acceptance',
  'daily_result_readback_complete',
  'queue_results_verified',
  'model_json_invalid',
];
const PLACEHOLDER = '\u0001';

export function redactText(value, max = 240) {
  let text = String(value ?? '');
  const held = [];
  for (const code of PROTECTED_CODES) {
    if (!text.includes(code)) continue;
    const slot = `${PLACEHOLDER}${held.length}${PLACEHOLDER}`;
    held.push(code);
    text = text.split(code).join(slot);
  }
  text = text.replace(TOKEN_RE, '<token>').replace(AMOUNT_RE, '<amount>');
  for (let index = 0; index < held.length; index += 1) {
    text = text.split(`${PLACEHOLDER}${index}${PLACEHOLDER}`).join(held[index]);
  }
  return text.replace(/\s+/g, ' ').trim().slice(0, max);
}

// 标识与状态是受控枚举/ID，不能按长 token 规则打码，否则会把
// completed_pending_external_acceptance 这类真实状态误写成 <token>。
const plain = (value, max = 80) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const short = (value, max = 80) => redactText(value, max);

// 原因码是小写蛇形枚举（如 coordinator_plan_unparseable、upstream_gateway_timeout_504），
// 旧的 28+ 长 token 规则会把整串吃成 <token>，丢掉真实原因。
// 判定「像枚举」而不是「像凭据」：整串由 ≥2 段小写字母/数字组成、总长 ≤64、
// 且没有超过 24 字符的单段。这样 `ghp_<36 位随机串>`、纯十六进制哈希、
// 带大写或连字符的内容仍会被打码。
const REASON_CODE_RE = /^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/;
export function redactReason(value, max = 240) {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  const looksLikeEnum = REASON_CODE_RE.test(text) && text.length <= 64
    && text.split('_').every((part) => part.length <= 24);
  if (looksLikeEnum) return text.slice(0, max);
  return redactText(text, max);
}

function statusOf(item) {
  return String(item?.job?.status || item?.status || 'unknown');
}

export function extractAsks(outputs = []) {
  const asks = [];
  const seen = new Set();
  for (const output of outputs) {
    for (const line of String(output?.text || '').split('\n')) {
      const match = ASK_RE.exec(line.trim());
      if (!match) continue;
      const entry = {ref: plain(match[1], 60), target: match[2].toLowerCase(), ask: short(match[3], 200)};
      const key = `${entry.ref}|${entry.target}|${entry.ask}`;
      if (seen.has(key)) continue;
      seen.add(key);
      asks.push(entry);
    }
  }
  return asks;
}

export function summarizeQueueReport(report, sourcePath = null) {
  const items = Array.isArray(report?.items) ? report.items : [];
  return items.map((item) => {
    const job = item.job || {};
    const review = job.review || {};
    const asks = extractAsks(job.outputs || []);
    const status = statusOf(item);
    const gptAsk = asks.filter((ask) => ask.target === 'gpt');
    const ownerAsk = asks.filter((ask) => ask.target === 'owner');
    // 2026-11-20 owner 授权：只有五类保留事项才进 GPT 裁决队列。
    // 上游把普通格式/邮件/证据问题也标成 needs_gpt_decision 时，这里降级为
    // 普通工程跟进，避免把“等 GPT”当成不处理普通工作的理由。
    const gptRequested = status === 'needs_gpt_decision' || job.plan?.needs_gpt_decision === true
      || review.needs_gpt_decision === true || gptAsk.length > 0;
    const decisionText = [
      job.plan?.reason,
      review.reason,
      ...gptAsk.map((ask) => ask.ask),
    ].filter(Boolean).join('\n');
    const reservedFamily = gptRequested ? classifyReservedFamily(decisionText) : null;
    // 没有留下任何可分类说明时不自动放行，保持 GPT 复核；有说明但不在五类内才降级。
    const needsGpt = gptRequested && (reservedFamily !== null || !decisionText.trim());
    return {
      task_id: plain(item.task_id, 120),
      package_id: plain(item.package_id, 160),
      run_id: report?.run_id ? String(report.run_id) : null,
      source: sourcePath,
      status: plain(status, 80),
      reason: redactReason(job.plan?.reason || item.error || '', 240) || null,
      // 独立复核的否决理由不是长 token，必须原意保留给 GPT 决策席。
      review_reason: redactReason(review.reason || '', 240) || null,
      model_calls: Number.isFinite(job.model_calls) ? job.model_calls : null,
      needs_gpt_decision: needsGpt,
      gpt_decision_requested: gptRequested,
      reserved_family: reservedFamily,
      decision_reclassified: gptRequested && !needsGpt,
      needs_owner_decision: status === 'needs_owner_decision' || ownerAsk.length > 0,
      asks,
    };
  });
}

function latestFiles(dir, pattern, limit) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => pattern.test(name))
    .sort()
    .slice(-limit)
    .map((name) => path.join(dir, name));
}

export function collectEvidence(root = REPO_ROOT, date) {
  const base = path.join(root, 'knowledge/results/deep-superagent');
  const queueReports = latestFiles(base, /^queue-\d+-attempt-\d+\.json$/, 3).map((abs) => ({
    path: path.relative(root, abs).split(path.sep).join('/'),
    body: JSON.parse(fs.readFileSync(abs, 'utf8')),
  }));
  const dailyReports = latestFiles(base, /^daily-\d+-attempt-\d+\.json$/, 2).map((abs) => ({
    path: path.relative(root, abs).split(path.sep).join('/'),
    body: JSON.parse(fs.readFileSync(abs, 'utf8')),
  }));
  const intake = readJson(root, 'knowledge/results/deep-superagent/mail-intake/latest.json', null);
  const oversight = readJson(root, 'knowledge/results/dispatch/oversight/latest.json', null);
  const rulingTracker = readJson(root, 'knowledge/results/deep-superagent/ruling-tracker/latest.json', null);
  const tasksDir = path.join(root, 'ops/deep-superagent/tasks');
  const stamp = String(date).replaceAll('-', '');
  const cardsToday = fs.existsSync(tasksDir)
    ? fs.readdirSync(tasksDir).filter((name) => new RegExp(`^DEEP-SUPERAGENT-${stamp}-`).test(name)).sort()
    : [];
  return {queueReports, dailyReports, intake, oversight, cardsToday, rulingTracker};
}

const CHANNEL_LABEL = {gmail_fullbox: 'gmail', qq_fullbox: 'qq', agent_mail: 'agent_mail'};
// Number(null) 是 0，会把“未标注时长”伪造成 0 天；这里只接受真实数值。
const ageOf = (value) => {
  if (value === null || value === undefined || value === '') return NaN;
  const age = Number(value);
  return Number.isFinite(age) ? age : NaN;
};

// 邮件/仓库的 open_items 是跨通道统一后的未处理项。这里只取脱敏元数据：
// 通道、引用、Task/Issue 号、未处理时长；主题摘要仍过 redactText，防止主题夹带 token/金额。
// 排序只影响“先看哪 20 条”，不改变任何原始状态，也不代表已读或已裁决。
export function buildMailTodo(intake, {limit = 20} = {}) {
  if (!intake) return {available: false, reason: 'no_intake', total: null, shown: 0, items: [], note: null};
  const items = Array.isArray(intake.open_items) ? intake.open_items : null;
  const declared = Number(intake.counts?.open_or_dispatch);
  const total = Number.isFinite(declared) ? declared : (items ? items.length : null);
  if (!items) return {available: false, reason: 'no_open_items', total, shown: 0, items: [], note: null};
  const rank = (item) => {
    let score = 0;
    if (item?.ruling_unread === true) score += 1000;
    if (item?.has_dispatch_wording === true) score += 200;
    if (Array.isArray(item?.task_ids) && item.task_ids.length) score += 100;
    const age = ageOf(item?.age_days);
    if (Number.isFinite(age)) score += Math.min(Math.max(age, 0), 90);
    return score;
  };
  const picked = items
    .filter((item) => item && typeof item === 'object')
    .map((item, index) => ({item, index, score: rank(item)}))
    .sort((left, right) => (right.score - left.score) || (left.index - right.index))
    .slice(0, limit)
    .map(({item}) => {
      const age = ageOf(item.age_days);
      const flags = [];
      if (item.ruling_unread === true) flags.push('裁决已到未读');
      if (item.has_dispatch_wording === true) flags.push('含派单词');
      if (item.status && item.status !== 'unknown') flags.push(plain(item.status, 40));
      return {
        channel: plain(item.channel, 40),
        channel_label: CHANNEL_LABEL[item.channel] || plain(item.channel, 40),
        ref: plain(item.ref || item.thread_id, 40),
        task_id: Array.isArray(item.task_ids) && item.task_ids.length ? plain(item.task_ids[0], 120) : null,
        age_days: Number.isFinite(age) ? Math.round(age * 10) / 10 : null,
        status: plain(item.status || 'unknown', 40),
        ruling_status: plain(item.ruling_status || 'none', 40),
        ruling_unread: item.ruling_unread === true,
        subject: short(item.subject_short || '', 90),
        flags: flags.join('/') || null,
      };
    });
  return {
    available: true,
    reason: null,
    total,
    shown: picked.length,
    items: picked,
    note: total !== null && total > picked.length ? `只列优先级最高的 ${picked.length} 条，另有 ${total - picked.length} 条未列` : null,
  };
}

// 把裁决追踪里“发出去了但对方没回”的线程变成可执行待办，而不是只留计数。
// 只读 latest.json 的脱敏字段；不含正文、不含地址、不含凭据。
export function buildTodoReport(tracker, {limit = 12, intake = null, openLimit = 20} = {}) {
  const mailOpen = buildMailTodo(intake, {limit: openLimit});
  if (!tracker || typeof tracker !== 'object' || !tracker.counts) {
    return {available: false, counts: null, over24h: 0, consumeGate: 0, top: [], consume: [], mail_open: mailOpen};
  }
  const alerts = Array.isArray(tracker.alerts) ? tracker.alerts : [];
  const consumeGate = Array.isArray(tracker.consume_gate) ? tracker.consume_gate : [];
  const over24 = alerts
    .filter((item) => item && item.kind === 'no_reply_over_24h')
    .map((item) => ({thread: short(item.thread, 90), waiting_hours: Number(item.waiting_hours) || 0}))
    .sort((left, right) => right.waiting_hours - left.waiting_hours);
  return {
    available: true,
    counts: tracker.counts,
    over24h: Number(tracker.counts.pending_over_24h) || over24.length,
    consumeGate: Number(tracker.counts.answered_but_unread) || consumeGate.length,
    top: over24.slice(0, limit),
    consume: consumeGate.slice(0, limit).map((item) => ({
      thread: plain(item.thread, 90),
      note: short(item.note, 80),
    })),
    mail_open: mailOpen,
  };
}

export function buildSummary({date, now = new Date(), evidence}) {
  if (!DATE_RE.test(String(date || ''))) throw new Error('invalid_summary_date');
  const queueItems = evidence.queueReports.flatMap((report) => summarizeQueueReport(report.body, report.path));
  const dailyItems = evidence.dailyReports.map((report) => ({
    task_id: plain(report.body?.task_id || 'DEEP-DAILY-SUPERVISION', 120),
    run_id: report.body?.run_id ? String(report.body.run_id) : null,
    status: plain(report.body?.status || 'unknown', 80),
    error: short(report.body?.error || '', 200) || null,
    source: report.path,
    model_calls: Number.isFinite(report.body?.model_calls) ? report.body.model_calls : null,
  }));

  const done = queueItems
    .filter((item) => !item.needs_gpt_decision && !item.needs_owner_decision && !item.decision_reclassified
      && !/^(blocked|unknown|queued|running|pending_reconcile_get_only)$/.test(item.status))
    .map((item) => ({
      task_id: item.task_id,
      run_id: item.run_id,
      status: item.status,
      model_calls: item.model_calls,
      note: '内部执行回执；外部业务验收仍需原单证据',
      source: item.source,
    }));
  const dailyDone = dailyItems
    .filter((item) => item.status === 'daily_result_readback_complete')
    .map((item) => ({
      task_id: item.task_id,
      run_id: item.run_id,
      status: item.status,
      model_calls: item.model_calls,
      note: '日监督只读回执；不等于完成业务验收',
      source: item.source,
    }));

  // 任务以 needs_gpt_decision 结束但执行输出里没有 `ASK | ... | gpt |` 行时，
  // 不能把空数组当裁决请求发出去。这里补一条明确、通用的裁决问题，
  // 让 GPT 决策席知道要回答什么；不代替 GPT 做任何判断。
  const DEFAULT_GPT_ASK = '任务以 needs_gpt_decision 结束但执行输出没有 ASK | gpt 行；请给出 decision_id 并裁决：接受该输出并关闭、退回重跑、或补证据后再复核。';
  const needsGpt = queueItems.filter((item) => item.needs_gpt_decision).map((item) => {
    const gptAsks = item.asks.filter((ask) => ask.target === 'gpt');
    if (!gptAsks.length) gptAsks.push({ref: item.task_id || 'unknown', target: 'gpt', ask: DEFAULT_GPT_ASK});
    return {
      task_id: item.task_id,
      package_id: item.package_id,
      run_id: item.run_id,
      reason: item.reason,
      review_reason: item.review_reason,
      asks: gptAsks,
      related_asks: item.asks.filter((ask) => ask.target !== 'gpt'),
      source: item.source,
    };
  });
  const ordinaryInProgress = queueItems.filter((item) => item.decision_reclassified).map((item) => ({
    task_id: item.task_id,
    package_id: item.package_id,
    run_id: item.run_id,
    status: item.status,
    reason: item.reason,
    review_reason: item.review_reason,
    asks: item.asks,
    note: '非五类保留事项，按 2026-11-20 owner 授权由执行席继续处理；不再等 GPT decision_id。',
    source: item.source,
  }));
  const needsOwner = queueItems.filter((item) => item.needs_owner_decision && !item.needs_gpt_decision).map((item) => ({
    task_id: item.task_id,
    package_id: item.package_id,
    run_id: item.run_id,
    reason: item.reason,
    asks: item.asks.filter((ask) => ask.target === 'owner'),
    source: item.source,
  }));
  const blocked = [
    ...queueItems.filter((item) => /^(blocked|unknown|queued|running|pending_reconcile_get_only)$/.test(item.status)).map((item) => ({
      task_id: item.task_id, run_id: item.run_id, status: item.status, reason: item.reason, source: item.source,
    })),
    ...dailyItems.filter((item) => item.status === 'blocked').map((item) => ({
      task_id: item.task_id, run_id: item.run_id, status: item.status, reason: item.error, source: item.source,
    })),
  ];

  // 快照新鲜度：latest.json 是席位写入的产物，日报可能读到几天前的数据。
  // 超过 30h 就明确标 stale，避免把旧待办当成今天的新待办。
  const intakeAtMs = Date.parse(evidence.intake?.at || '');
  const intakeAgeHours = Number.isFinite(intakeAtMs)
    ? Math.round(((now.getTime() - intakeAtMs) / 3600000) * 10) / 10
    : null;
  const intakeStale = intakeAgeHours !== null && intakeAgeHours > 30;
  const mail = evidence.intake ? {
    status: evidence.intake.status ?? 'unknown',
    at: evidence.intake.at ?? null,
    age_hours: intakeAgeHours,
    stale: intakeStale,
    gmail_status: evidence.intake.gmail_fullbox?.status ?? 'unknown',
    qq_status: evidence.intake.qq_fullbox?.status ?? 'unknown',
    agent_mail_status: evidence.intake.agent_mail?.status ?? 'unknown',
    open_or_dispatch: evidence.intake.counts?.open_or_dispatch ?? null,
    gmail_rulings: evidence.intake.gmail_rulings ?? {status: 'unknown', today_count: null},
  } : {status: 'unknown', at: null, age_hours: null, stale: false, gmail_status: 'unknown', qq_status: 'unknown', agent_mail_status: 'unknown', open_or_dispatch: null, gmail_rulings: {status: 'unknown', today_count: null}};

  const nextSteps = [];
  if (!evidence.cardsToday.length) nextSteps.push('今日没有新的 Deep 队列卡：检查 deep-dispatch-daily 定时是否触达，必要时手动 workflow_dispatch。');
  if (mail.status !== 'ok') nextSteps.push(`邮件摄入为 ${mail.status}：确认 Gmail / QQ IMAP 与 Agent Mail 通道；读不到时保持 unknown，不写成“没有裁决”。`);
  if (intakeStale) nextSteps.push(`邮件摄入快照距今 ${intakeAgeHours} 小时（>30h）：席位可能没跑 intake，日报待办可能不是今天的数据。`);
  if (needsGpt.length) nextSteps.push(`已生成 ${needsGpt.length} 条 GPT 裁决请求：等 GPT 回信中的 decision_id 与原 Task ID 绑定后再执行，模型不得自行裁决。`);
  if (ordinaryInProgress.length) nextSteps.push(`有 ${ordinaryInProgress.length} 条上游标成 needs_gpt_decision、但不属于五类保留事项：已降级为普通工程跟进，由执行席按测试与回滚继续处理，不占用 GPT 裁决队列。`);
  if (needsOwner.length) nextSteps.push(`有 ${needsOwner.length} 条需要 owner 给值或拍板；未拍板前保持原状态。`);
  if (blocked.length) nextSteps.push(`有 ${blocked.length} 条 blocked/unknown：先补原始凭证或换通道，不原样重试。`);
  const todo = buildTodoReport(evidence.rulingTracker, {intake: evidence.intake});
  if (todo.available && todo.over24h > 0) nextSteps.push(`有 ${todo.over24h} 条裁决请求超过 24h 无回信：按席位点名催办或改派，不要重复发同类请求。`);
  if (todo.available && todo.consumeGate > 0) nextSteps.push(`有 ${todo.consumeGate} 条裁决已到但未消费：当天读正文并写 awaiting_decision，不得当作未裁决重发。`);
  const openUnread = todo.mail_open?.available ? todo.mail_open.items.filter((item) => item.ruling_unread).length : 0;
  if (openUnread > 0) nextSteps.push(`邮件/仓库待办里有 ${openUnread} 条标记“裁决已到未读”：先读正文并写 awaiting_decision，再排其他 open 项。`);
  nextSteps.push('本日报只汇总公开回执；不合并 PR、不生产部署、不发起资金动作。');

  const summary = {
    schema: SUMMARY_SCHEMA,
    date,
    generated_at_utc: now.toISOString(),
    done: [...done, ...dailyDone],
    needs_gpt_decision: needsGpt,
    ordinary_in_progress: ordinaryInProgress,
    needs_owner_decision: needsOwner,
    blocked,
    dispatch: {
      cards_today: evidence.cardsToday,
      card_count: evidence.cardsToday.length,
      importance: evidence.cardsToday.length ? 'medium' : null,
      note: evidence.cardsToday.length ? '政策卡由 dispatch-seat-policy 生成，Deep 主办；中转席不持裁决权' : null,
    },
    mail,
    todo,
    counts: {
      done: done.length + dailyDone.length,
      needs_gpt_decision: needsGpt.length,
      ordinary_in_progress: ordinaryInProgress.length,
      needs_owner_decision: needsOwner.length,
      blocked: blocked.length,
      todo_over_24h: todo.over24h,
      todo_consume_gate: todo.consumeGate,
      todo_open_items: todo.mail_open?.available ? todo.mail_open.total : null,
      todo_open_unread: todo.mail_open?.available ? todo.mail_open.items.filter((item) => item.ruling_unread).length : null,
      todo_intake_age_hours: intakeAgeHours,
      todo_intake_stale: intakeStale,
    },
    next_steps: nextSteps,
    evidence: {
      queue_reports: evidence.queueReports.map((report) => report.path),
      daily_reports: evidence.dailyReports.map((report) => report.path),
      mail_intake: 'knowledge/results/deep-superagent/mail-intake/latest.json',
      ruling_tracker: 'knowledge/results/deep-superagent/ruling-tracker/latest.json',
      oversight: 'knowledge/results/dispatch/oversight/latest.json',
    },
    financial_execution: false,
    paid: false,
    merge_performed: false,
    deploy_performed: false,
    secrets_included: false,
    policy: '仅五类保留给 GPT 决策席：资金及资金处分、退款终态、签名操作、私钥/助记词/根密钥、钱包操作（含五签）；凭据配置/轮换属普通工程，但秘密值不得打印、提交或外泄。',
  };
  summary.email = buildEmail(summary);
  return summary;
}

export function buildEmail(summary) {
  const subject = `[LTZZZ日报] ${summary.date} 完成=${summary.counts.done} 待GPT裁决=${summary.counts.needs_gpt_decision} 阻塞=${summary.counts.blocked}`;
  const lines = [
    `LTZZZ 每日合并 ${summary.date}（UTC）`,
    '',
    '一、今天完成了什么',
  ];
  if (summary.done.length) {
    for (const item of summary.done) lines.push(`- ${item.task_id}：${item.status}（run=${item.run_id ?? 'unknown'}）`);
  } else {
    lines.push('- 今天没有新的 Deep 终态回执。');
  }
  lines.push('', '二、今日必须回（待办）');
  if (summary.todo?.available) {
    const todoCounts = summary.todo.counts || {};
    lines.push(`- 线程 ${todoCounts.threads ?? 'unknown'}：已回 ${todoCounts.answered ?? 'unknown'}，待回 ${todoCounts.pending_no_reply ?? 'unknown'}，超 24h ${todoCounts.pending_over_24h ?? 'unknown'}，已回未消费 ${todoCounts.answered_but_unread ?? 'unknown'}`);
    if (summary.todo.top.length) {
      lines.push(`- 超 24h 未回（按等待时长排序，最多列 ${summary.todo.top.length} 条）：`);
      for (const todoItem of summary.todo.top) lines.push(`  · 等待 ${Math.round(todoItem.waiting_hours)}h｜${todoItem.thread}`);
    } else {
      lines.push('- 没有超 24h 未回的线程。');
    }
    for (const todoItem of summary.todo.consume) lines.push(`  · 已回未消费｜${todoItem.thread}（${todoItem.note}）`);
  } else {
    lines.push('- 裁决追踪不可用（latest.json 缺失或未生成）：记为 unknown，不要写成“没有待回”。');
  }
  const mailOpen = summary.todo?.mail_open;
  if (mailOpen?.available) {
    lines.push(`- 邮件/仓库待办 Top ${mailOpen.shown}（open 共 ${mailOpen.total ?? 'unknown'} 条；只列元数据，不含正文）：`);
    if (mailOpen.items.length) {
      for (const item of mailOpen.items) {
        const task = item.task_id ? ` task=${item.task_id}` : '';
        const age = item.age_days === null ? '时长未标注' : `未处理 ${item.age_days}天`;
        const extra = item.flags ? `｜${item.flags}` : '';
        lines.push(`  · [${item.channel_label}] ${item.ref}${task}｜${age}${extra}｜${item.subject || '(无主题摘要)'}`);
      }
    } else {
      lines.push('  · 本次 latest.json 的 open_items 为空。');
    }
    if (mailOpen.note) lines.push(`  · ${mailOpen.note}`);
  } else if (mailOpen?.reason === 'no_open_items') {
    lines.push('- 邮件待办：本次 latest.json 缺 open_items 字段，无法列 Top N，保持 unknown，不据此判断已清空。');
  }
  lines.push('', '三、需要 GPT 裁决');
  if (summary.ordinary_in_progress?.length) {
    lines.push(`- 另有 ${summary.ordinary_in_progress.length} 条非五类事项已降级为普通工程跟进（不再等 GPT decision_id）：`);
    for (const item of summary.ordinary_in_progress) {
      lines.push(`  · ${item.task_id}（run=${item.run_id ?? 'unknown'}）：${item.reason || '见执行回执'}`);
      if (item.review_reason) lines.push(`    复核意见：${item.review_reason}`);
    }
  }
  if (summary.needs_gpt_decision.length) {
    for (const item of summary.needs_gpt_decision) {
      lines.push(`- ${item.task_id}（run=${item.run_id ?? 'unknown'}）：${item.reason || '见 ASK'}`);
      if (item.review_reason) lines.push(`  复核意见：${item.review_reason}`);
      for (const ask of item.asks) lines.push(`  ASK ${ask.ref}：${ask.ask}`);
      if (!item.asks.length) lines.push('  ASK：请对该任务给出 decision_id 与范围。');
      for (const ask of item.related_asks || []) lines.push(`  相关待补（${ask.target}）${ask.ref}：${ask.ask}`);
    }
  } else {
    lines.push('- 今天没有需要 GPT 裁决的项。');
  }
  lines.push('', '四、下一步');
  for (const step of summary.next_steps) lines.push(`- ${step}`);
  lines.push('', '五、证据与边界');
  lines.push(`- 邮件摄入：status=${summary.mail.status}，gmail=${summary.mail.gmail_status}，qq=${summary.mail.qq_status}，agent_mail=${summary.mail.agent_mail_status}`);
  lines.push(`- 邮件摄入快照：${summary.mail.at ?? 'unknown'}（距今 ${summary.counts?.todo_intake_age_hours ?? 'unknown'} 小时）${summary.counts?.todo_intake_stale ? '——超过 30h，席位可能未运行 intake' : ''}`);
  lines.push(`- 今日 Gmail 裁决类回信（仅元数据）：${summary.mail.gmail_rulings?.today_count ?? 'unknown'}`);
  lines.push(`- 待办来源：knowledge/results/deep-superagent/ruling-tracker/latest.json（超24h=${summary.counts?.todo_over_24h ?? 'unknown'}，已回未消费=${summary.counts?.todo_consume_gate ?? 'unknown'}）`);
  lines.push(`- 邮件待办来源：knowledge/results/deep-superagent/mail-intake/latest.json 的 open_items（open=${summary.counts?.todo_open_items ?? 'unknown'}，裁决未读=${summary.counts?.todo_open_unread ?? 'unknown'}）`);
  lines.push(`- Deep 队列卡：${summary.dispatch.card_count} 张；合并回执：knowledge/results/deep-superagent/daily-merge/${summary.date}.json`);
  lines.push('- 本邮件不含邮件正文、金额、凭据或客户数据；不声称任何业务验收或生产部署。');
  return {subject, body: lines.join('\n') + '\n'};
}

// 只比较决定「这条裁决请求是否可执行」的字段；时间戳等易变字段不参与。
const sameRequest = (a, b) => JSON.stringify([a?.reason, a?.review_reason, a?.asks, a?.related_asks])
  === JSON.stringify([b.reason, b.review_reason, b.asks, b.related_asks]);

export function writeSummary({root = REPO_ROOT, summary}) {
  if (!DATE_RE.test(String(summary?.date || '')) || summary.schema !== SUMMARY_SCHEMA) throw new Error('invalid_summary_write');
  const dir = path.join(root, 'knowledge/results/deep-superagent/daily-merge');
  fs.mkdirSync(dir, {recursive: true});
  const jsonPath = path.join(dir, `${summary.date}.json`);
  const emailPath = path.join(dir, `email-${summary.date}.txt`);
  const metaPath = path.join(dir, `email-${summary.date}.meta.json`);
  const latestPath = path.join(dir, 'latest.json');
  fs.writeFileSync(jsonPath, JSON.stringify(summary, null, 1) + '\n');
  fs.writeFileSync(latestPath, JSON.stringify(summary, null, 1) + '\n');
  fs.writeFileSync(emailPath, summary.email.body);
  fs.writeFileSync(metaPath, JSON.stringify({
    schema: 'ltzzz.deep-superagent.email-meta.v1',
    date: summary.date,
    subject: summary.email.subject,
    body_file: path.relative(root, emailPath).split(path.sep).join('/'),
    generated_at_utc: summary.generated_at_utc,
    counts: summary.counts,
    contains_mail_body: false,
    secrets_included: false,
  }, null, 1) + '\n');

  const requestDir = path.join(root, 'ops/deep-superagent/ruling-requests');
  fs.mkdirSync(requestDir, {recursive: true});
  const requests = [];
  for (const item of summary.needs_gpt_decision) {
    const safeTask = String(item.task_id || 'unknown').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 100);
    const safeRun = String(item.run_id || 'unknown').replace(/[^0-9A-Za-z_-]/g, '_').slice(0, 30);
    const baseId = `RREQ-${summary.date}-${safeTask}-${safeRun}`;
    const record = {
      schema: REQUEST_SCHEMA,
      request_id: baseId,
      created_at_utc: summary.generated_at_utc,
      date: summary.date,
      task_id: item.task_id,
      package_id: item.package_id,
      run_id: item.run_id,
      reason: item.reason,
      review_reason: item.review_reason || null,
      asks: item.asks,
      related_asks: item.related_asks || [],
      status: 'awaiting_gpt',
      requested_from: 'gpt_decision_seat',
      decision_authority: 'gpt_or_owner_only',
      source_report: item.source,
      contains_mail_body: false,
      contains_credentials: false,
      contains_customer_data: false,
    };
    // append-only 不覆盖旧文件；但如果旧请求内容更差（例如 reason 被打成 <token>、
    // asks 为空），就追加一个 -rN 修正记录并用 supersedes 指回旧请求。
    const revisions = fs.readdirSync(requestDir)
      .map((name) => /^(RREQ-.+?)(?:-r(\d+))?\.json$/.exec(name))
      .filter((match) => match && match[1] === baseId)
      .map((match) => ({name: `${match[1]}${match[2] ? `-r${match[2]}` : ''}.json`, revision: Number(match[2] || 1)}))
      .sort((a, b) => a.revision - b.revision);
    const current = revisions.length ? readJson(root, `ops/deep-superagent/ruling-requests/${revisions.at(-1).name}`) : null;
    if (current && sameRequest(current, record)) {
      requests.push({path: `ops/deep-superagent/ruling-requests/${revisions.at(-1).name}`, status: 'already_exists'});
      continue;
    }
    let rel = `ops/deep-superagent/ruling-requests/${baseId}.json`;
    if (revisions.length) {
      const nextVersion = revisions.at(-1).revision + 1;
      rel = `ops/deep-superagent/ruling-requests/${baseId}-r${nextVersion}.json`;
      record.request_id = `${baseId}-r${nextVersion}`;
      record.supersedes = baseId;
    }
    fs.writeFileSync(path.join(root, rel), JSON.stringify(record, null, 1) + '\n');
    requests.push({path: rel, status: revisions.length ? 'superseded' : 'created'});
  }
  return {
    json: path.relative(root, jsonPath).split(path.sep).join('/'),
    email_body: path.relative(root, emailPath).split(path.sep).join('/'),
    email_meta: path.relative(root, metaPath).split(path.sep).join('/'),
    latest: path.relative(root, latestPath).split(path.sep).join('/'),
    ruling_requests: requests,
  };
}

function main(argv = process.argv.slice(2)) {
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  const date = get('--date') || new Date().toISOString().slice(0, 10);
  const root = get('--root') || REPO_ROOT;
  try {
    const summary = buildSummary({date, evidence: collectEvidence(root, date)});
    if (argv.includes('--dry-run')) {
      process.stdout.write(JSON.stringify({status: 'dry_run', counts: summary.counts, subject: summary.email.subject}, null, 1) + '\n');
      return 0;
    }
    const written = writeSummary({root, summary});
    process.stdout.write(JSON.stringify({status: 'written', counts: summary.counts, subject: summary.email.subject, written}, null, 1) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write(`[daily-ops-summary] ${String(error?.message || error).slice(0, 300)}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
