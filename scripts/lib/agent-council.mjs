export const MARKERS = [
  'proposal',
  'review',
  'objection',
  'concur',
  'council',
  'consensus',
  'arbiter-request',
  'arbiter-decision'
];

export const WAKE_EVENTS = [
  'timeout',
  'review_rejected',
  'council_opened',
  'council_split',
  'arbiter_decision',
  'urgent_alert'
];

export function parseCouncilComments(comments) {
  const results = [];
  const markerSet = new Set(MARKERS);

  for (const comment of comments) {
    if (!comment || !comment.body) continue;

    const lines = comment.body.split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      const match = trimmed.match(/^\[([a-z-]+)\](.*)$/);
      if (!match) continue;

      const marker = match[1];
      if (!markerSet.has(marker)) continue;

      const rest = match[2].trim();
      const fields = {};
      let seat = null;
      let round = null;

      const pairs = rest.split(/\s+/);
      for (const pair of pairs) {
        const eqIdx = pair.indexOf('=');
        if (eqIdx === -1) continue;
        const key = pair.slice(0, eqIdx);
        const value = pair.slice(eqIdx + 1);
        fields[key] = value;

        if (key === 'seat') seat = value;
        if (key === 'round') round = parseInt(value, 10) || null;
      }

      results.push({
        marker,
        fields,
        comment_id: comment.id,
        seat,
        round,
        raw: line
      });
    }
  }

  return results;
}

export function evaluateCouncil({
  taskId,
  comments,
  requiredSeats = ['relay-claude', 'relay-gpt'],
  maxRounds = 2,
  reserved = false
}) {
  const parsed = parseCouncilComments(comments);

  const objections = parsed.filter(p => p.marker === 'objection');
  const proposals = parsed.filter(p => p.marker === 'proposal');
  const concurs = parsed.filter(p => p.marker === 'concur');
  const reviews = parsed.filter(p => p.marker === 'review');
  const councils = parsed.filter(p => p.marker === 'council');
  const consensuses = parsed.filter(p => p.marker === 'consensus');

  let blocking = 0;
  for (const obj of objections) {
    if (obj.fields.severity === 'blocking') {
      const objRound = obj.round;
      const hasLaterProposal = proposals.some(
        p => p.round === objRound && p.comment_id > obj.comment_id
      );
      const hasConcur = concurs.some(
        c => c.fields.ref === String(obj.comment_id)
      );
      if (!hasLaterProposal && !hasConcur) {
        blocking++;
      }
    }
  }

  if (blocking > 0) {
    return {
      stage: 'revision_required',
      round: Math.max(...parsed.map(p => p.round || 0), 0),
      consensus: false,
      blocking,
      next: 'revision_required',
      reason: 'blocking objection'
    };
  }

  const reviewsBySteat = {};
  for (const rev of reviews) {
    if (rev.seat && rev.fields.verdict) {
      reviewsBySteat[rev.seat] = rev.fields.verdict;
    }
  }

  const requiredReviews = requiredSeats.map(s => reviewsBySteat[s]).filter(Boolean);
  const hasPass = requiredReviews.some(v => v === 'pass');
  const hasFail = requiredReviews.some(v => v === 'fail');

  if (reserved && requiredReviews.length < requiredSeats.length) {
    return {
      stage: 'wait',
      round: Math.max(...parsed.map(p => p.round || 0), 0),
      consensus: false,
      blocking: 0,
      next: 'wait',
      reason: 'waiting for all required seats'
    };
  }

  if (hasPass && hasFail) {
    const maxCouncilRound = councils.length > 0
      ? Math.max(...councils.map(c => c.round || 0))
      : 0;
    if (maxCouncilRound >= maxRounds) {
      return {
        stage: 'council',
        round: maxCouncilRound,
        consensus: false,
        blocking: 0,
        next: 'arbitrate',
        reason: 'council max rounds reached'
      };
    }
    return {
      stage: 'council',
      round: maxCouncilRound,
      consensus: false,
      blocking: 0,
      next: 'open_council',
      reason: 'review verdict mismatch'
    };
  }

  if (!reserved && requiredReviews.length === 1 && !hasFail) {
    const maxCouncilRound = councils.length > 0
      ? Math.max(...councils.map(c => c.round || 0))
      : 0;
    if (maxCouncilRound >= maxRounds) {
      return {
        stage: 'council',
        round: maxCouncilRound,
        consensus: false,
        blocking: 0,
        next: 'arbitrate',
        reason: 'single review, council max rounds'
      };
    }
    return {
      stage: 'council',
      round: maxCouncilRound,
      consensus: false,
      blocking: 0,
      next: 'open_council',
      reason: 'only one seat reviewed'
    };
  }

  const splitConsensus = consensuses.find(
    c => c.fields.result === 'split' && (c.round || 0) >= maxRounds
  );
  if (splitConsensus) {
    return {
      stage: 'council',
      round: splitConsensus.round || 0,
      consensus: false,
      blocking: 0,
      next: 'arbitrate',
      reason: 'consensus split at max rounds'
    };
  }

  const allPass = requiredReviews.length === requiredSeats.length &&
                  requiredReviews.every(v => v === 'pass');

  if (allPass && blocking === 0) {
    return {
      stage: 'approved',
      round: Math.max(...parsed.map(p => p.round || 0), 0),
      consensus: true,
      blocking: 0,
      next: 'approve',
      reason: 'all required seats pass'
    };
  }

  return {
    stage: 'wait',
    round: Math.max(...parsed.map(p => p.round || 0), 0),
    consensus: allPass,
    blocking: 0,
    next: 'wait',
    reason: 'waiting'
  };
}

export function wakeDecision({
  taskId,
  event,
  sourceId,
  now,
  recent = []
}) {
  const dedupe_key = `${taskId}:${event}:${sourceId}`;

  if (recent.some(r => r.dedupe_key === dedupe_key)) {
    return {
      wake: false,
      reason: 'duplicate',
      dedupe_key,
      suppressed: true
    };
  }

  const oneHourAgo = now - 3600000;
  const recentForTask = recent.filter(
    r => r.taskId === taskId && r.timestamp > oneHourAgo
  );
  if (recentForTask.length >= 1) {
    return {
      wake: false,
      reason: 'task_rate_limited',
      dedupe_key,
      suppressed: true
    };
  }

  if (recent.length >= 6) {
    return {
      wake: false,
      reason: 'global_rate_limited',
      dedupe_key,
      suppressed: true
    };
  }

  return {
    wake: true,
    reason: 'wake',
    dedupe_key,
    suppressed: false
  };
}
