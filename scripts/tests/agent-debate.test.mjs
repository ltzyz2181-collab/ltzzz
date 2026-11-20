import {test} from 'node:test';
import assert from 'node:assert/strict';
import {
  DEBATE_MARKERS,
  TOPICS,
  DEBATE_WAKE_EVENTS,
  parseDebateComments,
  evaluateDebate,
  renderDebateReport,
  isoWeekKey
} from '../lib/agent-debate.mjs';

const NOW = '2026-11-20T00:00:00.000Z';
const RECENT = '2026-11-19T00:00:00.000Z';
let seq = 1;

function mk(body, created_at = RECENT) {
  return {id: seq++, body, created_at};
}

function idea(id, extra = '', created_at = RECENT) {
  return mk(`[idea] id=${id} seat=deep topic=capability title=${id} impact=high effort=low risk=low l3=no problem=p benefit=b cost=c acceptance=a rollback=r ${extra}`, created_at);
}

function vote(id, seat, score) {
  return mk(`[idea-vote] id=${id} seat=${seat} score=${score}`);
}

test('exports markers, topics and wake events', () => {
  assert.ok(DEBATE_MARKERS.includes('idea-alt'));
  assert.ok(DEBATE_MARKERS.includes('idea-revise'));
  assert.ok(DEBATE_MARKERS.includes('idea-pilot'));
  assert.ok(DEBATE_MARKERS.includes('idea-rejected'));
  assert.deepEqual(TOPICS, ['route', 'capability', 'channel', 'product', 'dispatch']);
  assert.ok(DEBATE_WAKE_EVENTS.includes('idea_overdue'));
  assert.ok(DEBATE_WAKE_EVENTS.includes('direction_weekly'));
});

test('parseDebateComments applies explicit and inferred rounds', () => {
  const parsed = parseDebateComments([
    mk('[idea] id=a\n[debate-round] round=2\n[idea-review] id=a seat=x verdict=pass', NOW)
  ]);
  assert.equal(parsed[0].round, 1);
  assert.equal(parsed[1].round, 2);
  assert.equal(parsed[2].round, 2);
});

test('alternative proposal can win on higher impact', () => {
  const comments = [
    mk('[idea] id=root1 seat=deep topic=product title=BaseIdea impact=med effort=low risk=low l3=no problem=p benefit=b cost=c acceptance=a rollback=r'),
    mk('[idea-alt] parent=root1 id=alt1 seat=claude topic=product title=AltIdea impact=high effort=low risk=low l3=no problem=p benefit=b cost=c acceptance=a rollback=r'),
    vote('root1', 'gpt', 5),
    vote('alt1', 'qwen', 5)
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, 'alt1');
  assert.equal(result.selected[0].kind, 'alt');
  assert.equal(result.threads[0].winner, 'alt1');
});

test('revision can lower effort and unblock a proposal', () => {
  const comments = [
    mk('[idea] id=root2 seat=deep topic=route title=Heavy impact=high effort=high risk=low l3=no problem=p benefit=b cost=c acceptance=a rollback=r'),
    mk('[idea-revise] parent=root2 seat=claude effort=low acceptance=a2'),
    vote('root2', 'qwen', 5)
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].id, 'root2');
});

test('pilot rescues a high-effort proposal with narrowed scope', () => {
  const comments = [
    mk('[idea] id=root3 seat=deep topic=capability title=Pilot impact=high effort=high risk=low l3=no problem=p benefit=b cost=c acceptance=a rollback=r'),
    mk('[idea-pilot] parent=root3 seat=claude scope=small acceptance=pilot-ok'),
    vote('root3', 'qwen', 4)
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].pilot, 'small');
});

