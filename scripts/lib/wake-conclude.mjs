import {convergence} from './agent-wake.mjs';

// P3：把讨论结论变成（或不变成）派单卡。
// 关键约束：六族永远只出建议；单个席位不算「讨论」；没有证据不建卡。
export const CONCLUDE_SCHEMA = 'ltzzz.agent-wake.conclude.v1';

export const RESERVED_FAMILIES = [
  '资金', '付款', '放款', '转账', '退款', '签名', '私钥', '助记词', '钱包',
  '五签', '凭据', '密钥', '密码', 'funds', 'refund', 'sign', 'wallet', 'secret', 'credential'
];

const STANCES = new Set(['agree', 'disagree']);
const MIN_SEATS_FOR_DISCUSSION = 2;

function flatten(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

/** 逐行解析 `[verdict] seat=x stance=agree|disagree reason=...`。 */
export function parseVerdicts(comments = []) {
  const verdicts = [];
  for (const comment of Array.isArray(comments) ? comments : []) {
    const body = typeof comment?.body === 'string' ? comment.body : '';
    if (!body.includes('[verdict]')) continue;
    for (const rawLine of body.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line.startsWith('[verdict]')) continue;
      const fields = {};
      const regex = /(\w+)=(?:"([^"]*)"|(\S*))/g;
      let match;
      while ((match = regex.exec(line)) !== null) fields[match[1]] = match[2] ?? match[3] ?? '';
      const seat = flatten(fields.seat).toLowerCase();
      const stance = flatten(fields.stance).toLowerCase();
      if (!seat || !STANCES.has(stance)) continue;
      verdicts.push({
        seat,
        stance,
        reason: flatten(fields.reason).slice(0, 240),
        at: comment?.created_at ?? null,
        ref: 'c:' + (comment?.id ?? verdicts.length)
      });
    }
  }
  return verdicts;
}

/** 主题命中六族时，任何结论都只能出建议。 */
export function isReservedTopic(text) {
  const haystack = String(text ?? '').toLowerCase();
  return RESERVED_FAMILIES.some(word => haystack.includes(word.toLowerCase()));
}

/** 按主题猜执行席：代码/测试类归主开发，其余归调度席。 */
export function pickSeat(topic) {
  return /代码|脚本|测试|仓库|ci|pr|merge|接口|api/i.test(String(topic ?? ''))
    ? 'desktop_claude'
    : 'deep';
}

/**
 * 结论决策。
 * - 命中六族：recommend_only（只建议，不建卡）
 * - 少于 2 席有效投票：request_evidence
 * - 有分歧：escalate（合议/升级）
 * - 一致同意：dispatch
 */
export function planConclusion({topic, verdicts = [], rounds = 1} = {}) {
  const list = Array.isArray(verdicts) ? verdicts : [];
  const seats = new Set(list.map(item => item.seat));
  const result = convergence({verdicts: list.map(item => item.stance), rounds});

  if (isReservedTopic(topic)) {
    return {action: 'recommend_only', reason: 'reserved_family', verdict: result.verdict, seats: [...seats], agrees: result.agrees, disagrees: result.disagrees};
  }
  if (seats.size < MIN_SEATS_FOR_DISCUSSION) {
    return {action: 'request_evidence', reason: 'not_enough_seats', verdict: result.verdict, seats: [...seats], agrees: result.agrees, disagrees: result.disagrees};
  }
  if (result.verdict === 'split') {
    return {action: 'escalate', reason: 'split_needs_deliberation', verdict: result.verdict, seats: [...seats], agrees: result.agrees, disagrees: result.disagrees};
  }
  if (result.verdict === 'agreed') {
    return {action: 'dispatch', reason: 'agreed', verdict: result.verdict, seats: [...seats], agrees: result.agrees, disagrees: result.disagrees, seat: pickSeat(topic)};
  }
  return {action: 'request_evidence', reason: 'insufficient_evidence', verdict: result.verdict, seats: [...seats], agrees: result.agrees, disagrees: result.disagrees};
}

/** 自动建卡的内容：保留来源卡号与每席理由，便于复核。 */
export function buildDispatchCard({topic, verdicts = [], sourceIssue = null, seats = []} = {}) {
  const lines = [
    '### 来源',
    sourceIssue ? '讨论来源：#' + sourceIssue : '讨论来源：未记录',
    '',
    '### 议题',
    flatten(topic),
    '',
    '### 讨论结论',
    'agreed（' + seats.length + ' 席参与）',
    '',
    '### 各席理由'
  ];
  for (const verdict of verdicts) {
    lines.push('- `' + verdict.seat + '` ' + verdict.stance + (verdict.reason ? '：' + verdict.reason : ''));
  }
  lines.push(
    '',
    '### 验收标准',
    '按来源议题给出的验收标准执行；无明确标准时，以「有测试、CI 绿、回执写明实际结果」为准。',
    '',
    '### 部署要求',
    'not_required（派单卡本身不部署；执行席按自身任务决定）'
  );
  return lines.join('\n');
}

export function dispatchTitle(topic) {
  const flat = flatten(topic) || '未命名议题';
  return '[WAVE] ' + (flat.length > 60 ? flat.slice(0, 59) + '…' : flat);
}
