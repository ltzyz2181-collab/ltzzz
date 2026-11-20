import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  MARKERS,
  WAKE_EVENTS,
  parseCouncilComments,
  evaluateCouncil,
  wakeDecision
} from '../lib/agent-council.mjs';

describe('agent-council', () => {
  it('MARKERS exports expected array', () => {
    assert.deepEqual(MARKERS, [
      'proposal',
      'review',
      'objection',
      'concur',
      'council',
      'consensus',
      'arbiter-request',
      'arbiter-decision'
    ]);
  });

  it('WAKE_EVENTS exports expected array', () => {
    assert.deepEqual(WAKE_EVENTS, [
      'timeout',
      'review_rejected',
      'council_opened',
      'council_split',
      'arbiter_decision',
      'urgent_alert'
    ]);
  });

  it('parseCouncilComments ignores unknown markers', () => {
    const comments = [
      { id: 1, body: '[unknown] key=value' },
      { id: 2, body: '[review] seat=relay-claude verdict=pass' }
    ];
    const parsed = parseCouncilComments(comments);
    assert.equal(parsed.length, 1);
    assert.equal(parsed[0].marker, 'review');
  });

  it('parseCouncilComments handles multiple markers per comment', () => {
    const comments = [
      {
        id: 10,
        body: '[review] seat=relay-claude verdict=pass\n[review] seat=relay-gpt verdict=fail'
      }
    ];
    const parsed = parseCouncilComments(comments);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].fields.verdict, 'pass');
    assert.equal(parsed[1].fields.verdict, 'fail');
  });

  it('evaluateCouncil: both seats pass with no blocking → approve', () => {
    const comments = [
      { id: 1, body: '[review] seat=relay-claude verdict=pass round=1' },
      { id: 2, body: '[review] seat=relay-gpt verdict=pass round=1' }
    ];
    const result = evaluateCouncil({ taskId: 't1', comments });
    assert.equal(result.stage, 'approved');
    assert.equal(result.next, 'approve');
    assert.equal(result.consensus, true);
    assert.equal(result.blocking, 0);
  });

  it('evaluateCouncil: blocking objection without concur → revision_required', () => {
    const comments = [
      { id: 1, body: '[review] seat=relay-claude verdict=pass round=1' },
      { id: 2, body: '[objection] severity=blocking round=1' },
      { id: 3, body: '[review] seat=relay-gpt verdict=pass round=1' }
    ];
    const result = evaluateCouncil({ taskId: 't2', comments });
    assert.equal(result.stage, 'revision_required');
    assert.equal(result.next, 'revision_required');
    assert.equal(result.blocking, 1);
  });

  it('evaluateCouncil: blocking objection with concur → not blocking', () => {
    const comments = [
      { id: 1, body: '[objection] severity=blocking round=1' },
      { id: 2, body: '[concur] ref=1' },
      { id: 3, body: '[review] seat=relay-claude verdict=pass round=1' },
      { id: 4, body: '[review] seat=relay-gpt verdict=pass round=1' }
    ];
    const result = evaluateCouncil({ taskId: 't3', comments });
    assert.equal(result.stage, 'approved');
    assert.equal(result.next, 'approve');
    assert.equal(result.blocking, 0);
  });

  it('evaluateCouncil: two seats disagree → open_council', () => {
    const comments = [
      { id: 1, body: '[review] seat=relay-claude verdict=pass round=1' },
      { id: 2, body: '[review] seat=relay-gpt verdict=fail round=1' }
    ];
    const result = evaluateCouncil({ taskId: 't4', comments });
    assert.equal(result.stage, 'council');
    assert.equal(result.next, 'open_council');
    assert.equal(result.consensus, false);
  });

  it('evaluateCouncil: council split at max rounds → arbitrate', () => {
    const comments = [
      { id: 1, body: '[review] seat=relay-claude verdict=pass round=1' },
      { id: 2, body: '[review] seat=relay-gpt verdict=fail round=1' },
      { id: 3, body: '[council] round=2' },
      { id: 4, body: '[consensus] result=split round=2' }
    ];
    const result = evaluateCouncil({ taskId: 't5', comments, maxRounds: 2 });
    assert.equal(result.next, 'arbitrate');
    assert.equal(result.stage, 'council');
  });

  it('evaluateCouncil: reserved mode missing one seat → wait', () => {
    const comments = [
      { id: 1, body: '[review] seat=relay-claude verdict=pass round=1' }
    ];
    const result = evaluateCouncil({
      taskId: 't6',
      comments,
      reserved: true
    });
    assert.equal(result.stage, 'wait');
    assert.equal(result.next, 'wait');
    assert.equal(result.reason, 'waiting for all required seats');
  });

  it('parseCouncilComments is idempotent on duplicate comments', () => {
    const comments = [
      { id: 1, body: '[review] seat=relay-claude verdict=pass' },
      { id: 1, body: '[review] seat=relay-claude verdict=pass' }
    ];
    const parsed = parseCouncilComments(comments);
    assert.equal(parsed.length, 2);
    assert.equal(parsed[0].comment_id, 1);
    assert.equal(parsed[1].comment_id, 1);
  });

  it('wakeDecision: timeout event wakes', () => {
    const result = wakeDecision({
      taskId: 't1',
      event: 'timeout',
      sourceId: 's1',
      now: Date.now(),
      recent: []
    });
    assert.equal(result.wake, true);
    assert.equal(result.reason, 'wake');
    assert.equal(result.suppressed, false);
    assert.equal(result.dedupe_key, 't1:timeout:s1');
  });

  it('wakeDecision: duplicate dedupe_key → suppressed', () => {
    const now = Date.now();
    const recent = [
      { dedupe_key: 't1:timeout:s1', taskId: 't1', timestamp: now - 1000 }
    ];
    const result = wakeDecision({
      taskId: 't1',
      event: 'timeout',
      sourceId: 's1',
      now,
      recent
    });
    assert.equal(result.wake, false);
    assert.equal(result.reason, 'duplicate');
    assert.equal(result.suppressed, true);
  });

  it('wakeDecision: same task within 1 hour → task_rate_limited', () => {
    const now = Date.now();
    const recent = [
      { dedupe_key: 't1:other:s2', taskId: 't1', timestamp: now - 600000 }
    ];
    const result = wakeDecision({
      taskId: 't1',
      event: 'timeout',
      sourceId: 's1',
      now,
      recent
    });
    assert.equal(result.wake, false);
    assert.equal(result.reason, 'task_rate_limited');
    assert.equal(result.suppressed, true);
  });

  it('wakeDecision: global limit ≥6 → global_rate_limited', () => {
    const now = Date.now();
    const recent = [
      { dedupe_key: 'a:e:1', taskId: 'a', timestamp: now - 1000 },
      { dedupe_key: 'b:e:2', taskId: 'b', timestamp: now - 2000 },
      { dedupe_key: 'c:e:3', taskId: 'c', timestamp: now - 3000 },
      { dedupe_key: 'd:e:4', taskId: 'd', timestamp: now - 4000 },
      { dedupe_key: 'e:e:5', taskId: 'e', timestamp: now - 5000 },
      { dedupe_key: 'f:e:6', taskId: 'f', timestamp: now - 6000 }
    ];
    const result = wakeDecision({
      taskId: 't1',
      event: 'timeout',
      sourceId: 's1',
      now,
      recent
    });
    assert.equal(result.wake, false);
    assert.equal(result.reason, 'global_rate_limited');
    assert.equal(result.suppressed, true);
  });
});
