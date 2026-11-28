import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderTaskBody, reassignPlan, reassignTarget} from '../lib/task-hub.mjs';
import {cmdReassign} from '../task-hub.mjs';
import {
  DEFAULT_SEATS, REPO_ROOT, defaultSeatPlan, dispatchPlan, main, normalizePlan, seatTaskId,
} from '../dispatch-daily.mjs';

const NOW = '2026-11-28T12:00:00Z';
const DATE = '2026-11-28';

function hubIssue({number, seat = 'desktop-claude', createdAt = NOW, comments = [], labels = null, taskId = null}) {
  return {
    number,
    state: 'open',
    title: `[TASK][${seat}] ${taskId || `LTZZZ-SEAT-DAILY-20261128-${seat.toUpperCase()}`}`,
    html_url: `https://github.com/ltzyz2181-collab/ltzzz/issues/${number}`,
    created_at: createdAt,
    labels: (labels || ['dispatch', `seat:${seat}`]).map((name) => ({name})),
    body: renderTaskBody({task_id: taskId || `LTZZZ-SEAT-DAILY-20261128-${seat.toUpperCase()}`, decision_id: 'none', seat, goal: '每日开工', scope: '只读', forbidden: '不动资金', acceptance: 'poll', evidence: '- poll'}),
    comments,
  };
}

function fakeClient(initial = []) {
  const store = new Map(initial.map((issue) => [issue.number, {...issue}]));
  const calls = [];
  let nextNumber = 100;
  return {
    calls,
    async listOpenDispatches() {
      return [...store.values()].map(({comments, ...rest}) => rest);
    },
    async withComments(issue) {
      return {...issue, comments: store.get(issue.number)?.comments || []};
    },
    async api(route, options = {}) {
      calls.push([route, options.method || 'GET', options.body || null]);
      if (route === 'issues' && options.method === 'POST') {
        const created = {
          number: nextNumber++,
          html_url: `https://github.com/ltzyz2181-collab/ltzzz/issues/${nextNumber}`,
          ...options.body,
          labels: (options.body.labels || []).map((name) => ({name})),
          comments: [],
          state: 'open',
          created_at: NOW,
        };
        store.set(created.number, created);
        return {status: 201, data: created};
      }
      const match = route.match(/^issues\/(\d+)$/);
      if (match) return {status: 200, data: {...store.get(Number(match[1]))}};
      return {status: 200, data: {}};
    },
    async comment(number, body) {
      store.get(number).comments.push({body, created_at: NOW});
    },
    async addLabels(number, labels) {
      const target = store.get(number);
      target.labels = [...target.labels, ...labels.map((name) => ({name}))];
    },
    async removeLabel(number, label) {
      const target = store.get(number);
      target.labels = target.labels.filter((item) => item.name !== label);
    },
  };
}

