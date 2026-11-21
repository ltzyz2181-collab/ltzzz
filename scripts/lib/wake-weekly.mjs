import crypto from 'node:crypto';

// 每周创新讨论 = 一个固定节奏的唤醒源。
// 设计取舍：cron 只负责「准时开卡」，议程可由中转席生成；中转席不可用时用轮换模板兜底，
// 保证任何一周都不会因为某个模型挂了而静默跳过。
export const WEEKLY_SCHEMA = 'ltzzz.agent-wake.weekly.v1';

export const WEEKLY_LABELS = ['wake:weekly', 'wake:request'];

// 四个主题轮转：路线 / 新能力 / 产品形态 / 调度机制。
export const WEEKLY_THEMES = [
  {key: 'roadmap', title: '项目发展路线', ask: '未来 3 个月最该砍掉的一件事是什么？'},
  {key: 'capability', title: '新能力与新通道', ask: '哪个外部通道值得接，接进来能省掉谁的人工？'},
  {key: 'product', title: '产品形态', ask: '现在这套东西对外最小的可交付形态是什么？'},
  {key: 'orchestration', title: '调度机制优化', ask: '哪一条协作规则正在稳定地制造返工？'}
];

function pad(value) {
  return String(value).padStart(2, '0');
}

/** ISO-8601 周编号：返回 2026-W47 这种形式。 */
export function isoWeek(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error('weekly_invalid_date');
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
  return target.getUTCFullYear() + '-W' + pad(week);
}

/** 按周号轮转主题；同一周永远得到同一个主题。 */
export function themeForWeek(week) {
  const match = /^(\d{4})-W(\d{2})$/.exec(String(week));
  if (!match) throw new Error('weekly_invalid_week');
  return WEEKLY_THEMES[Number(match[2]) % WEEKLY_THEMES.length];
}

export function weeklyDedupeKey(week) {
  return 'weekly:' + week;
}

export function weeklyTopic(week) {
  return '每周创新讨论 ' + week + ' · ' + themeForWeek(week).title;
}

/** 生成唯一一行 [wake]；行内不能出现换行，否则解析会断。 */
export function buildWeeklyWakeLine({week, seats = [], budgetUsd = 0.01} = {}) {
  if (!Array.isArray(seats) || seats.length === 0) throw new Error('weekly_missing_seats');
  const why = '每周固定节奏，各席自发提出创新方向并收敛成可执行事项';
  return '[wake] topic=' + weeklyTopic(week) +
    ' why=' + why +
    ' seats=' + seats.join(',') +
    ' budget_usd=' + budgetUsd +
    ' dedupe_key=' + weeklyDedupeKey(week);
}

/** 三个必答问题；第三个按主题轮换。 */
export function buildWeeklyQuestions(week) {
  const theme = themeForWeek(week);
  return [
    '本周你看到的一个「已经在做但方向不对」的事是什么？',
    '如果要你只推一件新事情，它是什么，验收怎么看？',
    theme.ask
  ];
}

export function buildWeeklyIssueBody({week, seats = [], budgetUsd = 0.01, agenda} = {}) {
  const theme = themeForWeek(week);
  const questions = buildWeeklyQuestions(week);
  const lines = [
    '### 本周主题',
    theme.title + '（' + week + '）',
    '',
    '### 参与席位',
    seats.join(', '),
    '',
    '### 三个必答问题',
    ...questions.map((question, index) => (index + 1) + '. ' + question),
    '',
    '### 议程来源',
    agenda ? String(agenda).trim() : '轮换模板兜底（中转席未提供议程）',
    '',
    '### 唤醒请求',
    buildWeeklyWakeLine({week, seats, budgetUsd}),
    '',
    '### 边界',
    '- 本卡只发起讨论，不涉及资金、退款终态、签名、私钥、钱包（含五签 Safe）、凭据。',
    '- 结论只有三态：agreed / split / insufficient_evidence。',
    '- 命中六族的事项只出建议，不派单、不执行。',
    '',
    '### 部署要求',
    'not_required（只开卡与记台账，不部署运行时代码）',
    '',
    weekMarker(week)
  ];
  return lines.join('\n');
}

/** 卡片标题带上周号，用于「同一周不重复开卡」。 */
export function weeklyIssueTitle(week) {
  return '[每周创新讨论] ' + week;
}

export function weekMarker(week) {
  return '<!-- wake-weekly:' + week + ' -->';
}

export function shortHash(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 16);
}
