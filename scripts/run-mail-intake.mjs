#!/usr/bin/env node
// 每日邮件摄入总入口：一次跑完两条收信通道 + 裁决跟踪，合并成一份可核验结果。
//   1) Agent Mail（agently-cli，qingqizhu6502@agent.qq.com 收件箱）
//   2) Gmail 全箱（ltzyz2181@gmail.com，IMAP 应用专用密码，见 docs/MAIL-CHANNEL-CURRENT.md 第 6 节）
//   3) GPT 裁决回执跟踪（track-gpt-rulings.mjs，Phase 2 起纳入每日流程）
// 只落脱敏状态与短标题；正文永不落盘。任一通道失败都不伪装成功：分别记状态，
// 合并结果的 status 取 ok / partial / failed。
//
// Phase 2 变更：
// - message_id / thread_id / 原始 Task ID 三层去重（scripts/mail/dedupe.mjs）；
// - 历史裁决继承：同一线程多封回复全部保留，冲突裁决 fail-closed；
// - 单次运行锁 + 幂等 run_key + 追加式 runs.jsonl，重复触发不重复记账；
// - 网络失败/超时按真实退出码与 error.code 记录，不猜。

import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash, randomBytes} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {dedupeMessages, extractTaskIds, normalizeThreadId, normalizeThreadKey} from './mail/dedupe.mjs';
import {TRACKER_SCHEMA, extractDecisionIds, redactSubject} from './track-gpt-rulings.mjs';

// Gmail 里的 GPT 裁决回信只按主题元数据识别，不读正文；这条通道独立于
// Agent Mail（CI 内 agently-cli 不可用时，Gmail 仍能报“今天有没有裁决回信”）。
const GMAIL_RULING_RE = /(裁决|ruling|disposition|keep_blocked|return_for_revision|needs_decision|approve_in_scope|conditional_approve|已落库)/i;

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const INTAKE_SCHEMA = 'ltzzz.mail-intake.v1';
export const RUN_LOCK_STALE_MS = 30 * 60 * 1000;

export function resolvePaths(root = process.env.LTZZZ_ROOT || REPO_ROOT) {
  const base = path.join(root, 'knowledge/results/deep-superagent');
  return {
    root,
    outDir: path.join(base, 'mail-intake'),
    out: path.join(base, 'mail-intake/latest.json'),
    backlog: path.join(base, 'mail-backlog/latest.json'),
    fullbox: path.join(base, 'mail-fullbox/latest.json'),
    bodyQueue: path.join(base, 'mail-fullbox/body-queue.json'),
    tracker: path.join(base, 'ruling-tracker/latest.json'),
    repoSignals: path.join(base, 'repo-signals/latest.json'),
    runs: path.join(base, 'mail-intake/runs.jsonl'),
    lock: path.join(base, 'mail-intake/.run-lock'),
    envFile: process.env.GMAIL_IMAP_ENV_FILE || path.join(process.env.HOME || '', '.config/ltzzz/gmail-imap.env'),
  };
}

// 凭据只从仓库外的 600 权限文件读，缺失就交给脚本自己 fail-closed。
export function loadGmailEnv(env = process.env, envFile = resolvePaths().envFile) {
  if (env.GMAIL_IMAP_APP_PASSWORD) return {loaded: false, reason: 'already_in_env'};
  let raw;
  try {
    raw = fs.readFileSync(envFile, 'utf8');
  } catch {
    return {loaded: false, reason: 'file_missing'};
  }
  let count = 0;
  for (const line of raw.split('\n')) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (match && !env[match[1]]) {
      env[match[1]] = match[2];
      count += 1;
    }
  }
  return {loaded: count > 0, keys: count};
}

export function runCommand(cmd, args, {cwd = REPO_ROOT, timeoutMs = 15 * 60 * 1000, env = process.env} = {}) {
  const result = spawnSync(cmd, args, {
    cwd,
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {...env, PATH: (env.PATH || '') + ':' + (env.HOME || '') + '/.npm-global/bin'},
  });
  return {
    code: result.status,
    stdout: String(result.stdout || '').trim().slice(0, 600),
    stderr: String(result.stderr || '').trim().slice(0, 600),
    error: result.error ? {code: result.error.code || null, message: String(result.error.message).slice(0, 200)} : null,
    timeout: result.error?.code === 'ETIMEDOUT' || result.signal === 'SIGTERM',
    signal: result.signal || null,
  };
}

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function canonical(value) {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object') {
    return '{' + Object.keys(value).sort().map((key) => JSON.stringify(key) + ':' + canonical(value[key])).join(',') + '}';
  }
  return JSON.stringify(value);
}

