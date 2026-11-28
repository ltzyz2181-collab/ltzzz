import test from 'node:test';
import assert from 'node:assert/strict';
import {
  COMMIT_RE,
  consumedByReceipts,
  dispatchCards,
  dispatchCommit,
  findCardAddCommit,
  findInFlightRun,
  itemConsumed,
  planDispatches,
} from '../dispatch-card-queue.mjs';

const COMMIT = 'a'.repeat(40);
const OTHER = 'b'.repeat(40);
const CARD = 'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261127-OPS-1.json';

test('首次新增提交从 git log 读取并校验为 40 位 SHA', () => {
  assert.equal(findCardAddCommit(CARD, {exec: () => `${COMMIT}\n`}), COMMIT);
  assert.equal(findCardAddCommit(CARD, {exec: () => 'not-a-sha\n'}), null);
  assert.equal(findCardAddCommit(CARD, {exec: () => { throw new Error('no git'); }}), null);
  assert.ok(COMMIT_RE.test(COMMIT));
});

test('只有真正到达 worker 或已终态的条目才算消费，提交前 blocked 允许补派', () => {
  assert.equal(itemConsumed({post_attempted: true}), true);
  assert.equal(itemConsumed({reused_existing: true}), true);
  assert.equal(itemConsumed({status: 'job_terminal_observed'}), true);
  assert.equal(itemConsumed({status: 'blocked', post_attempted: false}), false);
  assert.equal(itemConsumed({status: 'pending_reconcile_get_only'}), false);
  assert.equal(consumedByReceipts([{items: [{path: CARD, post_attempted: true}]}], CARD), true);
  assert.equal(consumedByReceipts([{items: [{path: CARD, status: 'blocked'}]}], CARD), false);
  assert.equal(consumedByReceipts([{items: [{path: 'other.json', post_attempted: true}]}], CARD), false);
});

test('20 分钟窗口内的未完成 run 视为已在途，避免两条工作流重复派发', () => {
  const now = Date.parse('2026-11-27T12:00:00Z');
  assert.equal(findInFlightRun([{id: 1, status: 'queued', created_at: '2026-11-27T11:55:00Z'}], {now}).id, 1);
  assert.equal(findInFlightRun([{id: 2, status: 'completed', created_at: '2026-11-27T11:55:00Z'}], {now}), null);
  assert.equal(findInFlightRun([{id: 3, status: 'queued', created_at: '2026-11-27T11:00:00Z'}], {now}), null);
});

test('按提交分组派发，已消费或已在途的卡不重复派发', () => {
  const cards = [
    {path: CARD, commit: COMMIT},
    {path: 'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261127-DAILY-1.json', commit: COMMIT},
    {path: 'ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261127-OPS-2.json', commit: OTHER},
  ];
  const plan = planDispatches({
    cards,
    receiptsByCard: {[CARD]: true},
    inFlightRun: null,
  });
  assert.deepEqual(plan.groups.map((group) => group.commit), [COMMIT, OTHER]);
  assert.deepEqual(plan.groups[0].cards, ['ops/deep-superagent/tasks/DEEP-SUPERAGENT-20261127-DAILY-1.json']);
  assert.equal(plan.cards.find((row) => row.card === CARD).status, 'already_consumed');
  const inFlight = planDispatches({cards, receiptsByCard: {}, inFlightRun: {id: 9}});
  assert.deepEqual(inFlight.groups, []);
  assert.equal(inFlight.cards[0].status, 'already_in_flight');
});

test('dispatch 使用 card_commit 输入并回读新 run', async () => {
  const calls = [];
  const fetcher = async (url, options = {}) => {
    calls.push({url, options});
    if (String(url).endsWith('/dispatches')) return {status: 204, ok: true};
    return {
      status: 200,
      ok: true,
      json: async () => ({workflow_runs: [{id: 777, status: 'queued', html_url: 'https://example/run/777', created_at: new Date().toISOString()}]}),
    };
  };
  const result = await dispatchCommit({
    fetcher,
    token: 'mock-token',
    repository: 'ltzyz2181-collab/ltzzz',
    commit: COMMIT,
    cards: [CARD],
    pollAttempts: 1,
    sleep: async () => {},
  });
  assert.equal(result.run_id, 777);
  assert.equal(result.status, 'queued');
  const post = calls.find((call) => String(call.url).endsWith('/dispatches'));
  assert.deepEqual(JSON.parse(post.options.body), {ref: 'main', inputs: {card_commit: COMMIT}});
  assert.equal(post.options.headers.authorization, 'Bearer mock-token');
  // 令牌只在认证头里；请求体与日志不得回显。
  assert.deepEqual(calls.map((call) => String(call.options.body ?? '')), [
    JSON.stringify({ref: 'main', inputs: {card_commit: COMMIT}}),
    '',
  ]);
  assert.doesNotMatch(JSON.stringify(calls.map((call) => call.options.body)), /mock-token/);
});

test('dispatchCards 对已消费的卡不发请求', async () => {
  let posts = 0;
  const fetcher = async (url) => {
    if (String(url).endsWith('/dispatches')) posts += 1;
    return {status: 200, ok: true, json: async () => ({workflow_runs: []})};
  };
  const result = await dispatchCards({
    cards: [{path: CARD, commit: COMMIT}],
    receipts: [{items: [{path: CARD, post_attempted: true}]}],
    fetcher,
    token: 't',
    repository: 'ltzyz2181-collab/ltzzz',
  });
  assert.equal(posts, 0);
  assert.equal(result.cards[0].status, 'already_consumed');
});

test('没有令牌时 dispatchCommit 失败关闭', async () => {
  await assert.rejects(() => dispatchCommit({token: '', repository: 'x', commit: COMMIT}), /dispatch_token_missing/);
});
