// 每日邮件摄入流水线的单元测试：合并、去重、裁决继承、运行锁、幂等记账、失败/超时。
// 对应工单 §一.3/§一.4：重复触发、网络失败、超时、部分失败都必须有自动化覆盖，
// 且任何失败都不得被写成成功。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  INTAKE_SCHEMA,
  acquireRunLock,
  appendRunLog,
  attachTrackerRulings,
  buildIntake,
  exitCodeFor,
  loadGmailEnv,
  releaseRunLock,
  resolvePaths,
  sha256,
} from '../run-mail-intake.mjs';
import {TRACKER_SCHEMA} from '../track-gpt-rulings.mjs';

const T1 = 'LTZZZ-GMAIL-INTAKE-HYGIENE-20261117-02';

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-intake-'));
}

function trackerDoc(items = []) {
  return {schema: TRACKER_SCHEMA, status: 'ok', generated_at_utc: '2026-11-17T00:00:00Z', counts: {}, items};
}

function backlog(overrides = {}) {
  return {
    status: 'ok',
    count: 1,
    open_count: 1,
    items: [{
      ref: 'agent-ref-1',
      thread_id: 'thread-1',
      status: 'open',
      read: false,
      created_at: '2026-11-17T01:00:00Z',
      age_days: 0,
      subject_public: `Re: ${T1}`,
      has_dispatch_wording: true,
    }],
    ...overrides,
  };
}

function fullbox(overrides = {}) {
  return {
    status: 'ok',
    count: 1,
    open_count: 1,
    messages: [{
      ref: 'gmail-ref-1',
      thread_id: 'thread-1',
      status: 'open',
      unread: true,
      date: '2026-11-17T02:00:00Z',
      subject_short: `Re: ${T1}`,
      has_dispatch_wording: false,
    }],
    ...overrides,
  };
}

const NOW = new Date('2026-11-17T03:00:00Z');
const OK_RUN = {code: 0};

test('两条通道 + 裁决跟踪都正常时 status=ok，并带上三层去重结果', () => {
  const payload = buildIntake({
    backlog: backlog(),
    fullbox: fullbox(),
    tracker: trackerDoc(),
    backlogRun: OK_RUN,
    gmailRun: OK_RUN,
    trackerRun: OK_RUN,
    now: NOW,
  });
  assert.equal(payload.schema, INTAKE_SCHEMA);
  assert.equal(payload.status, 'ok');
  assert.equal(payload.read_only, true);
  assert.equal(payload.bodies_persisted, false);
  assert.equal(payload.contains_mail_body, false);
  assert.deepEqual(payload.dedupe.layers, ['message_id', 'thread_id', 'task_id']);
  assert.equal(payload.dedupe.history_preserved, true);
  assert.equal(payload.counts.unified, 2);
  // 两条通道同 thread_id/同 Task ID：必须合并成一条，但两份历史都留着。
  assert.equal(payload.dedupe.clusters, 1);
  assert.equal(payload.dedupe.duplicates, 1);
  assert.equal(payload.open_items.length, 1);
  assert.ok(payload.open_items[0].task_ids.includes(T1));
  assert.equal(payload.open_items[0].history.length, 2);
});

test('QQ 通道：未配置不拖成 partial，配置后按 qq_shared 入去重，失败计入 partial', () => {
  const skipped = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    qqFullbox: {status: 'not_configured', messages: [], count: 0},
    backlogRun: OK_RUN, gmailRun: OK_RUN, qqRun: {code: 'blocked_missing_credentials', skipped: true},
    trackerRun: OK_RUN, now: NOW,
  });
  assert.equal(skipped.status, 'ok');
  assert.equal(skipped.qq_fullbox.status, 'not_configured');
  assert.equal(skipped.qq_fullbox.skipped, true);
  assert.equal(skipped.counts.unified, 2, '未配置时不得虚增 QQ 条目');

  const live = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    qqFullbox: {
      status: 'ok', count: 1, open_count: 1, provider: 'qq_imap',
      messages: [{
        ref: 'qq-ref-9', thread_id: 'thread-qq', status: 'open', unread: false,
        date: '2026-11-17T02:30:00Z', subject_short: 'QQ 项目同步',
      }],
    },
    backlogRun: OK_RUN, gmailRun: OK_RUN, qqRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  assert.equal(live.status, 'ok');
  assert.equal(live.qq_fullbox.status, 'ok');
  assert.equal(live.qq_fullbox.count, 1);
  assert.equal(live.qq_fullbox.provider, 'qq_imap');
  assert.equal(live.sources.qq_fullbox, 'knowledge/results/deep-superagent/mail-fullbox-qq/latest.json');
  assert.ok(live.open_items.some((item) => item.channel === 'qq_shared'));

  const failed = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    qqFullbox: {status: 'creds_missing', messages: [], count: 0},
    backlogRun: OK_RUN, gmailRun: OK_RUN, qqRun: {code: 3}, trackerRun: OK_RUN, now: NOW,
  });
  assert.equal(failed.status, 'partial');
  assert.equal(failed.qq_fullbox.status, 'creds_missing');
});