test('默认每日计划给两个在册席位各生成一张带 seat 标签的卡', () => {
  const plan = defaultSeatPlan({date: DATE});
  assert.deepEqual(plan.cards.map((card) => card.seat), DEFAULT_SEATS);
  for (const card of plan.cards) {
    assert.ok(card.labels.includes('dispatch'));
    assert.ok(card.labels.includes(`seat:${card.seat}`));
    assert.equal(card.task_id, seatTaskId(card.seat, DATE));
    assert.match(card.body, /### Task ID/);
    assert.doesNotMatch(card.body, /待?\s*Owner\s*确认/);
  }
});

test('DRY_RUN=1 的 CLI 输出包含 seat 标签且不创建 Issue', () => {
  const run = spawnSync(process.execPath, ['scripts/dispatch-daily.mjs'], {
    cwd: REPO_ROOT,
    env: {...process.env, DRY_RUN: '1'},
    encoding: 'utf8',
  });
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  assert.equal(result.dry_run, true);
  assert.equal(result.created, 0);
  const labels = result.cards.flatMap((card) => card.labels);
  assert.ok(labels.includes('seat:desktop-claude'));
  assert.ok(labels.includes('seat:desktop-codex'));
  assert.doesNotMatch(run.stdout, /待?\s*Owner\s*确认/);
});

test('apply 只创建一次；重复运行按 task_id 判为已存在', async () => {
  const plan = defaultSeatPlan({date: DATE});
  const client = fakeClient();
  const first = await dispatchPlan({plan, client, apply: true});
  assert.equal(first.created, 2);
  assert.equal(first.cards.every((card) => card.status === 'created'), true);
  const posts = client.calls.filter(([route, method]) => route === 'issues' && method === 'POST');
  assert.equal(posts.length, 2);
  assert.deepEqual(posts[0][2].labels, ['dispatch', 'seat:desktop-claude']);

  const second = await dispatchPlan({plan, client, apply: true});
  assert.equal(second.created, 0);
  assert.equal(second.already_exists, 2);
  assert.equal(client.calls.filter(([route, method]) => route === 'issues' && method === 'POST').length, 2);
});

test('计划文件不能自带标签或冒充未登记席位', () => {
  const normalized = normalizePlan({date: DATE, cards: [{seat: 'desktop-codex', task_id: 'X-1', goal: 'g', scope: 's', forbidden: 'f', acceptance: 'a'}]});
  assert.deepEqual(normalized.cards[0].labels, ['dispatch', 'seat:desktop-codex']);
  assert.throws(() => normalizePlan({date: DATE, cards: [{seat: 'intruder', task_id: 'X-2'}]}), /dispatch_plan_unknown_seat/);
  assert.throws(() => normalizePlan({date: DATE, cards: []}), /dispatch_plan_empty/);
});

test('24h 边界：恰好 24h 进入改派，未满不改派；已认领不改派', () => {
  const exact = hubIssue({number: 1, seat: 'desktop-codex', createdAt: '2026-11-27T12:00:00Z'});
  const under = hubIssue({number: 2, seat: 'desktop-codex', createdAt: '2026-11-27T12:00:01Z'});
  const claimed = hubIssue({
    number: 3,
    seat: 'desktop-codex',
    createdAt: '2026-11-26T00:00:00Z',
    comments: [{body: '[claimed] seat=desktop-codex at=2026-11-27T00:00:00Z branch=fix/x', created_at: '2026-11-27T00:00:00Z'}],
  });
  const plan = reassignPlan([exact, under, claimed], {now: NOW});
  assert.deepEqual(plan.map((item) => item.number), [1]);
  assert.equal(plan[0].seat, 'desktop-codex');
  assert.equal(plan[0].to, 'desktop-claude');
  assert.equal(reassignTarget('desktop-codex'), 'desktop-claude');
});

test('改派同时发出 mail:send 叫醒卡，不只改标签', async () => {
  const card = hubIssue({number: 9, seat: 'desktop-codex', createdAt: '2026-11-26T00:00:00Z'});
  const client = fakeClient([card]);
  const result = await cmdReassign({client, apply: true, now: NOW});
  assert.equal(result.reassigned, 1);
  assert.equal(result.notices.length, 1);
  const created = client.calls.filter(([route, method]) => route === 'issues' && method === 'POST');
  assert.equal(created.length, 1);
  assert.deepEqual(created[0][2].labels, ['mail:send']);
  assert.match(created[0][2].title, /派单改派 #9/);
  assert.match(created[0][2].body, /已改派给 desktop-claude/);
  assert.match(created[0][2].body, /dedupe_key: task-hub-reassign-9-desktop-claude/, '叫醒卡必须可去重');
  assert.match(created[0][2].body, /^to: \S+/m, '叫醒卡必须带收件人（注册表路由或 owner 兜底）');
  const updated = await client.withComments((await client.api('issues/9')).data);
  assert.ok(updated.comments.some((comment) => comment.body.startsWith('[reassigned] from=desktop-codex to=desktop-claude')));
  assert.ok(updated.labels.some((label) => label.name === 'seat:desktop-claude'));
  assert.ok(!updated.labels.some((label) => label.name === 'seat:desktop-codex'));
});

test('main() 在 apply 缺少 token 时拒绝创建卡片', async () => {
  const code = await main(['--apply', '--date', DATE], {env: {DRY_RUN: '1'}, root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')});
  assert.equal(code, 0, 'DRY_RUN=1 覆盖 --apply，保持只读');
  const blocked = await main(['--apply', '--date', DATE], {env: {}, root: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')});
  assert.equal(blocked, 2);
});
