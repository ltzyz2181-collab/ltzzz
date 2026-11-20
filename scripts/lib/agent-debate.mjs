import crypto from 'node:crypto';
import {ideaId} from './agent-innovation.mjs';
import {wakeDecision} from './agent-council.mjs';

export const DEBATE_MARKERS = [
  'idea',
  'idea-alt',
  'idea-revise',
  'idea-pilot',
  'idea-review',
  'idea-vote',
  'idea-landed',
  'idea-deferred',
  'idea-rejected',
  'direction',
  'debate-round',
  'debate-closed'
];

export const TOPICS = ['route', 'capability', 'channel', 'product', 'dispatch'];

export const TERMINAL_MARKERS = ['idea-landed', 'idea-deferred', 'idea-rejected'];

export const DEBATE_WAKE_EVENTS = [
  'idea_candidate',
  'idea_landed',
  'idea_deferred',
  'idea_rejected',
  'idea_overdue',
  'idea_escalated',
  'direction_weekly'
];

export const DEFAULT_POLICY = {
  maxPerCycle: 2,
  maxRounds: 4,
  maxPerSeatPerRound: 2,
  minAvgScore: 3.5,
  staleDays: 14,
  landDays: 7,
  windowDays: 30
};

const DAY_MS = 24 * 60 * 60 * 1000;
const REQUIRED_FIELDS = [
  'seat', 'title', 'impact', 'effort', 'risk', 'l3',
  'problem', 'benefit', 'cost', 'acceptance', 'rollback'
];
const IMPACT_WEIGHT = {high: 3, med: 2, low: 1};
const DISCUSSION_MARKERS = new Set(['idea-alt', 'idea-revise', 'idea-pilot', 'idea-review']);

function sha256Short(value) {
  return crypto.createHash('sha256').update(String(value), 'utf8').digest('hex').slice(0, 12);
}

function parseFields(line) {
  const fields = {};
  const regex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    fields[match[1]] = match[2] ?? match[3] ?? match[4];
  }
  return fields;
}

function toMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

export function parseDebateComments(comments) {
  const results = [];
  let currentRound = 1;
  let order = 0;

  for (const comment of comments || []) {
    const body = typeof comment?.body === 'string' ? comment.body : '';
    if (!body) continue;

    for (const line of body.split('\n')) {
      const trimmed = line.trim();
      const match = trimmed.match(/^\[([\w-]+)\]/);
      if (!match) continue;

      const marker = match[1];
      if (!DEBATE_MARKERS.includes(marker)) continue;

      const rest = trimmed.slice(match[0].length).trim();
      const fields = parseFields(rest);

      if (marker === 'debate-round') {
        const explicit = Number(fields.round);
        currentRound = Number.isInteger(explicit) && explicit > 0 ? explicit : currentRound + 1;
      }

      const explicitRound = Number(fields.round);
      const round = Number.isInteger(explicitRound) && explicitRound > 0
        ? explicitRound
        : currentRound;

      results.push({
        marker,
        fields,
        comment_id: Number(comment.id) || 0,
        created_at: toMs(comment.created_at),
        round,
        seat: fields.seat || null,
        order: order++,
        raw: trimmed
      });
    }
  }

  return results;
}

function emptyThread(id, createdAt) {
  return {
    id,
    created_at: createdAt || 0,
    root: null,
    variants: [],
    reviews: [],
    votes: [],
    terminals: [],
    markers: [],
    rounds: new Set(),
    seats: new Set()
  };
}

