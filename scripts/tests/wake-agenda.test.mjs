import test from 'node:test';
import assert from 'node:assert/strict';
import {
  openTopics,
  staleCards,
  repeatFailures,
  buildAutoAgenda,
  hasAgendaSignal
} from '../lib/wake-agenda.mjs';

const EVENTS = [
  {action: 'wake', dedupe_key: 'weekly:2026-W46', topic: '上周议题', task_id: 'issue-500', at: '2026-11-14T00:00:00Z'},
  {action: 'agreed', dedupe_key: 'weekly:2026-W46', at: '2026-11-15T00:00:00Z'},
  {action: 'wake', dedupe_key: 'weekly:2026-W47', topic: '本周议题', task_id: 'issue-536', at: '2026-11-21T00:00:00Z'}
];

test('openTopics skips topics that already have a conclusion event', () => {
  const topics = openTopics(EVENTS);
  assert.deepEqual(topics.map(item => item.dedupe_key), ['weekly:2026-W47']);
});

test('staleCards keeps hub:new cards in number order and reads the seat label', () => {
  const cards = staleCards([
    {number: 475, title: 'SOURCE-INTELLIGENCE', labels: [{name: 'dispatch'}, {name: 'seat:desktop-claude'}]},
    {number: 472, title: 'AUTOLOOP', labels: ['seat:desktop-claude']}
  ]);
  assert.deepEqual(cards.map(card => card.number), [472, 475]);
  assert.equal(cards[0].seat, 'desktop-claude');
});

test('repeatFailures only reports workflows at or above the threshold', () => {
  const runs = [
    {name: 'Pages', conclusion: 'failure'},
    {name: 'Pages', conclusion: 'failure'},
    {name: 'Harness', conclusion: 'failure'},
    {name: 'Harness', conclusion: 'success'}
  ];
  assert.deepEqual(repeatFailures(runs), [{name: 'Pages', failures: 2}]);
});

test('the agenda lists all three sections and says 无 when a source is empty', () => {
  const text = buildAutoAgenda({
    week: '2026-W47',
    events: EVENTS,
    cards: [{number: 472, title: 'AUTOLOOP', labels: ['seat:deep']}],
    runs: [],
    now: '2026-11-21T05:00:00Z'
  });
  assert.match(text, /2026-W47/);
  assert.match(text, /本周议题/);
  assert.match(text, /#472 AUTOLOOP（seat:deep）/);
  assert.match(text, /近 7 天反复失败的工作流\n- 无/);
  assert.match(text, /未经模型改写/);
});

test('an empty input set produces an explicit no-signal agenda', () => {
  const text = buildAutoAgenda({week: '2026-W48'});
  assert.equal(text.match(/- 无/g).length, 3);
  assert.equal(hasAgendaSignal({}), false);
  assert.equal(hasAgendaSignal({cards: [{number: 1, title: 'x', labels: []}]}), true);
});