test('topic distribution counts the five focus areas', () => {
  const comments = [
    idea('t1', 'topic=product'),
    idea('t2', 'topic=dispatch'),
    mk('[idea] id=t3 seat=deep topic=weird title=t3 impact=high effort=low risk=low l3=no problem=p benefit=b cost=c acceptance=a rollback=r')
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.equal(result.topics.product, 1);
  assert.equal(result.topics.dispatch, 1);
  assert.equal(result.topics.unclassified, 1);
  assert.ok(result.warnings.some(warning => warning.code === 'unknown_topic'));
});

test('two seats in disagreement trigger council escalation', () => {
  const comments = [
    idea('split1'),
    vote('split1', 'qwen', 5),
    vote('split1', 'grok', 1)
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.ok(result.threads[0].split);
  assert.ok(result.escalations.some(item => item.id === 'split1' && item.reason === 'split'));
});

test('max rounds escalate to arbiter instead of looping forever', () => {
  const comments = [
    idea('loop1'),
    vote('loop1', 'qwen', 5),
    mk('[debate-round] id=loop1 round=4')
  ];
  const result = evaluateDebate({comments, now: NOW, policy: {maxRounds: 4}});
  assert.ok(result.escalations.some(item => item.id === 'loop1' && item.reason === 'max_rounds'));
});

test('per-seat per-round cap drops extra debate markers', () => {
  const comments = [
    idea('cap1'),
    mk('[idea-revise] parent=cap1 seat=deep effort=low'),
    mk('[idea-revise] parent=cap1 seat=deep effort=low'),
    mk('[idea-revise] parent=cap1 seat=deep effort=low')
  ];
  const result = evaluateDebate({comments, now: NOW, policy: {maxPerSeatPerRound: 2}});
  assert.ok(result.warnings.some(warning => warning.code === 'round_cap_exceeded'));
});

test('landed terminal closes the thread and emits a wake', () => {
  const comments = [
    idea('done1'),
    mk('[idea-landed] id=done1 seat=claude')
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.equal(result.threads[0].terminal, 'landed');
  assert.equal(result.unresolved.length, 0);
  assert.ok(result.wakes.some(wake => wake.id === 'done1' && wake.event === 'idea_landed' && wake.wake));
});

test('stale open proposal becomes overdue and escalates', () => {
  const comments = [idea('stale1', '', '2026-10-31T00:00:00.000Z')];
  const result = evaluateDebate({comments, now: NOW, policy: {staleDays: 14}});
  assert.ok(result.overdue.some(item => item.id === 'stale1' && item.reason === 'stale_open'));
  assert.ok(result.escalations.some(item => item.id === 'stale1' && item.reason === 'stale_open'));
  assert.ok(result.wakes.some(wake => wake.id === 'stale1' && wake.event === 'idea_overdue'));
});

test('selected but not landed within landDays becomes overdue', () => {
  const comments = [
    idea('late1', '', '2026-11-10T00:00:00.000Z'),
    vote('late1', 'qwen', 5)
  ];
  const result = evaluateDebate({comments, now: NOW, policy: {landDays: 7, staleDays: 14}});
  assert.equal(result.selected.length, 1);
  assert.ok(result.overdue.some(item => item.id === 'late1' && item.reason === 'selected_not_landed'));
});

test('cycle cap keeps at most two and defers the rest without closing them', () => {
  const comments = [
    idea('c1'), vote('c1', 'qwen', 5),
    idea('c2'), vote('c2', 'qwen', 5),
    idea('c3'), vote('c3', 'qwen', 5)
  ];
  const result = evaluateDebate({comments, now: NOW, policy: {maxPerCycle: 2}});
  assert.equal(result.selected.length, 2);
  const capped = result.deferred.find(item => item.reason === 'cycle_cap');
  assert.ok(capped);
  assert.ok(result.unresolved.some(item => item.id === capped.thread_id));
});

test('low score defers and l3 or review reject rejects', () => {
  const comments = [
    idea('low1'), vote('low1', 'qwen', 2),
    idea('l31', 'l3=yes'),
    idea('rev1'), mk('[idea-review] id=rev1 seat=gpt verdict=reject reason=bad')
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.ok(result.deferred.some(item => item.id === 'low1' && item.reason === 'score_below_threshold'));
  assert.ok(result.rejected.some(item => item.id === 'l31' && item.reason === 'l3_reserved'));
  assert.ok(result.rejected.some(item => item.id === 'rev1' && item.reason === 'review_rejected'));
});

test('one vote per seat counts, latest vote wins', () => {
  const comments = [
    idea('dupvote'),
    vote('dupvote', 'qwen', 5),
    vote('dupvote', 'qwen', 1)
  ];
  const result = evaluateDebate({comments, now: NOW});
  assert.equal(result.threads[0].votes, 1);
  assert.equal(result.threads[0].score, 1);
  assert.ok(result.deferred.some(item => item.id === 'dupvote'));
});

test('wake planning respects the global rate limit', () => {
  const comments = [];
  for (let i = 0; i < 10; i += 1) {
    comments.push(idea(`burst${i}`));
    comments.push(mk(`[idea-landed] id=burst${i} seat=claude`));
  }
  const result = evaluateDebate({comments, now: NOW});
  const fired = result.wakes.filter(wake => wake.wake);
  assert.ok(fired.length > 0);
  assert.ok(fired.length <= 6);
});

test('isoWeekKey returns a stable ISO week identifier', () => {
  assert.equal(isoWeekKey('2026-11-20T00:00:00.000Z'), '2026-W47');
});

test('renderDebateReport includes anti-abandonment sections', () => {
  const result = evaluateDebate({comments: [idea('render1')], now: NOW});
  const memory = {complete: true, digest: 'abc123', commit: 'deadbeef', files: []};
  const markdown = renderDebateReport({...result, memory});
  assert.match(markdown, /## 总览/);
  assert.match(markdown, /## 未终态与超期（防烂尾）/);
  assert.match(markdown, /## 合议升级/);
  assert.match(markdown, /abc123/);
  assert.match(markdown, /idea-alt/);
});
