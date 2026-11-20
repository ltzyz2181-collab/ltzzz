import {test} from 'node:test';
import assert from 'node:assert/strict';
import {IDEA_MARKERS, parseIdeaComments, ideaId, evaluateIdeas} from '../lib/agent-innovation.mjs';

test('IDEA_MARKERS exports correct markers', () => {
  assert.deepEqual(IDEA_MARKERS, ['idea','idea-review','idea-vote','direction','idea-landed','idea-deferred']);
});

test('parseIdeaComments handles quoted fields', () => {
  const comments = [{
    id: 1,
    body: '[idea] title="Feature with spaces" impact=high',
    created_at: '2024-01-01T00:00:00Z'
  }];
  const result = parseIdeaComments(comments);
  assert.equal(result.length, 1);
  assert.equal(result[0].fields.title, 'Feature with spaces');
  assert.equal(result[0].fields.impact, 'high');
});

test('parseIdeaComments handles single quoted fields', () => {
  const comments = [{
    id: 2,
    body: "[idea] title='Another feature' effort=low"
  }];
  const result = parseIdeaComments(comments);
  assert.equal(result[0].fields.title, 'Another feature');
});

test('parseIdeaComments handles multiple markers in one comment', () => {
  const comments = [{
    id: 3,
    body: '[idea] id=abc title=Test\n[idea-vote] id=abc score=5'
  }];
  const result = parseIdeaComments(comments);
  assert.equal(result.length, 2);
  assert.equal(result[0].marker, 'idea');
  assert.equal(result[1].marker, 'idea-vote');
});

test('parseIdeaComments ignores unknown markers', () => {
  const comments = [{
    id: 4,
    body: '[unknown-marker] foo=bar\n[idea] id=test'
  }];
  const result = parseIdeaComments(comments);
  assert.equal(result.length, 1);
  assert.equal(result[0].marker, 'idea');
});

test('ideaId produces stable 12-char hex', () => {
  const id1 = ideaId('Add new feature');
  const id2 = ideaId('Add new feature');
  assert.equal(id1, id2);
  assert.equal(id1.length, 12);
  assert.match(id1, /^[0-9a-f]{12}$/);
});

test('ideaId normalizes and cleans title', () => {
  const id1 = ideaId('Add Feature!');
  const id2 = ideaId('add feature');
  assert.equal(id1, id2);
});

test('evaluateIdeas rejects ideas with missing fields', () => {
  const comments = [{
    id: 1,
    body: '[idea] id=test1 seat=relay title=Incomplete impact=high'
  }];
  const result = evaluateIdeas({comments});
  assert.equal(result.rejected.length, 1);
  assert.match(result.rejected[0].reason, /missing_fields/);
});

test('evaluateIdeas rejects ideas with l3=yes', () => {
  const comments = [{
    id: 2,
    body: '[idea] id=test2 seat=relay title=Reserved impact=high effort=low risk=low l3=yes problem=x benefit=y cost=z acceptance=a rollback=b'
  }];
  const result = evaluateIdeas({comments});
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].reason, 'l3_reserved');
});

test('evaluateIdeas rejects ideas with high risk or effort', () => {
  const comments = [{
    id: 3,
    body: '[idea] id=test3 seat=relay title=HighRisk impact=low effort=low risk=high l3=no problem=x benefit=y cost=z acceptance=a rollback=b'
  }];
  const result = evaluateIdeas({comments});
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].reason, 'risk_or_effort_high');
});

test('evaluateIdeas rejects ideas with review verdict=reject and reason', () => {
  const comments = [
    {id: 4, body: '[idea] id=test4 seat=relay title=Rejected impact=low effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 5, body: '[idea-review] id=test4 verdict=reject reason=not-good'}
  ];
  const result = evaluateIdeas({comments});
  assert.equal(result.rejected.length, 1);
  assert.equal(result.rejected[0].reason, 'review_rejected');
});

test('evaluateIdeas ignores review verdict=reject without reason', () => {
  const comments = [
    {id: 6, body: '[idea] id=test5 seat=relay title=NotRejected impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 7, body: '[idea-review] id=test5 verdict=reject'},
    {id: 8, body: '[idea-vote] id=test5 score=5'}
  ];
  const result = evaluateIdeas({comments});
  assert.equal(result.selected.length, 1);
});

test('evaluateIdeas calculates average score and ignores invalid votes', () => {
  const comments = [
    {id: 9, body: '[idea] id=test6 seat=relay title=Voted impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 10, body: '[idea-vote] id=test6 score=5'},
    {id: 11, body: '[idea-vote] id=test6 score=4'},
    {id: 12, body: '[idea-vote] id=test6 score=invalid'},
    {id: 13, body: '[idea-vote] id=test6 score=10'}
  ];
  const result = evaluateIdeas({comments});
  assert.equal(result.selected.length, 1);
  assert.equal(result.selected[0].average, 4.5);
});

test('evaluateIdeas defers ideas below minAvgScore', () => {
  const comments = [
    {id: 14, body: '[idea] id=test7 seat=relay title=LowScore impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 15, body: '[idea-vote] id=test7 score=2'}
  ];
  const result = evaluateIdeas({comments, minAvgScore: 3.5});
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].reason, 'score_below_threshold');
  assert.equal(result.rejected.length, 0);
});

test('evaluateIdeas selects top ideas by maxPerCycle', () => {
  const comments = [
    {id: 16, body: '[idea] id=test8 seat=relay title=First impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 17, body: '[idea-vote] id=test8 score=5'},
    {id: 18, body: '[idea] id=test9 seat=relay title=Second impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 19, body: '[idea-vote] id=test9 score=5'},
    {id: 20, body: '[idea] id=test10 seat=relay title=Third impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b'},
    {id: 21, body: '[idea-vote] id=test10 score=5'}
  ];
  const result = evaluateIdeas({comments, maxPerCycle: 2});
  assert.equal(result.selected.length, 2);
  assert.equal(result.deferred.length, 1);
  assert.equal(result.deferred[0].reason, 'cycle_cap');
});

test('evaluateIdeas counts duplicates within windowDays', () => {
  const now = new Date('2024-02-01T00:00:00Z').getTime();
  const comments = [
    {id: 22, body: '[idea] id=dup1 seat=relay title=Duplicate impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b', created_at: '2024-01-15T00:00:00Z'},
    {id: 23, body: '[idea] id=dup1 seat=relay title=Duplicate impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b', created_at: '2024-01-20T00:00:00Z'},
    {id: 24, body: '[idea-vote] id=dup1 score=5'}
  ];
  const result = evaluateIdeas({comments, now, windowDays: 30});
  assert.equal(result.duplicates.length, 1);
  assert.equal(result.duplicates[0].id, 'dup1');
  assert.equal(result.duplicates[0].count, 2);
  assert.equal(result.selected[0].duplicate_count, 2);
});

test('evaluateIdeas accepts ISO string for now parameter', () => {
  const comments = [
    {id: 25, body: '[idea] id=test11 seat=relay title=ISOTest impact=high effort=low risk=low l3=no problem=x benefit=y cost=z acceptance=a rollback=b', created_at: '2024-01-01T00:00:00Z'},
    {id: 26, body: '[idea-vote] id=test11 score=5'}
  ];
  const result = evaluateIdeas({comments, now: '2024-02-01T00:00:00Z', windowDays: 30});
  assert.equal(result.selected.length, 1);
});