// 退出码必须能区分三态，不能把 partial 当成功。
export function exitCodeFor(status) {
  if (status === 'failed') return 3;
  if (status === 'partial') return 2;
  return 0;
}

export function sha256(value) {
  return createHash('sha256').update(typeof value === 'string' ? value : canonical(value)).digest('hex');
}

export function mapBacklogItems(backlog) {
  return (backlog?.items || []).map((item) => ({
    channel: 'agent_mail',
    ref: item.ref,
    // 旧 backlog 只写 ref；新 backlog 同时写原始 message_id。没有原始 ID 时退回 ref，
    // 但要在 sources 里能看出这是哈希兜底，而不是真实 Message-ID。
    message_id: item.message_id || item.ref,
    thread_id: item.thread_id || null,
    task_ids: item.task_ids || extractTaskIds(item.subject_public),
    status: item.status,
    read: item.read === true,
    unread: item.read === false,
    at: item.created_at || null,
    age_days: item.age_days ?? null,
    subject_short: item.subject_public || '',
    has_dispatch_wording: Boolean(item.has_dispatch_wording),
    ruling: item.ruling || null,
    rulings: item.rulings || [],
  }));
}

export function mapFullboxMessages(fullbox) {
  return (fullbox?.messages || []).map((message) => ({
    channel: 'gmail_fullbox',
    ref: message.ref,
    message_id: message.ref,
    thread_id: message.thread_id || null,
    task_ids: message.task_ids || extractTaskIds(message.subject_short),
    status: message.status,
    read: message.unread === false,
    unread: message.unread === true,
    at: message.date || null,
    age_days: null,
    subject_short: message.subject_short || '',
    has_dispatch_wording: Boolean(message.has_dispatch_wording),
    ruling: message.ruling || null,
    rulings: message.rulings || [],
  }));
}

// 仓库信号快照 → 待办项。只映射公开元数据，不搬运评论正文。
export function mapRepoSignals(repoSignals) {
  if (repoSignals?.schema !== 'ltzzz.deep-superagent.repo-signals.v1' || repoSignals?.status !== 'ok') return [];
  const items = [];
  for (const issue of repoSignals.issues?.open || []) {
    const title = redactSubject(issue.title_short || issue.title || '', 72);
    items.push({
      channel: 'github_repo',
      ref: `issue:${issue.number}`,
      message_id: null,
      thread_id: `issue:${issue.number}`,
      task_ids: issue.task_ids || extractTaskIds(issue.title_short || issue.title),
      status: 'open',
      read: true,
      unread: false,
      at: issue.updated_at || null,
      age_days: issue.age_days ?? null,
      subject_short: title,
      has_dispatch_wording: (issue.labels || []).some((label) => /dispatch|blocked|owner|todo/i.test(String(label))),
      ruling: null,
      rulings: [],
    });
  }
  for (const pull of repoSignals.pulls?.open || []) {
    items.push({
      channel: 'github_pr',
      ref: `pr:${pull.number}`,
      message_id: null,
      thread_id: `pr:${pull.number}`,
      task_ids: pull.task_ids || extractTaskIds(pull.title_short || pull.title),
      status: 'open',
      read: true,
      unread: false,
      at: pull.updated_at || null,
      age_days: pull.age_days ?? null,
      subject_short: `PR #${pull.number}: ${redactSubject(pull.title_short || pull.title || '', 62)}`,
      has_dispatch_wording: true,
      ruling: null,
      rulings: [],
    });
  }
  for (const run of repoSignals.actions?.failed || []) {
    items.push({
      channel: 'github_actions',
      ref: `run:${run.id}`,
      message_id: null,
      thread_id: `run:${run.id}`,
      task_ids: extractTaskIds(run.name, run.head_sha),
      status: 'open',
      read: true,
      unread: false,
      at: run.created_at || null,
      age_days: null,
      subject_short: `failed: ${redactSubject(run.name || 'workflow', 60)}`,
      has_dispatch_wording: true,
      ruling: null,
      rulings: [],
    });
  }
  for (const receipt of repoSignals.deploy_receipts?.unresolved || []) {
    items.push({
      channel: 'deploy_receipt',
      ref: `receipt:${receipt.receipt_id || receipt.path}`,
      message_id: null,
      thread_id: receipt.task_id ? `task:${receipt.task_id}` : null,
      task_ids: receipt.task_ids || extractTaskIds(receipt.task_id),
      status: 'open',
      read: true,
      unread: false,
      at: receipt.at || null,
      age_days: null,
      subject_short: `deploy receipt: ${redactSubject(receipt.status || 'unknown', 56)}`,
      has_dispatch_wording: true,
      ruling: null,
      rulings: [],
    });
  }
  return items;
}

