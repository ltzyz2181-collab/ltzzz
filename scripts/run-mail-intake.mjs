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
import {dedupeMessages, extractTaskIds, normalizeThreadKey} from './mail/dedupe.mjs';
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
    tracker: path.join(base, 'ruling-tracker/latest.json'),
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
    message_id: item.ref,
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

function trackerBuckets(tracker) {
  const buckets = {bySubject: new Map(), byTask: new Map()};
  const push = (map, key, item) => {
    if (!key) return;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  };
  for (const item of tracker?.items || []) {
    const threadKey = String(item.thread_key || item.thread || '');
    if (threadKey.startsWith('subject:')) push(buckets.bySubject, threadKey.slice(8), item);
    else if (threadKey.startsWith('task:')) push(buckets.byTask, threadKey.slice(5).toUpperCase(), item);
    for (const taskId of item.task_ids || []) push(buckets.byTask, String(taskId).toUpperCase(), item);
  }
  return buckets;
}

// 历史裁决继承：把 tracker 里同一线程/同一 Task ID 的全部回复挂到邮件项上。
export function attachTrackerRulings(items, tracker) {
  const {bySubject, byTask} = trackerBuckets(tracker);
  return items.map((item) => {
    const matches = [
      ...(bySubject.get(normalizeThreadKey(item.subject_short)) || []),
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
  backlogRun = {code: null},
  gmailRun = {code: null},
  trackerRun = {code: null},
  now = new Date(),
  previous = null,
  runId = randomBytes(6).toString('hex'),
} = {}) {
  const agent = channelState(backlogRun, backlog?.status ?? (Array.isArray(backlog?.items) ? 'ok' : 'missing'));
  const gmail = channelState(gmailRun, fullbox?.status ?? 'missing');
  const trackerOk = trackerRun?.code === 0 && tracker?.schema === TRACKER_SCHEMA && tracker?.status !== 'unknown';
  const trackerStatus = trackerOk ? 'ok' : (!tracker || tracker.status === 'unknown' ? 'unknown' : 'stale');

  const unified = attachTrackerRulings([
    ...mapBacklogItems(backlog),
    ...mapFullboxMessages(fullbox),
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
    },
    tracker: tracker
      ? {generated_at: tracker.generated_at_utc, counts: tracker.counts, items: tracker.items || []}
      : 'missing',
  });
  const day = now.toISOString().slice(0, 10);
  const runKey = `${day}:${inputSha256.slice(0, 16)}`;

  const gmailOk = gmail.ok;
  const backlogOk = agent.ok;
  const status = gmailOk && backlogOk && trackerOk ? 'ok' : (gmailOk || backlogOk || trackerOk ? 'partial' : 'failed');

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
      // backlog 采集产物不写 status 字段（只有 items），旧写法 backlog?.status ?? 'missing'
      // 会把已成功采集的通道误报成 missing。按实际内容派生，不用缺失字段判死。
      status: agent.ok ? 'ok' : (Array.isArray(backlog?.items) && backlog.items.length ? 'partial' : 'missing'),
      count: backlog?.count || 0,
      open_count: backlog?.open_count || 0,
      run_code: agent.run_code,
      timeout: agent.timeout,
      error: agent.error,
      stderr_tail: agent.stderr_tail,
    },
    gmail_fullbox: {
      status: fullbox?.status ?? 'missing',
      count: fullbox?.count || 0,
      open_count: fullbox?.open_count || 0,
      full_box_total: fullbox?.full_box_total ?? null,
      full_box_unseen: fullbox?.full_box_unseen ?? null,
      provider: fullbox?.provider ?? null,
      window_truncated: fullbox?.window_truncated ?? null,
      bodies_read: fullbox?.body_reads ?? 0,
      run_code: gmail.run_code,
      timeout: gmail.timeout,
      error: gmail.error,
      stderr_tail: gmail.stderr_tail,
    },
    ruling_tracker: {
      status: trackerStatus,
      path: 'knowledge/results/deep-superagent/ruling-tracker/latest.json',
      generated_at_utc: tracker?.generated_at_utc ?? null,
      counts: tracker?.counts ?? null,
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
      open_or_dispatch: openItems.length,
      duplicates_removed: dedupe.duplicates.length,
      ruling_conflicts: dedupe.conflicts.length,
    },
    open_items: openItems,
    run: {
      run_id: runId,
      run_key: runKey,
      started_at: now.toISOString(),
      input_sha256: inputSha256,
      idempotency_key: runKey,
      replay: Boolean(previous?.run?.run_key && previous.run.run_key === runKey),
      previous_run_key: previous?.run?.run_key ?? null,
    },
    sources: {
      agent_mail: 'knowledge/results/deep-superagent/mail-backlog/latest.json',
      gmail_fullbox: 'knowledge/results/deep-superagent/mail-fullbox/latest.json',
      ruling_tracker: 'knowledge/results/deep-superagent/ruling-tracker/latest.json',
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
    const backlogRun = runCommand('node', ['scripts/collect-mail-backlog.mjs'], {cwd: paths.root});
    const gmailRun = runCommand('python3', ['scripts/collect-gmail-imap.py'], {cwd: paths.root});
    const trackerRun = runCommand('node', ['scripts/track-gpt-rulings.mjs', '--limit', '50', '--window-days', '14', '--write'], {cwd: paths.root});

    const backlog = readJson(paths.backlog, {status: 'missing', items: [], count: 0, open_count: 0});
    const fullbox = readJson(paths.fullbox, {status: 'missing', messages: [], count: 0, open_count: 0});
    const tracker = readJson(paths.tracker, null);
    const previous = readJson(paths.out, null);

    const payload = buildIntake({
      backlog, fullbox, tracker, backlogRun, gmailRun, trackerRun, now: startedAt, previous,
    });
    payload.credentials = credentials;

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