function applyRoundCap(thread, maxPerSeatPerRound, warnings) {
  const counters = new Map();
  const kept = [];
  for (const marker of thread.markers) {
    if (!DISCUSSION_MARKERS.has(marker.marker)) {
      kept.push(marker);
      continue;
    }
    const key = `${marker.round}:${marker.seat || 'unknown'}`;
    const count = (counters.get(key) || 0) + 1;
    counters.set(key, count);
    if (count > maxPerSeatPerRound) {
      warnings.push({
        code: 'round_cap_exceeded',
        id: thread.id,
        round: marker.round,
        seat: marker.seat,
        marker: marker.marker
      });
      continue;
    }
    kept.push(marker);
  }
  thread.markers = kept;
  thread.variants = kept.filter(m => ['idea-alt', 'idea-revise', 'idea-pilot'].includes(m.marker));
  thread.reviews = kept.filter(m => m.marker === 'idea-review');
  thread.terminals = kept.filter(m => TERMINAL_MARKERS.includes(m.marker));
}

function voteTarget(vote, rootId = null) {
  return vote.fields.id || vote.fields.parent || rootId || 'root';
}

function dedupeVotes(votes, rootId = null) {
  const byKey = new Map();
  for (const vote of votes) {
    const seat = vote.seat || `anon-${vote.comment_id}`;
    const key = `${seat}:${voteTarget(vote, rootId)}`;
    const previous = byKey.get(key);
    if (!previous || vote.comment_id >= previous.comment_id) {
      byKey.set(key, vote);
    }
  }
  return [...byKey.values()];
}

function scoreVotes(votes) {
  const scores = [];
  for (const vote of votes) {
    const score = Number(vote.fields.score);
    if (Number.isInteger(score) && score >= 1 && score <= 5) scores.push(score);
  }
  return scores.length > 0
    ? scores.reduce((sum, value) => sum + value, 0) / scores.length
    : 0;
}

function mergeFields(base, patches) {
  const merged = {...base};
  for (const patch of patches) {
    for (const [key, value] of Object.entries(patch.fields)) {
      if (['id', 'parent', 'seat', 'round', 'topic', 'scope', 'of'].includes(key)) continue;
      merged[key] = value;
    }
  }
  return merged;
}

function latestByComment(list) {
  return [...list].sort((a, b) => a.comment_id - b.comment_id).at(-1) || null;
}

function resolveTerminal(thread) {
  if (thread.terminals.length === 0) return null;
  const ranked = [...thread.terminals].sort((a, b) => {
    if (b.comment_id !== a.comment_id) return b.comment_id - a.comment_id;
    const priority = {landed: 3, deferred: 2, rejected: 1};
    return priority[terminalKind(b)] - priority[terminalKind(a)];
  });
  const chosen = ranked[0];
  return {
    kind: terminalKind(chosen),
    comment_id: chosen.comment_id,
    reason: chosen.fields.reason || '',
    at: chosen.created_at
  };
}

function terminalKind(marker) {
  if (marker.marker === 'idea-landed' || marker.marker === 'landed') return 'landed';
  if (marker.marker === 'idea-deferred' || marker.marker === 'deferred') return 'deferred';
  return 'rejected';
}

function splitSignals(thread) {
  const support = new Set();
  const oppose = new Set();

  for (const vote of dedupeVotes(thread.votes, thread.id)) {
    const score = Number(vote.fields.score);
    if (score >= 4) support.add(vote.seat || `anon-${vote.comment_id}`);
    if (score >= 1 && score <= 2) oppose.add(vote.seat || `anon-${vote.comment_id}`);
  }

  for (const review of thread.reviews) {
    const seat = review.seat || `anon-${review.comment_id}`;
    if (review.fields.verdict === 'pass') support.add(seat);
    if (review.fields.verdict === 'fail') oppose.add(seat);
  }

  return {
    split: support.size > 0 && oppose.size > 0,
    support: [...support],
    oppose: [...oppose]
  };
}

function candidateFrom(rootFields, marker, threadId, kind, warnings) {
  let id = marker.fields.id;
  if (!id) {
    id = ideaId(`${threadId}::${marker.fields.title || kind}`);
    warnings.push({code: 'candidate_id_derived', thread_id: threadId, id, kind});
  }
  return {
    id,
    thread_id: threadId,
    kind,
    comment_id: marker.comment_id,
    fields: mergeFields(rootFields, [marker]),
    source_marker: marker.marker
  };
}