function trackerBuckets(tracker) {
  const buckets = {bySubject: new Map(), byTask: new Map(), byThread: new Map()};
  const push = (map, key, item) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  };
  for (const item of tracker?.items || []) {
    const threadKey = String(item.thread_key || item.thread || '');
    if (threadKey.startsWith('subject:')) push(buckets.bySubject, threadKey.slice(8), item);
    else if (threadKey.startsWith('task:')) push(buckets.byTask, threadKey.slice(5).toUpperCase(), item);
    else if (threadKey.startsWith('thread:')) push(buckets.byThread, threadKey.slice(7), item);
    for (const taskId of item.task_ids || []) push(buckets.byTask, String(taskId).toUpperCase(), item);
  }
  return buckets;
}

// 历史裁决继承：把 tracker 里同一线程/同一 Task ID 的全部回复挂到邮件项上。
export function attachTrackerRulings(items, tracker) {
  const {bySubject, byTask, byThread} = trackerBuckets(tracker);
  return items.map((item) => {
    const normalizedThread = normalizeThreadId(item.thread_id);
    const matches = [
      ...(bySubject.get(normalizeThreadKey(item.subject_short)) || []),
      ...(normalizedThread ? byThread.get(normalizedThread) || [] : []),
      ...item.task_ids.flatMap((id) => byTask.get(String(id).toUpperCase()) || []),
    ];
    if (!matches.length) return item;
    const rulings = [];
    const seen = new Set();
    for (const match of matches) {
      for (const ruling of match.rulings || []) {
        const key = `${ruling.message_id || ''}|${ruling.decision_id || ''}|${ruling.at || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        rulings.push({
          message_id: ruling.message_id || null,
          at: ruling.at || null,
          decision_id: ruling.decision_id || (ruling.decision_ids?.length === 1 ? ruling.decision_ids[0] : null),
          decision_ids: ruling.decision_ids || [],
          consumed: ruling.consumed === true,
          consumed_at: ruling.consumed_at || null,
        });
      }
    }
    rulings.sort((a, b) => String(a.at || '').localeCompare(String(b.at || '')));
    return {...item, rulings};
  });
}

export function acquireRunLock(lockPath, {now = Date.now, token = randomBytes(8).toString('hex'), staleMs = RUN_LOCK_STALE_MS, pid = process.pid} = {}) {
  fs.mkdirSync(path.dirname(lockPath), {recursive: true});
  const payload = JSON.stringify({pid, token, at: now()}) + '\n';
  const create = () => {
    try {
      fs.writeFileSync(lockPath, payload, {flag: 'wx'});
      return {acquired: true, token};
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      return null;
    }
  };
  const first = create();
  if (first) return first;

  const readLock = () => {
    try {
      return JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    } catch {
      return null;
    }
  };
  const observed = readLock();
  if (!observed) return {acquired: false, reason: 'lock_unreadable'};
  if (now() - Number(observed.at || 0) < staleMs) return {acquired: false, reason: 'locked', holder: {pid: observed.pid, at: observed.at}};

  // 回收前重新读取：token 变了说明别人已经接手，绝不按旧观察删除新锁。
  const current = readLock();
  if (!current || current.token !== observed.token) return {acquired: false, reason: 'lock_replaced'};
  try {
    fs.unlinkSync(lockPath);
  } catch {
    return {acquired: false, reason: 'lock_unlink_failed'};
  }
  const retry = create();
  return retry ? {...retry, reclaimed: true} : {acquired: false, reason: 'race_lost'};
}

export function releaseRunLock(lockPath, token) {
  try {
    const current = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
    if (current.token !== token) return false;
    fs.unlinkSync(lockPath);
    return true;
  } catch {
    return false;
  }
}

export function appendRunLog(runsPath, entry) {
  fs.mkdirSync(path.dirname(runsPath), {recursive: true});
  const lines = fs.existsSync(runsPath)
    ? fs.readFileSync(runsPath, 'utf8').split('\n').filter((line) => line.trim())
    : [];
  for (const line of lines) {
    try {
      if (JSON.parse(line).run_key === entry.run_key) return {duplicate: true, count: lines.length};
    } catch {
      /* 坏行保留，不静默删除 */
    }
  }
  const prev = lines.length ? readJsonLine(lines[lines.length - 1])?.entry_sha256 || null : null;
  const record = {...entry, prev_sha256: prev};
  record.entry_sha256 = sha256(record);
  fs.appendFileSync(runsPath, JSON.stringify(record) + '\n');
  return {duplicate: false, count: lines.length + 1, entry_sha256: record.entry_sha256};
}

function readJsonLine(line) {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function channelState(run, expectedStatus) {
  const ok = run?.code === 0 && expectedStatus === 'ok';
  return {
    ok,
    run_code: run?.code ?? null,
    timeout: Boolean(run?.timeout),
    error: run?.error || null,
    stderr_tail: run?.stderr ? String(run.stderr).slice(0, 200) : null,
  };
}

/**
 * 纯函数：把三条通道的结果合并成日摄入产物。输入不被修改。
 */
export function buildIntake({
  backlog = {status: 'missing', items: []},
  fullbox = {status: 'missing', messages: []},
  tracker = null,
  repoSignals = null,
  sourceMeta = {},
  backlogRun = {code: null},
  gmailRun = {code: null},
  trackerRun = {code: null},
  now = new Date(),
  previous = null,
  runId = randomBytes(6).toString('hex'),
} = {}) {
  const backlogStatus = backlog?.status ?? (Array.isArray(backlog?.items) ? 'ok' : 'missing');
  const agent = channelState(backlogRun, backlogStatus);
  const gmail = channelState(gmailRun, fullbox?.status ?? 'missing');
  const bodyQueue = fullbox?.body_queue || null;
  const bodyQueueOk = !bodyQueue || ['ok', 'disabled', 'skipped'].includes(bodyQueue.status);
  const trackerBlocked = tracker?.status === 'blocked';
  const trackerOk = trackerRun?.code === 0
    && tracker?.schema === TRACKER_SCHEMA
    && !['unknown', 'blocked'].includes(tracker?.status);
  const trackerStatus = trackerOk
    ? 'ok'
    : trackerBlocked
      ? 'blocked'
      : (!tracker || tracker.status === 'unknown' ? 'unknown' : 'stale');
  const repoProvided = repoSignals !== null && repoSignals !== undefined;
  const repoOk = !repoProvided || repoSignals?.status === 'ok';

  const unified = attachTrackerRulings([
    ...mapBacklogItems(backlog),
    ...mapFullboxMessages(fullbox),
    ...mapRepoSignals(repoSignals),
  ], tracker);

  const dedupe = dedupeMessages(unified);
  const openClusters = dedupe.items.filter((item) => (
    item.status === 'open'
    || item.status === 'unknown'
    || item.has_dispatch_wording
    || item.unread
    || item.ruling_status === 'conflict'
  ));

  // 幂等键覆盖真实输入：状态、条数与条目本身，任何一项变化都算新一天的新输入。
  const inputSha256 = sha256({
    backlog: {
      status: backlog?.status ?? null,
      count: backlog?.count ?? 0,
      items: backlog?.items || [],
    },
    fullbox: {
      status: fullbox?.status ?? null,
      count: fullbox?.count ?? 0,
      messages: fullbox?.messages || [],
      body_queue: bodyQueue,
    },
    tracker: tracker
      ? {generated_at: tracker.generated_at_utc, counts: tracker.counts, items: tracker.items || []}
      : 'missing',
    repo_signals: repoProvided
      ? {
        status: repoSignals?.status ?? null,
        generated_at_utc: repoSignals?.generated_at_utc ?? null,
        issues: repoSignals?.issues ?? null,
        pulls: repoSignals?.pulls ?? null,
        actions: repoSignals?.actions ?? null,
        comments: repoSignals?.comments ?? null,
        deploy_receipts: repoSignals?.deploy_receipts ?? null,
      }
      : 'missing',
  });
  const day = now.toISOString().slice(0, 10);
  const runKey = `${day}:${inputSha256.slice(0, 16)}`;

  const gmailOk = gmail.ok && bodyQueueOk;
  const backlogOk = agent.ok;
  // ok 必须四路全绿；只要有任一通道仍产出了可用数据（例如 Gmail 元数据读到了、
  // 只是正文队列写盘失败），就记 partial 而不是 failed。failed 只留给全部通道不可用。
  const status = gmailOk && backlogOk && trackerOk && repoOk
    ? 'ok'
    : (gmail.ok || backlogOk || trackerOk || (repoProvided && repoOk) ? 'partial' : 'failed');

  const shanghaiDay = (value) => {
    const parsed = Date.parse(value || '');
    return Number.isFinite(parsed)
      ? new Date(parsed).toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'})
      : null;
  };
  const today = now.toLocaleDateString('sv-SE', {timeZone: 'Asia/Shanghai'});
  const gmailRulingMessages = (fullbox?.messages || [])
    .filter((message) => message.from_domain === 'gmail.com' && GMAIL_RULING_RE.test(String(message.subject_short || '')))
    .sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  const gmailRulingsToday = gmailRulingMessages.filter((message) => shanghaiDay(message.date) === today);
  const gmailRulings = {
    status: gmailOk ? 'ok' : 'unknown',
    source: 'gmail_metadata_only',
    today_count: gmailRulingsToday.length,
    window_count: gmailRulingMessages.length,
    latest_at: gmailRulingMessages[0]?.date ?? null,
    latest_subject_short: gmailRulingMessages[0] ? redactSubject(gmailRulingMessages[0].subject_short, 90) : null,
    decision_ids: extractDecisionIds(...gmailRulingMessages.slice(0, 20).map((message) => message.subject_short)),
    bodies_read: false,
  };

  const openItems = openClusters.slice(0, 200).map((item) => ({
    channel: item.channel,
    ref: item.ref,
    status: item.status,
    age_days: item.age_days,
    subject_short: item.subject_short,
    has_dispatch_wording: item.has_dispatch_wording,
    thread_id: item.thread_id,
    thread_ids: item.thread_ids || (item.thread_id ? [item.thread_id] : []),
    message_ids: item.message_ids || (item.message_id ? [item.message_id] : []),
    task_ids: item.task_ids,
    ruling_status: item.ruling_status,
    decision_id: item.decision_id,
    rulings: item.rulings.map((ruling) => ({
      message_id: ruling.message_id,
      at: ruling.at,
      decision_id: ruling.decision_id,
      verdict: ruling.verdict,
    })),
    merged_count: item.merged_count,
    layers: item.layers,
    history: item.history.map((entry) => entry.ref),
    ruling_unread: item.ruling_unread,
  }));

  return {
    schema: INTAKE_SCHEMA,
    at: now.toISOString(),
    status,
    read_only: true,
    bodies_persisted: false,
    contains_mail_body: false,
    external_model_safe: true,
    agent_mail: {
      // backlog 采集产物现在会写 status。旧产物没有该字段时按 items 是否存在派生。
      status: agent.ok ? 'ok' : backlogStatus === 'blocked' ? 'blocked' : (Array.isArray(backlog?.items) && backlog.items.length ? 'partial' : 'missing'),
      source_status: backlogStatus,
      block_code: backlog?.block_code || null,
      error_class: backlog?.error_class || null,
      install_hint: backlog?.install_hint || null,
      count: backlog?.count || 0,
      open_count: backlog?.open_count || 0,
      items_are_current: backlogStatus === 'ok',
      run_code: agent.run_code,
      timeout: agent.timeout,
      error: agent.error,
      stderr_tail: agent.stderr_tail,
    },
    gmail_fullbox: {
      status: gmailOk ? 'ok' : fullbox?.status === 'ok' ? 'partial' : (fullbox?.status ?? 'missing'),
      source_status: fullbox?.status ?? 'missing',
      count: fullbox?.count || 0,
      open_count: fullbox?.open_count || 0,
      full_box_total: fullbox?.full_box_total ?? null,
      full_box_unseen: fullbox?.full_box_unseen ?? null,
      provider: fullbox?.provider ?? null,
      window_truncated: fullbox?.window_truncated ?? null,
      bodies_read: fullbox?.body_reads ?? 0,
      body_pending_count: fullbox?.body_pending_count ?? bodyQueue?.pending_count ?? null,
      body_queue_status: bodyQueue?.status ?? null,
      body_queue: bodyQueue
        ? {
          status: bodyQueue.status,
          path: bodyQueue.path || 'knowledge/results/deep-superagent/mail-fullbox/body-queue.json',
          pending_count: bodyQueue.pending_count ?? null,
          selected_count: bodyQueue.selected_count ?? null,
          completed_count: bodyQueue.completed_count ?? null,
          retry_count: bodyQueue.retry_count ?? null,
          failed_count: bodyQueue.failed_count ?? null,
          expired_count: bodyQueue.expired_count ?? null,
          not_in_window_count: bodyQueue.not_in_window_count ?? null,
          total_count: bodyQueue.total_count ?? null,
          max_reads: bodyQueue.max_reads ?? null,
          max_age_days: bodyQueue.max_age_days ?? null,
        }
        : null,
      run_code: gmail.run_code,
      timeout: gmail.timeout,
      error: gmail.error,
      stderr_tail: gmail.stderr_tail,
    },
    ruling_tracker: {
      status: trackerStatus,
      path: 'knowledge/results/deep-superagent/ruling-tracker/latest.json',
      block_code: tracker?.block_code || null,
      error_class: tracker?.error_class || null,
      install_hint: tracker?.install_hint || null,
      generated_at_utc: tracker?.generated_at_utc ?? null,
      counts: tracker?.counts ?? null,
      consumed_ledger: tracker?.consumed_ledger ?? null,
      consume_gate_count: Array.isArray(tracker?.consume_gate) ? tracker.consume_gate.length : null,
      alerts_count: Array.isArray(tracker?.alerts) ? tracker.alerts.length : null,
      run_code: trackerRun?.code ?? null,
      error: trackerRun?.error || null,
      stderr_tail: trackerRun?.stderr ? String(trackerRun.stderr).slice(0, 200) : null,
      note: tracker?.note ?? null,
    },
    gmail_rulings: gmailRulings,
    dedupe: {
      version: dedupe.version,
      layers: ['message_id', 'thread_id', 'task_id'],
      input: unified.length,
      clusters: dedupe.clusters,
      duplicates: dedupe.duplicates.length,
      layer_hits: dedupe.layers,
      conflicts: dedupe.conflicts,
      history_preserved: true,
    },
    counts: {
      unified: unified.length,
      // open_or_dispatch 是“实际输出条数”，open_items_total 是去重后的真实待办总量。
      open_or_dispatch: openItems.length,
      open_items_total: openClusters.length,
      open_items_capped: openClusters.length > openItems.length,
      duplicates_removed: dedupe.duplicates.length,
      ruling_conflicts: dedupe.conflicts.length,
      agent_mail_open: backlog?.open_count ?? null,
      gmail_open_or_unread: fullbox?.open_count ?? null,
      body_pending: fullbox?.body_pending_count ?? bodyQueue?.pending_count ?? null,
      tracker_pending_threads: tracker?.counts?.pending_no_reply ?? null,
      tracker_consume_gate: Array.isArray(tracker?.consume_gate) ? tracker.consume_gate.length : null,
      // 信号不完整时不把可能过期的计数当成当前值；状态在 repo_signals 里单列。
      repo_open_issues: repoOk ? (repoSignals?.issues?.open_count ?? null) : null,
      repo_open_pulls: repoOk ? (repoSignals?.pulls?.open_count ?? null) : null,
      repo_failed_runs: repoOk ? (repoSignals?.actions?.failed_count ?? null) : null,
    },
    open_items: openItems,
    reconciliation: {
      definitions: {
        agent_mail_open: 'Agent Mail backlog 中 status=open 的邮件数（单通道，未去重）',
        gmail_open_or_unread: 'Gmail 全箱中 status=open 或 unread 的邮件数（单通道，未去重）',
        body_pending: 'Gmail 正文队列中尚未读取正文的封数；未读取不等于已消费',
        tracker_pending_threads: '裁决跟踪中没有回复的线程数',
        repo_open_issues: 'GitHub 仓库 open issue 数（不含 PR）',
        repo_failed_runs: 'GitHub Actions 窗口内失败 run 数',
        open_items_total: '三层去重后需要跟进的簇总数',
        open_or_dispatch: '本次产物实际输出的 open_items 条数（上限 200）',
      },
      channels: {
        agent_mail: {
          status: backlogStatus,
          count: backlog?.count ?? null,
          open_count: backlog?.open_count ?? null,
          block_code: backlog?.block_code || null,
        },
        gmail_fullbox: {
          status: fullbox?.status ?? 'missing',
          count: fullbox?.count ?? null,
          open_count: fullbox?.open_count ?? null,
          body_pending_count: fullbox?.body_pending_count ?? bodyQueue?.pending_count ?? null,
          body_queue_status: bodyQueue?.status ?? null,
        },
        ruling_tracker: {
          status: trackerStatus,
          threads: tracker?.counts?.threads ?? null,
          pending_no_reply: tracker?.counts?.pending_no_reply ?? null,
          answered_but_unread: tracker?.counts?.answered_but_unread ?? null,
          answered_consumed: tracker?.counts?.answered_consumed ?? null,
        },
        repo_signals: repoProvided
          ? {status: repoSignals?.status ?? null, generated_at_utc: repoSignals?.generated_at_utc ?? null}
          : null,
      },
      unified_input: unified.length,
      deduped_clusters: dedupe.clusters,
      open_items_total: openClusters.length,
      open_items_emitted: openItems.length,
      duplicates_removed: dedupe.duplicates.length,
      note: '单通道计数用于解释总量，不直接相加；统一待办以 deduped_clusters/open_items_total 为准。',
    },
    repo_signals: repoProvided
      ? {
        status: repoSignals?.status ?? 'missing',
        generated_at_utc: repoSignals?.generated_at_utc ?? null,
        window_days: repoSignals?.window_days ?? null,
        issues: repoSignals?.issues
          ? {open_count: repoSignals.issues.open_count ?? null, recent_count: repoSignals.issues.recent_count ?? null}
          : null,
        pulls: repoSignals?.pulls ? {open_count: repoSignals.pulls.open_count ?? null} : null,
        actions: repoSignals?.actions
          ? {failed_count: repoSignals.actions.failed_count ?? null, success_count: repoSignals.actions.success_count ?? null}
          : null,
        comments: repoSignals?.comments ?? null,
        deploy_receipts: repoSignals?.deploy_receipts ?? null,
        source: repoSignals?.source ?? null,
        note: repoSignals?.note ?? null,
      }
      : null,
    run: {
      run_id: runId,
      run_key: runKey,
      started_at: now.toISOString(),
      input_sha256: inputSha256,
      idempotency_key: runKey,
      replay: Boolean(previous?.run?.run_key && previous.run.run_key === runKey),
      previous_run_key: previous?.run?.run_key ?? null,
      source_commit: sourceMeta.source_commit ?? null,
      workflow_run_id: sourceMeta.workflow_run_id ?? null,
      workflow_run_attempt: sourceMeta.workflow_run_attempt ?? null,
      event: sourceMeta.event ?? null,
      ref: sourceMeta.ref ?? null,
    },
    sources: {
      agent_mail: 'knowledge/results/deep-superagent/mail-backlog/latest.json',
      agent_mail_last_ok: 'knowledge/results/deep-superagent/mail-backlog/last-ok.json',
      gmail_fullbox: 'knowledge/results/deep-superagent/mail-fullbox/latest.json',
      gmail_body_queue: 'knowledge/results/deep-superagent/mail-fullbox/body-queue.json',
      ruling_tracker: 'knowledge/results/deep-superagent/ruling-tracker/latest.json',
      repo_signals: repoProvided ? 'knowledge/results/deep-superagent/repo-signals/latest.json' : null,
      consumed_ledger_dir: 'knowledge/results/deep-superagent/rulings-consumed-*.json',
    },
  };
}

export async function main() {
  const paths = resolvePaths();
  const lock = acquireRunLock(paths.lock);
  if (!lock.acquired) {
    // 重复触发/并发：不覆盖上一次可核验产物，也不重复记账。
    console.log(JSON.stringify({status: 'skipped_locked', reason: lock.reason, holder: lock.holder || null}));
    process.exitCode = 4;
    return;
  }

  try {
    const startedAt = new Date();
    const credentials = loadGmailEnv(process.env, paths.envFile);
    // 脚本始终从代码目录取；cwd 只决定各脚本把结果写到哪里（LTZZZ_ROOT）。
    // 否则 LTZZZ_ROOT 指到别处时，会去 <root>/scripts 找不存在的文件。
    const backlogRun = runCommand('node', [path.join(REPO_ROOT, 'scripts/collect-mail-backlog.mjs')], {cwd: paths.root});
    const gmailRun = runCommand('python3', [path.join(REPO_ROOT, 'scripts/collect-gmail-imap.py')], {cwd: paths.root});
    const trackerRun = runCommand('node', [path.join(REPO_ROOT, 'scripts/track-gpt-rulings.mjs'), '--limit', '50', '--window-days', '14', '--write'], {cwd: paths.root});

    const backlog = readJson(paths.backlog, {status: 'missing', items: [], count: 0, open_count: 0});
    const fullbox = readJson(paths.fullbox, {status: 'missing', messages: [], count: 0, open_count: 0});
    const tracker = readJson(paths.tracker, null);
    const repoSignals = readJson(paths.repoSignals, null);
    const previous = readJson(paths.out, null);
    const sourceMeta = {
      source_commit: process.env.GITHUB_SHA || null,
      workflow_run_id: process.env.GITHUB_RUN_ID || null,
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || null,
      event: process.env.GITHUB_EVENT_NAME || null,
      ref: process.env.GITHUB_REF || null,
    };

    const payload = buildIntake({
      backlog, fullbox, tracker, repoSignals, sourceMeta, backlogRun, gmailRun, trackerRun, now: startedAt, previous,
    });
    payload.credentials = credentials;
    payload.source = sourceMeta;

    fs.mkdirSync(paths.outDir, {recursive: true});
    fs.writeFileSync(paths.out, JSON.stringify(payload, null, 1) + '\n');

    let log;
    try {
      log = appendRunLog(paths.runs, {
        run_id: payload.run.run_id,
        run_key: payload.run.run_key,
        at: payload.at,
        status: payload.status,
        input_sha256: payload.run.input_sha256,
        counts: payload.counts,
        replay: payload.run.replay,
        source_commit: payload.run.source_commit,
      });
    } catch (error) {
      // 记账失败不能伪装成功：产物里显式标出。
      payload.run.log_error = String(error.message).slice(0, 160);
      fs.writeFileSync(paths.out, JSON.stringify(payload, null, 1) + '\n');
      log = {duplicate: false, error: payload.run.log_error};
    }

    console.log(JSON.stringify({
      status: payload.status,
      agent: payload.agent_mail,
      gmail: payload.gmail_fullbox,
      tracker: payload.ruling_tracker,
      open: payload.counts.open_or_dispatch,
      duplicates: payload.counts.duplicates_removed,
      replay: payload.run.replay,
      log,
    }));
    // 退出码区分三态：0=ok，2=partial（有通道失败），3=failed；4=并发被拒。
    process.exitCode = exitCodeFor(payload.status);
  } finally {
    releaseRunLock(paths.lock, lock.token);
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) await main();