test('Gmail/QQ 条目按日期补算 age_days，缺日期保持 null', () => {
  const payload = buildIntake({
    backlog: {status: 'ok', items: [], count: 0},
    fullbox: {status: 'ok', count: 1, messages: [{
      ref: 'g1', thread_id: 't1', status: 'open', unread: false,
      date: '2026-11-14T03:00:00Z', subject_short: '三天前',
    }]},
    qqFullbox: {status: 'ok', count: 1, messages: [{
      ref: 'q1', thread_id: 't2', status: 'open', unread: false, subject_short: '没有日期',
    }]},
    tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, qqRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  assert.equal(payload.open_items.find((item) => item.ref === 'g1').age_days, 3);
  assert.equal(payload.open_items.find((item) => item.ref === 'q1').age_days, null);
});

test('待办 200 条上限按时间倒序：QQ 新邮件不会被 Gmail 挤掉', () => {
  const gmailMessages = Array.from({length: 260}, (_, i) => ({
    ref: `g-${i}`, thread_id: `gt-${i}`, status: 'open', unread: true,
    date: `2026-11-0${1 + (i % 9)}T00:00:00Z`, subject_short: `gmail ${i}`,
  }));
  const qqMessages = Array.from({length: 5}, (_, i) => ({
    ref: `q-${i}`, thread_id: `qt-${i}`, status: 'open', unread: true,
    date: `2026-11-19T0${i}:00:00Z`, subject_short: `qq ${i}`,
  }));
  const payload = buildIntake({
    backlog: {status: 'ok', items: [], count: 0},
    fullbox: {status: 'ok', messages: gmailMessages, count: 260},
    qqFullbox: {status: 'ok', messages: qqMessages, count: 5},
    tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, qqRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  assert.equal(payload.open_items.length, 200);
  assert.equal(payload.open_items.filter((item) => item.channel === 'qq_shared').length, 5);
});

test('重复触发：同输入 run_key 稳定，previous 相同则 replay=true', () => {
  const first = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  const second = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, trackerRun: OK_RUN, now: new Date('2026-11-17T09:00:00Z'),
    previous: first,
  });
  assert.equal(second.run.run_key, first.run.run_key, '同日同输入必须得到同一 run_key');
  assert.equal(second.run.replay, true);
  assert.equal(second.run.previous_run_key, first.run.run_key);
});

test('输入变化则 run_key 变化，不会被误判为 replay', () => {
  const first = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  const changed = buildIntake({
    backlog: backlog({count: 2}), fullbox: fullbox(), tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, trackerRun: OK_RUN, now: NOW, previous: first,
  });
  assert.notEqual(changed.run.run_key, first.run.run_key);
  assert.equal(changed.run.replay, false);
});

test('网络失败：Gmail 采集非零退出时 status=partial 且记录真实错误', () => {
  const payload = buildIntake({
    backlog: backlog(), fullbox: {status: 'failed', messages: []}, tracker: trackerDoc(),
    backlogRun: OK_RUN,
    gmailRun: {code: 2, stderr: 'ConnectionResetError: connection reset by peer'},
    trackerRun: OK_RUN,
    now: NOW,
  });
  assert.equal(payload.status, 'partial');
  assert.equal(payload.gmail_fullbox.run_code, 2);
  assert.match(payload.gmail_fullbox.stderr_tail, /connection reset/i);
});

test('超时：ETIMEDOUT 必须显式标记，不能当成功', () => {
  const payload = buildIntake({
    backlog: backlog(), fullbox: {status: 'ok', messages: []}, tracker: trackerDoc(),
    backlogRun: OK_RUN,
    gmailRun: {code: null, timeout: true, error: {code: 'ETIMEDOUT', message: 'spawnSync python3 ETIMEDOUT'}},
    trackerRun: OK_RUN,
    now: NOW,
  });
  assert.equal(payload.gmail_fullbox.timeout, true);
  assert.equal(payload.gmail_fullbox.error.code, 'ETIMEDOUT');
  assert.notEqual(payload.status, 'ok');
});

test('部分失败：裁决跟踪读不到时状态是 unknown 而不是 0 条', () => {
  const payload = buildIntake({
    backlog: backlog(), fullbox: fullbox(),
    tracker: {schema: TRACKER_SCHEMA, status: 'unknown', counts: null, items: []},
    backlogRun: OK_RUN, gmailRun: OK_RUN,
    trackerRun: {code: 2, stderr: 'mailbox unreadable'},
    now: NOW,
  });
  assert.equal(payload.ruling_tracker.status, 'unknown');
  assert.equal(payload.ruling_tracker.counts, null);
  assert.equal(payload.status, 'partial');
});

test('全部通道失败时 status=failed，且不写 ok', () => {
  const payload = buildIntake({
    backlog: {status: 'missing', items: []},
    fullbox: {status: 'missing', messages: []},
    tracker: null,
    backlogRun: {code: 1},
    gmailRun: {code: 2},
    trackerRun: {code: 2},
    now: NOW,
  });
  assert.equal(payload.status, 'failed');
});

test('裁决继承：同线程多封回复全部挂到邮件项上，冲突时要求复核', () => {
  const items = [{
    channel: 'gmail_fullbox',
    ref: 'gmail-ref-1',
    message_id: 'gmail-ref-1',
    thread_id: 'thread-1',
    task_ids: [T1],
    status: 'open',
    unread: true,
    subject_short: `Re: ${T1}`,
    rulings: [],
  }];
  const tracker = trackerDoc([
    {
      thread_key: `subject:${T1.toLowerCase()}`,
      thread: 'subject:x',
      task_ids: [T1],
      rulings: [
        {message_id: 'r1@x', at: '2026-11-16T10:00:00Z', decision_id: 'GPT-A-20261116-01', decision_ids: ['GPT-A-20261116-01']},
        {message_id: 'r2@x', at: '2026-11-16T11:00:00Z', decision_id: 'GPT-B-20261116-02', decision_ids: ['GPT-B-20261116-02']},
      ],
    },
  ]);
  const attached = attachTrackerRulings(items, tracker);
  assert.equal(attached[0].rulings.length, 2, '历史裁决不得被后一封覆盖');
  const payload = buildIntake({
    backlog: {status: 'ok', items: []}, fullbox: {status: 'ok', messages: items.map((item) => ({
      ref: item.ref, thread_id: item.thread_id, status: 'open', unread: true,
      date: '2026-11-17T02:00:00Z', subject_short: item.subject_short,
    }))},
    tracker, backlogRun: OK_RUN, gmailRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  assert.equal(payload.open_items[0].ruling_status, 'conflict');
  assert.equal(payload.open_items[0].rulings.length, 2);
  assert.equal(payload.dedupe.conflicts.length, 1);
  assert.equal(payload.dedupe.conflicts[0].requires_review, true);
});

test('运行锁：并发第二次触发被拒绝，不覆盖产物', () => {
  const dir = tmpDir();
  const lock = path.join(dir, '.run-lock');
  const first = acquireRunLock(lock, {token: 'aaa', now: () => 1000, pid: 111});
  assert.equal(first.acquired, true);
  const second = acquireRunLock(lock, {token: 'bbb', now: () => 2000, pid: 222});
  assert.equal(second.acquired, false);
  assert.equal(second.reason, 'locked');
  assert.equal(second.holder.pid, 111);
});

test('运行锁：过期锁可回收，未过期不可抢占', () => {
  const dir = tmpDir();
  const lock = path.join(dir, '.run-lock');
  acquireRunLock(lock, {token: 'old', now: () => 0, pid: 1, staleMs: 1000});
  const tooEarly = acquireRunLock(lock, {token: 'new', now: () => 500, pid: 2, staleMs: 1000});
  assert.equal(tooEarly.acquired, false);
  const reclaimed = acquireRunLock(lock, {token: 'new2', now: () => 5000, pid: 2, staleMs: 1000});
  assert.equal(reclaimed.acquired, true);
  assert.equal(reclaimed.reclaimed, true);
  assert.equal(releaseRunLock(lock, 'wrong-token'), false, '别人的 token 不得释放锁');
  assert.equal(releaseRunLock(lock, 'new2'), true);
});

test('运行锁：锁文件损坏按未获取处理，不猜', () => {
  const dir = tmpDir();
  const lock = path.join(dir, '.run-lock');
  fs.writeFileSync(lock, 'not json');
  const result = acquireRunLock(lock, {token: 'x', now: () => 0});
  assert.equal(result.acquired, false);
  assert.equal(result.reason, 'lock_unreadable');
});

test('记账幂等：同 run_key 只记一条，不同 run_key 用 prev_sha256 串链', () => {
  const dir = tmpDir();
  const runs = path.join(dir, 'runs.jsonl');
  const a = appendRunLog(runs, {run_id: 'r1', run_key: 'k1', status: 'ok'});
  assert.equal(a.duplicate, false);
  const dup = appendRunLog(runs, {run_id: 'r2', run_key: 'k1', status: 'ok'});
  assert.equal(dup.duplicate, true);
  const b = appendRunLog(runs, {run_id: 'r3', run_key: 'k2', status: 'partial'});
  assert.equal(b.duplicate, false);
  assert.equal(b.count, 2);
  const lines = fs.readFileSync(runs, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].entry_sha256, a.entry_sha256);
  assert.equal(lines[1].prev_sha256, a.entry_sha256);
  assert.equal(lines[1].entry_sha256, b.entry_sha256);
});

test('凭据加载：从 600 文件读但不覆盖已有环境变量，缺失文件给原因', () => {
  const dir = tmpDir();
  const envFile = path.join(dir, 'gmail.env');
  fs.writeFileSync(envFile, 'GMAIL_IMAP_USER=ltzyz2181@gmail.com\nGMAIL_IMAP_APP_PASSWORD=secret-value\n');
  const env = {};
  const loaded = loadGmailEnv(env, envFile);
  assert.equal(loaded.loaded, true);
  assert.equal(loaded.keys, 2);
  assert.equal(env.GMAIL_IMAP_APP_PASSWORD, 'secret-value');
  const existing = {GMAIL_IMAP_APP_PASSWORD: 'from-process'};
  const second = loadGmailEnv(existing, envFile);
  // 新语义：已存在的键不覆盖，但缺失的键仍然补齐（QQ 通道与 Gmail 共用这份文件）。
  assert.equal(second.loaded, true);
  assert.equal(second.keys, 1);
  assert.equal(existing.GMAIL_IMAP_APP_PASSWORD, 'from-process');
  assert.equal(existing.GMAIL_IMAP_USER, 'ltzyz2181@gmail.com');
  const third = loadGmailEnv({...existing}, envFile);
  assert.equal(third.reason, 'already_in_env');
  const missing = loadGmailEnv({}, path.join(dir, 'nope.env'));
  assert.equal(missing.loaded, false);
  assert.equal(missing.reason, 'file_missing');
});

test('产物不含正文或凭据字段', () => {
  const payload = buildIntake({
    backlog: backlog(), fullbox: fullbox(), tracker: trackerDoc(),
    backlogRun: OK_RUN, gmailRun: OK_RUN, trackerRun: OK_RUN, now: NOW,
  });
  const text = JSON.stringify(payload).toLowerCase();
  for (const forbidden of ['app_password', 'client_secret', 'refresh_token', 'authorization', 'body_text']) {
    assert.ok(!text.includes(forbidden), `产物不得包含：${forbidden}`);
  }
  assert.equal(payload.contains_mail_body, false);
});

test('resolvePaths 支持从任意根目录推导，不写死云主机路径', () => {
  const paths = resolvePaths('/tmp/ltzzz-root');
  assert.equal(paths.root, '/tmp/ltzzz-root');
  assert.equal(paths.out, path.join('/tmp/ltzzz-root', 'knowledge/results/deep-superagent/mail-intake/latest.json'));
  assert.equal(paths.runs, path.join('/tmp/ltzzz-root', 'knowledge/results/deep-superagent/mail-intake/runs.jsonl'));
});

test('sha256 对同一结构稳定、对字段顺序不敏感', () => {
  assert.equal(sha256({a: 1, b: 2}), sha256({b: 2, a: 1}));
  assert.notEqual(sha256({a: 1}), sha256({a: 2}));
});

test('退出码区分 ok/partial/failed，partial 不得当成功', () => {
  assert.equal(exitCodeFor('ok'), 0);
  assert.equal(exitCodeFor('partial'), 2);
  assert.equal(exitCodeFor('failed'), 3);
  assert.notEqual(exitCodeFor('partial'), 0, '部分失败必须有非零退出码');
  assert.notEqual(exitCodeFor('failed'), exitCodeFor('partial'), '两种失败必须可区分');
});