export function evaluateDebate({comments, now = Date.now(), policy = {}}) {
  const P = {...DEFAULT_POLICY, ...policy};
  const nowMs = typeof now === 'string'
    ? (Date.parse(now) || Date.now())
    : (Number.isFinite(now) ? now : Date.now());

  const parsed = parseDebateComments(comments);
  const warnings = [];
  const threads = new Map();

  for (const marker of parsed) {
    if (marker.marker !== 'idea') continue;
    let id = marker.fields.id;
    if (!id && marker.fields.title) {
      id = ideaId(marker.fields.title);
      warnings.push({code: 'idea_id_derived', id, title: marker.fields.title});
    }
    if (!id) {
      warnings.push({code: 'idea_missing_id_and_title', comment_id: marker.comment_id});
      continue;
    }
    if (!threads.has(id)) threads.set(id, emptyThread(id, marker.created_at));
    const thread = threads.get(id);
    thread.root = marker;
    thread.created_at = thread.created_at || marker.created_at;
    thread.markers.push(marker);
    thread.rounds.add(marker.round);
    if (marker.seat) thread.seats.add(marker.seat);
  }

  const aliasToThread = new Map();
  for (const marker of parsed) {
    if (['idea-alt', 'idea-revise', 'idea-pilot'].includes(marker.marker)) {
      const parent = marker.fields.parent;
      const id = marker.fields.id;
      if (parent && id && threads.has(parent)) aliasToThread.set(id, parent);
    }
  }
  const resolveTarget = (fields) => fields.parent || aliasToThread.get(fields.id) || fields.id;

  for (const marker of parsed) {
    if (marker.marker === 'idea') continue;

    if (['direction', 'debate-round', 'debate-closed'].includes(marker.marker)) {
      const targetId = resolveTarget(marker.fields);
      if (targetId && threads.has(targetId)) {
        const thread = threads.get(targetId);
        thread.markers.push(marker);
        thread.rounds.add(marker.round);
        if (marker.seat) thread.seats.add(marker.seat);
      }
      continue;
    }

    const targetId = resolveTarget(marker.fields);
    if (!targetId) {
      warnings.push({code: 'orphan_marker', marker: marker.marker, comment_id: marker.comment_id});
      continue;
    }
    if (!threads.has(targetId)) {
      warnings.push({code: 'unknown_thread', marker: marker.marker, id: targetId, comment_id: marker.comment_id});
      continue;
    }

    const thread = threads.get(targetId);
    thread.markers.push(marker);
    thread.rounds.add(marker.round);
    if (marker.seat) thread.seats.add(marker.seat);
    if (['idea-alt', 'idea-revise', 'idea-pilot'].includes(marker.marker)) thread.variants.push(marker);
    else if (marker.marker === 'idea-review') thread.reviews.push(marker);
    else if (marker.marker === 'idea-vote') thread.votes.push(marker);
    else if (TERMINAL_MARKERS.includes(marker.marker)) thread.terminals.push(marker);
  }

  const selected = [];
  const deferred = [];
  const rejected = [];
  const unresolved = [];
  const overdue = [];
  const escalations = [];
  const threadReports = [];
  const topicCounts = Object.fromEntries([...TOPICS, 'unclassified'].map(topic => [topic, 0]));

  for (const thread of threads.values()) {
    applyRoundCap(thread, P.maxPerSeatPerRound, warnings);

    const rootFields = thread.root?.fields || {};
    const revisions = thread.variants
      .filter(marker => marker.marker === 'idea-revise')
      .sort((a, b) => a.comment_id - b.comment_id);
    const effective = mergeFields(rootFields, revisions);
    const pilotMarker = latestByComment(thread.variants.filter(marker => marker.marker === 'idea-pilot'));
    const pilot = pilotMarker
      ? {scope: pilotMarker.fields.scope || 'small', acceptance: pilotMarker.fields.acceptance || ''}
      : null;

    let topic = rootFields.topic || 'unclassified';
    if (!TOPICS.includes(topic)) {
      warnings.push({code: 'unknown_topic', id: thread.id, topic});
      topic = 'unclassified';
    }
    topicCounts[topic] += 1;

    const terminal = resolveTerminal(thread);
    const votes = dedupeVotes(thread.votes, thread.id);
    const rootVotes = votes.filter(vote => voteTarget(vote, thread.id) === thread.id);
    const score = scoreVotes(rootVotes);
    const signals = splitSignals(thread);
    const maxRound = thread.rounds.size > 0 ? Math.max(...thread.rounds) : 0;

    const candidates = [];
    if (thread.root) {
      candidates.push({
        id: thread.id,
        thread_id: thread.id,
        kind: 'root',
        comment_id: thread.root.comment_id,
        fields: effective,
        source_marker: 'idea'
      });
    }
    for (const alt of thread.variants.filter(marker => marker.marker === 'idea-alt')) {
      candidates.push(candidateFrom(effective, alt, thread.id, 'alt', warnings));
    }

    let threadStatus = 'open';
    let winner = null;
    let terminalReason = terminal?.reason || '';
    const threadRejections = [];

    if (terminal) {
      threadStatus = terminal.kind;
      terminalReason = terminal.reason || `terminal:${terminal.kind}`;
    } else {
      let bestCandidate = null;

      for (const candidate of candidates) {
        const missing = REQUIRED_FIELDS.filter(field => !candidate.fields[field]);
        const candidateVotes = dedupeVotes(
          thread.votes.filter(vote => voteTarget(vote, thread.id) === candidate.id),
          thread.id
        );
        const candidateScore = scoreVotes(candidateVotes);

        let status = 'candidate';
        let reason = '';

        if (missing.length > 0) {
          status = 'rejected';
          reason = `missing_fields:${missing.join(',')}`;
        } else if (candidate.fields.l3 === 'yes') {
          status = 'rejected';
          reason = 'l3_reserved';
        } else if (candidate.fields.risk === 'high') {
          status = 'rejected';
          reason = 'risk_high';
        } else if (candidate.fields.effort === 'high' && !pilot) {
          status = 'rejected';
          reason = 'effort_high_without_pilot';
        } else {
          const rejectReview = thread.reviews.find(review =>
            review.fields.id === candidate.id &&
            review.fields.verdict === 'reject' &&
            review.fields.reason
          );
          if (rejectReview) {
            status = 'rejected';
            reason = 'review_rejected';
          } else if (candidateScore < P.minAvgScore) {
            status = 'deferred';
            reason = 'score_below_threshold';
          }
        }

        const item = {
          id: candidate.id,
          thread_id: thread.id,
          title: candidate.fields.title || rootFields.title || '',
          kind: candidate.kind,
          impact: candidate.fields.impact || '',
          topic,
          score: candidateScore,
          votes: candidateVotes.length,
          comment_id: candidate.comment_id,
          pilot: pilot ? pilot.scope : null,
          status,
          reason
        };

        if (status === 'candidate') {
          if (!bestCandidate || item.score > bestCandidate.score ||
              (item.score === bestCandidate.score &&
               (IMPACT_WEIGHT[item.impact] || 0) > (IMPACT_WEIGHT[bestCandidate.impact] || 0))) {
            bestCandidate = item;
          }
        } else if (status === 'rejected') {
          threadRejections.push(item);
        } else {
          deferred.push(item);
        }
      }

      if (bestCandidate) {
        winner = bestCandidate;
        threadStatus = 'selected';
      } else if (threadRejections.length > 0) {
        threadStatus = 'rejected';
        terminalReason = threadRejections[0].reason;
      } else if (deferred.some(item => item.thread_id === thread.id)) {
        threadStatus = 'deferred';
        terminalReason = 'awaiting_score_or_cycle';
      }
    }

    if (winner) {
      winner.rank = 0;
      selected.push(winner);
    }

    const isTerminal = Boolean(terminal);
    const ageDays = thread.created_at ? (nowMs - thread.created_at) / DAY_MS : 0;

    if (!isTerminal && ageDays > P.staleDays) {
      overdue.push({
        id: thread.id,
        title: effective.title || '',
        reason: 'stale_open',
        age_days: Number(ageDays.toFixed(2)),
        stage: threadStatus
      });
    } else if (!isTerminal && winner && ageDays > P.landDays) {
      overdue.push({
        id: thread.id,
        title: effective.title || '',
        reason: 'selected_not_landed',
        age_days: Number(ageDays.toFixed(2)),
        stage: threadStatus
      });
    }

    if (!isTerminal) {
      unresolved.push({
        id: thread.id,
        title: effective.title || '',
        topic,
        status: threadStatus,
        reasons: threadRejections.map(item => item.reason).filter(Boolean),
        age_days: Number(ageDays.toFixed(2))
      });
    }

    if (!isTerminal && maxRound >= P.maxRounds) {
      escalations.push({id: thread.id, title: effective.title || '', reason: 'max_rounds', round: maxRound});
    }
    if (!isTerminal && signals.split) {
      escalations.push({id: thread.id, title: effective.title || '', reason: 'split', support: signals.support, oppose: signals.oppose});
    }
    for (const item of overdue) {
      if (item.id === thread.id) {
        escalations.push({id: thread.id, title: effective.title || '', reason: item.reason});
      }
    }

    threadReports.push({
      id: thread.id,
      title: effective.title || '',
      topic,
      status: threadStatus,
      terminal: terminal ? terminal.kind : null,
      terminal_reason: terminalReason,
      rounds: maxRound,
      seats: [...thread.seats].sort(),
      score: Number(score.toFixed(2)),
      votes: rootVotes.length,
      pilot: pilot ? pilot.scope : null,
      split: signals.split,
      winner: winner ? winner.id : null,
      variants: thread.variants.map(marker => ({
        marker: marker.marker,
        id: marker.fields.id || null,
        comment_id: marker.comment_id,
        round: marker.round
      })),
      reviews: thread.reviews.map(review => ({
        id: review.fields.id || thread.id,
        seat: review.seat,
        verdict: review.fields.verdict || '',
        round: review.round
      })),
      escalation: escalations
        .filter(item => item.id === thread.id)
        .map(item => item.reason),
      created_at: thread.created_at ? new Date(thread.created_at).toISOString() : null
    });
  }

  selected.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const impactDiff = (IMPACT_WEIGHT[b.impact] || 0) - (IMPACT_WEIGHT[a.impact] || 0);
    if (impactDiff !== 0) return impactDiff;
    return a.comment_id - b.comment_id;
  });

  const capped = [];
  const kept = [];
  for (const item of selected) {
    if (kept.length < P.maxPerCycle) kept.push(item);
    else capped.push({...item, status: 'deferred', reason: 'cycle_cap'});
  }
  selected.length = 0;
  selected.push(...kept);
  deferred.push(...capped);

  for (const item of capped) {
    const report = threadReports.find(thread => thread.id === item.thread_id);
    if (report && report.status === 'selected') {
      report.status = 'deferred';
      report.winner = null;
      report.terminal_reason = 'cycle_cap';
    }
  }

  const planned = [];
  for (const item of overdue) planned.push({id: item.id, event: 'idea_overdue', source: `${item.id}:${item.reason}`});
  for (const item of escalations) planned.push({id: item.id, event: 'idea_escalated', source: `${item.id}:${item.reason}`});
  for (const thread of threadReports) {
    if (thread.terminal === 'landed') planned.push({id: thread.id, event: 'idea_landed', source: `${thread.id}:landed`});
    if (thread.terminal === 'deferred') planned.push({id: thread.id, event: 'idea_deferred', source: `${thread.id}:deferred`});
    if (thread.terminal === 'rejected') planned.push({id: thread.id, event: 'idea_rejected', source: `${thread.id}:rejected`});
  }
  for (const item of selected) planned.push({id: item.thread_id, event: 'idea_candidate', source: `${item.id}:selected`});
  planned.push({id: '__direction__', event: 'direction_weekly', source: isoWeekKey(nowMs)});

  const wakes = [];
  const recent = [];
  for (const plan of planned) {
    const decision = wakeDecision({
      taskId: plan.id,
      event: plan.event,
      sourceId: plan.source,
      now: nowMs,
      recent
    });
    if (decision.wake) {
      recent.push({
        dedupe_key: decision.dedupe_key,
        taskId: plan.id,
        event: plan.event,
        timestamp: nowMs
      });
    }
    wakes.push({
      id: plan.id,
      event: plan.event,
      wake: decision.wake,
      reason: decision.reason,
      dedupe_key: decision.dedupe_key
    });
  }

  for (const thread of threadReports) {
    if (thread.terminal === 'deferred') {
      deferred.push({
        id: thread.id,
        thread_id: thread.id,
        title: thread.title,
        topic: thread.topic,
        reason: thread.terminal_reason || 'terminal_deferred',
        terminal: true,
        status: 'deferred'
      });
    }
  }

  const finalRejected = rejected.concat(
    threadReports
      .filter(thread => thread.status === 'rejected' && thread.terminal === null)
      .map(thread => ({id: thread.id, thread_id: thread.id, title: thread.title, reason: thread.terminal_reason, terminal: false})),
    threadReports
      .filter(thread => thread.terminal === 'rejected')
      .map(thread => ({id: thread.id, thread_id: thread.id, title: thread.title, topic: thread.topic, reason: thread.terminal_reason || 'terminal_rejected', terminal: true}))
  );

  return {
    schema: 'ltzzz.agent-debate.v1',
    generated_at: new Date(nowMs).toISOString(),
    policy: P,
    topics: topicCounts,
    counts: {
      threads: threadReports.length,
      selected: selected.length,
      deferred: deferred.length,
      rejected: finalRejected.length,
      unresolved: unresolved.length,
      overdue: overdue.length,
      escalations: escalations.length,
      wakes: wakes.filter(wake => wake.wake).length
    },
    threads: threadReports,
    selected,
    deferred,
    rejected: finalRejected,
    unresolved,
    overdue,
    escalations: dedupeEscalations(escalations),
    wakes,
    warnings
  };
}

