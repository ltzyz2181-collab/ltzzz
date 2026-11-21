// 自动议程：从仓库真实信号生成，而不是让模型编一段泛泛的话。
// 三个来源：未收敛的唤醒议题、长期未领取的派单卡、近 7 天反复失败的工作流。
// 纯函数：输入由调用方抓取，便于离线测试。
export const AGENDA_SCHEMA = 'ltzzz.agent-wake.agenda.v1';

const CONCLUSION_ACTIONS = new Set(['agreed', 'split', 'insufficient_evidence']);

function oneLine(text, max = 80) {
  const flat = String(text ?? '').replace(/\s+/g, ' ').trim();
  return flat.length > max ? flat.slice(0, max - 1) + '…' : flat;
}

/** 找出被唤醒过、但还没有任何结论事件的议题。 */
export function openTopics(events = [], {limit = 3} = {}) {
  const list = Array.isArray(events) ? events : [];
  const concluded = new Set();
  for (const event of list) {
    if (event && CONCLUSION_ACTIONS.has(event.action) && event.dedupe_key) {
      concluded.add(event.dedupe_key);
    }
  }
  const seen = new Set();
  const topics = [];
  for (const event of list) {
    if (!event || event.action !== 'wake' || !event.dedupe_key) continue;
    if (concluded.has(event.dedupe_key) || seen.has(event.dedupe_key)) continue;
    seen.add(event.dedupe_key);
    topics.push({
      dedupe_key: event.dedupe_key,
      topic: oneLine(event.topic, 60),
      task_id: event.task_id ?? null,
      at: event.at ?? null
    });
    if (topics.length >= limit) break;
  }
  return topics;
}

/** 还没被任何席位领取的卡（hub:new），按卡号排序取前 N。 */
export function staleCards(cards = [], {limit = 5} = {}) {
  return (Array.isArray(cards) ? cards : [])
    .filter(card => card && typeof card.number === 'number')
    .map(card => ({
      number: card.number,
      title: oneLine(card.title, 60),
      seat: (Array.isArray(card.labels) ? card.labels : [])
        .map(label => (typeof label === 'string' ? label : label?.name))
        .filter(name => name && name.startsWith('seat:'))
        .map(name => name.slice(5))[0] ?? null
    }))
    .sort((a, b) => a.number - b.number)
    .slice(0, limit);
}

/** 近 7 天失败次数最多的工作流。 */
export function repeatFailures(runs = [], {limit = 3, minFailures = 2} = {}) {
  const counts = new Map();
  for (const run of Array.isArray(runs) ? runs : []) {
    if (!run || run.conclusion !== 'failure') continue;
    const name = run.name || run.path || 'unknown';
    counts.set(name, (counts.get(name) ?? 0) + 1);
  }
  return [...counts]
    .filter(([, count]) => count >= minFailures)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([name, count]) => ({name: oneLine(name, 60), failures: count}));
}

/**
 * 汇总成一段可直接放进周会卡的议程。
 * 全部来源为空时明确写「没有待办信号」，而不是编一条。
 */
export function buildAutoAgenda({week, events = [], cards = [], runs = [], now = new Date().toISOString()} = {}) {
  const date = String(now).slice(0, 10);
  const topics = openTopics(events);
  const backlog = staleCards(cards);
  const failures = repeatFailures(runs);
  const lines = ['自动议程（' + date + ' 抓取，周 ' + week + '）', ''];

  lines.push('#### 1. 被唤醒但没收敛的议题');
  if (topics.length === 0) lines.push('- 无');
  for (const item of topics) {
    lines.push('- ' + item.topic + '（' + item.dedupe_key + '，' + (item.task_id ?? '无卡号') + '）');
  }

  lines.push('', '#### 2. 还没被领取的派单卡');
  if (backlog.length === 0) lines.push('- 无');
  for (const card of backlog) {
    lines.push('- #' + card.number + ' ' + card.title + (card.seat ? '（seat:' + card.seat + '）' : '（未指派席位）'));
  }

  lines.push('', '#### 3. 近 7 天反复失败的工作流');
  if (failures.length === 0) lines.push('- 无');
  for (const item of failures) lines.push('- ' + item.name + '：' + item.failures + ' 次');

  lines.push('', '> 本议程由仓库信号生成，未经模型改写；数字以抓取时刻为准。');
  return lines.join('\n');
}

export function hasAgendaSignal({events = [], cards = [], runs = []} = {}) {
  return openTopics(events).length > 0 || staleCards(cards).length > 0 || repeatFailures(runs).length > 0;
}
