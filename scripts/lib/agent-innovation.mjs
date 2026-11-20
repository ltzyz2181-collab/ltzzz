import crypto from 'node:crypto';

export const IDEA_MARKERS = ['idea','idea-review','idea-vote','direction','idea-landed','idea-deferred'];

function parseFields(line) {
  const fields = {};
  const regex = /(\w+)=(?:"([^"]*)"|'([^']*)'|(\S+))/g;
  let match;
  while ((match = regex.exec(line)) !== null) {
    const key = match[1];
    const value = match[2] ?? match[3] ?? match[4];
    fields[key] = value;
  }
  return fields;
}

export function parseIdeaComments(comments) {
  const results = [];
  for (const comment of comments) {
    const lines = typeof comment?.body === 'string' ? comment.body.split('\n') : [];
    for (const line of lines) {
      const trimmed = line.trim();
      const markerMatch = trimmed.match(/^\[(\w+(?:-\w+)*)\]/);
      if (markerMatch) {
        const marker = markerMatch[1];
        if (IDEA_MARKERS.includes(marker)) {
          const rest = trimmed.slice(markerMatch[0].length).trim();
          const fields = parseFields(rest);
          results.push({
            marker,
            fields,
            comment_id: comment.id,
            created_at: comment.created_at,
            raw: trimmed
          });
        }
      }
    }
  }
  return results;
}

export function ideaId(title) {
  const normalized = title.normalize('NFKC').toLowerCase();
  const cleaned = normalized.replace(/[\s\p{P}\p{S}]/gu, '');
  const hash = crypto.createHash('sha256').update(cleaned, 'utf8').digest('hex');
  return hash.slice(0, 12);
}

export function evaluateIdeas({comments, now = Date.now(), maxPerCycle = 2, minAvgScore = 3.5, windowDays = 30}) {
  const parsedComments = parseIdeaComments(comments);
  
  let nowMs;
  if (typeof now === 'string') {
    const parsed = Date.parse(now);
    nowMs = isNaN(parsed) ? Date.now() : parsed;
  } else if (typeof now === 'number') {
    nowMs = now;
  } else {
    nowMs = Date.now();
  }
  
  const windowMs = windowDays * 24 * 60 * 60 * 1000;
  const cutoffMs = nowMs - windowMs;
  
  const ideas = parsedComments.filter(p => p.marker === 'idea');
  const reviews = parsedComments.filter(p => p.marker === 'idea-review');
  const votes = parsedComments.filter(p => p.marker === 'idea-vote');
  
  const requiredFields = ['id','seat','title','impact','effort','risk','l3','problem','benefit','cost','acceptance','rollback'];
  
  const idMap = new Map();
  
  for (const idea of ideas) {
    const {fields, comment_id, created_at} = idea;
    const id = fields.id;
    if (!id) continue;
    
    const createdMs = created_at ? Date.parse(created_at) : 0;
    
    if (!idMap.has(id)) {
      idMap.set(id, []);
    }
    idMap.get(id).push({fields, comment_id, created_at: createdMs});
  }
  
  const duplicates = [];
  for (const [id, entries] of idMap.entries()) {
    const recent = entries.filter(e => e.created_at >= cutoffMs);
    if (recent.length > 1) {
      duplicates.push({id, count: recent.length});
    }
  }
  
  const candidates = [];
  
  for (const [id, entries] of idMap.entries()) {
    entries.sort((a, b) => b.created_at - a.created_at);
    const latest = entries[0];
    const duplicateCount = entries.filter(e => e.created_at >= cutoffMs).length || 1;
    const {fields, comment_id, created_at} = latest;
    
    const missing = requiredFields.filter(f => !fields[f]);
    if (missing.length > 0) {
      candidates.push({
        id,
        comment_id,
        title: fields.title || '',
        average: 0,
        duplicate_count: duplicateCount,
        reason: `missing_fields:${missing.join(',')}`,
        status: 'rejected'
      });
      continue;
    }
    
    if (fields.l3 === 'yes') {
      candidates.push({
        id,
        comment_id,
        title: fields.title,
        average: 0,
        duplicate_count: duplicateCount,
        reason: 'l3_reserved',
        status: 'rejected'
      });
      continue;
    }
    
    if (fields.risk === 'high' || fields.effort === 'high') {
      candidates.push({
        id,
        comment_id,
        title: fields.title,
        average: 0,
        duplicate_count: duplicateCount,
        reason: 'risk_or_effort_high',
        status: 'rejected'
      });
      continue;
    }
    
    const reviewsForId = reviews.filter(r => r.fields.id === id);
    let rejected = false;
    let mergedInto = null;
    
    for (const review of reviewsForId) {
      if (review.fields.verdict === 'reject' && review.fields.reason) {
        rejected = true;
        break;
      }
      if (review.fields.verdict && review.fields.verdict.startsWith('merge-with:')) {
        mergedInto = review.fields.verdict.slice('merge-with:'.length);
        break;
      }
    }
    
    if (rejected) {
      candidates.push({
        id,
        comment_id,
        title: fields.title,
        average: 0,
        duplicate_count: duplicateCount,
        reason: 'review_rejected',
        status: 'rejected'
      });
      continue;
    }
    
    if (mergedInto) {
      candidates.push({
        id,
        comment_id,
        title: fields.title,
        average: 0,
        duplicate_count: duplicateCount,
        reason: `merged_into:${mergedInto}`,
        status: 'rejected'
      });
      continue;
    }
    
    const votesForId = votes.filter(v => v.fields.id === id);
    const validScores = [];
    for (const vote of votesForId) {
      const score = Number(vote.fields.score);
      if (Number.isInteger(score) && score >= 1 && score <= 5) {
        validScores.push(score);
      }
    }
    
    const average = validScores.length > 0
      ? validScores.reduce((a, b) => a + b, 0) / validScores.length
      : 0;
    
    if (average < minAvgScore) {
      candidates.push({
        id,
        comment_id,
        title: fields.title,
        average,
        duplicate_count: duplicateCount,
        reason: 'score_below_threshold',
        status: 'deferred',
        impact: fields.impact
      });
      continue;
    }
    
    candidates.push({
      id,
      comment_id,
      title: fields.title,
      average,
      duplicate_count: duplicateCount,
      reason: '',
      status: 'candidate',
      impact: fields.impact
    });
  }
  
  const passedCandidates = candidates.filter(c => c.status === 'candidate');
  
  const impactWeight = {high: 3, med: 2, low: 1};
  passedCandidates.sort((a, b) => {
    if (a.average !== b.average) return b.average - a.average;
    const aImpact = impactWeight[a.impact] || 0;
    const bImpact = impactWeight[b.impact] || 0;
    if (aImpact !== bImpact) return bImpact - aImpact;
    return a.comment_id - b.comment_id;
  });
  
  const selected = [];
  const deferred = [];
  
  for (let i = 0; i < passedCandidates.length; i++) {
    if (i < maxPerCycle) {
      selected.push(passedCandidates[i]);
    } else {
      const item = {...passedCandidates[i], reason: 'cycle_cap'};
      deferred.push(item);
    }
  }
  
  const rejected = candidates.filter(c => c.status === 'rejected');
  deferred.unshift(...candidates.filter(c => c.status === 'deferred'));
  
  return {
    selected,
    deferred,
    rejected,
    duplicates
  };
}