function dedupeEscalations(escalations) {
  const seen = new Set();
  const out = [];
  for (const item of escalations) {
    const key = `${item.id}:${item.reason}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}

export function isoWeekKey(value) {
  const date = new Date(typeof value === 'string' ? Date.parse(value) : value);
  if (!Number.isFinite(date.getTime())) return 'unknown-week';
  const utc = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = utc.getUTCDay() || 7;
  utc.setUTCDate(utc.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(utc.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((utc - yearStart) / DAY_MS) + 1) / 7);
  return `${utc.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

export function renderDebateReport(report, {title = 'LTZZZ 方向讨论周期报告'} = {}) {
  const lines = [];
  lines.push(`# ${title}`);
  lines.push('');
  lines.push(`- 生成时间：${report.generated_at}`);
  lines.push(`- 周期标识：${isoWeekKey(report.generated_at)}`);
  lines.push(`- 记忆上下文：${report.memory?.complete ? '6/6 完整' : '缺失或不完整'}；digest=\`${report.memory?.digest || '-'}\`；commit=\`${report.memory?.commit || '-'}\``);
  lines.push('- 口径：本报告由脚本生成；记忆摘录不等于全文已读，CI 绿不等于线上验收。');
  lines.push('');

  lines.push('## 总览');
  lines.push('');
  lines.push('| 提案线程 | 入选 | 搁置 | 驳回 | 未终态 | 超期 | 合议升级 | 唤醒 |');
  lines.push('|---:|---:|---:|---:|---:|---:|---:|---:|');
  const counts = report.counts || {};
  lines.push(`| ${counts.threads || 0} | ${counts.selected || 0} | ${counts.deferred || 0} | ${counts.rejected || 0} | ${counts.unresolved || 0} | ${counts.overdue || 0} | ${counts.escalations || 0} | ${counts.wakes || 0} |`);
  lines.push('');

  lines.push('## 本周期入选');
  lines.push('');
  if (!report.selected || report.selected.length === 0) {
    lines.push('本周期没有达到阈值的提案。');
  } else {
    for (const item of report.selected) {
      lines.push(`- \`${item.id}\` ${item.title} — 议题=${item.topic}，分数=${item.score}，票数=${item.votes}，类型=${item.kind}${item.pilot ? `，试点=${item.pilot}` : ''}`);
    }
  }
  lines.push('');

  lines.push('## 未终态与超期（防烂尾）');
  lines.push('');
  if (!report.unresolved || report.unresolved.length === 0) {
    lines.push('所有提案线程都有终态。');
  } else {
    for (const item of report.unresolved) {
      const overdueItem = (report.overdue || []).find(row => row.id === item.id);
      lines.push(`- \`${item.id}\` ${item.title} — 状态=${item.status}，已开=${item.age_days}天${overdueItem ? `，超期=${overdueItem.reason}` : ''}`);
    }
  }
  lines.push('');

  lines.push('## 合议升级');
  lines.push('');
  if (!report.escalations || report.escalations.length === 0) {
    lines.push('本周期无需升级合议。');
  } else {
    for (const item of report.escalations) {
      lines.push(`- \`${item.id}\` ${item.title || ''} — 原因=${item.reason}${item.round ? `，轮次=${item.round}` : ''}`);
    }
  }
  lines.push('');

  lines.push('## 议题分布');
  lines.push('');
  lines.push('| 议题 | 线程数 |');
  lines.push('|---|---:|');
  for (const [topic, count] of Object.entries(report.topics || {})) {
    lines.push(`| ${topic} | ${count} |`);
  }
  lines.push('');

  lines.push('## 唤醒计划');
  lines.push('');
  const fired = (report.wakes || []).filter(wake => wake.wake);
  if (fired.length === 0) {
    lines.push('本周期没有新的唤醒事件（可能被去重或限流）。');
  } else {
    for (const wake of fired) {
      lines.push(`- ${wake.event} → \`${wake.id}\`（${wake.dedupe_key}）`);
    }
  }
  const suppressed = (report.wakes || []).filter(wake => !wake.wake);
  if (suppressed.length > 0) {
    lines.push('');
    lines.push(`另有 ${suppressed.length} 条唤醒被去重或限流，未重复打扰。`);
  }
  lines.push('');

  lines.push('## 标记速查');
  lines.push('');
  lines.push('- 提案：`[idea]`；替代方案：`[idea-alt parent=<id>]`；迭代：`[idea-revise parent=<id>]`；缩小试点：`[idea-pilot parent=<id> scope=small]`。');
  lines.push('- 议题：`topic=route|capability|channel|product|dispatch`。');
  lines.push('- 终态：`[idea-landed id=<id>]` / `[idea-deferred id=<id> reason=...]` / `[idea-rejected id=<id> reason=...]`。');
  lines.push('- 没有终态的提案会在超期后自动唤醒并升级，不允许只提案不落地。');
  lines.push('');

  return lines.join('\n');
}
