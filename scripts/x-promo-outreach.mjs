#!/usr/bin/env node
/**
 * One-time LTZZZ X outreach runner.
 * Modes: preflight (read-only lookups) or send (only after payload approval).
 * Never logs access tokens or message bodies. Saves per-action receipts.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

const root = process.cwd();
const payloadPath = resolve(root, process.env.X_PROMO_PAYLOAD_PATH || 'data/tasks/x-promo-2026-10-03.json');
const receiptPath = resolve(root, process.env.X_PROMO_RECEIPT_PATH || 'knowledge/results/2026-10-03-x-promo-receipt.json');
const mode = process.env.X_PROMO_MODE || 'preflight';
const token = (process.env.X_USER_ACCESS_TOKEN || '').trim();
const startedAt = new Date().toISOString();

function weightedXLength(text) {
  const urlPattern = /https?:\/\/[^\s]+/gu;
  let weighted = 0;
  let last = 0;
  for (const match of text.matchAll(urlPattern)) {
    const start = match.index;
    const before = text.slice(last, start);
    for (const ch of before) weighted += ch.codePointAt(0) > 0x10ff ? 2 : 1;
    weighted += 23; // X t.co URL weighting.
    last = start + match[0].length;
  }
  for (const ch of text.slice(last)) weighted += ch.codePointAt(0) > 0x10ff ? 2 : 1;
  return weighted;
}

function safeApiError(data) {
  if (!data || typeof data !== 'object') return 'unstructured API error';
  const parts = [];
  if (data.title) parts.push(String(data.title));
  if (Array.isArray(data.errors)) {
    for (const e of data.errors.slice(0, 3)) {
      const s = [e.type, e.title, e.code].filter(Boolean).map(String).join(':');
      if (s) parts.push(s);
    }
  }
  if (data.detail && !parts.length) parts.push(String(data.detail).slice(0, 160));
  return parts.join(' | ').slice(0, 400) || 'request rejected';
}

async function readJson(path, fallback) {
  try { return JSON.parse(await readFile(path, 'utf8')); }
  catch (e) { if (e.code === 'ENOENT') return fallback; throw e; }
}

const payload = await readJson(payloadPath, null);
if (!payload?.campaign_id || !Array.isArray(payload.direct_messages) || !payload.tweet) {
  throw new Error('Campaign payload is missing required fields');
}
const payloadHash = createHash('sha256').update(JSON.stringify(payload)).digest('hex');
const previous = await readJson(receiptPath, {});
const receipt = {
  schema_version: 1,
  campaign_id: payload.campaign_id,
  copy_version: payload.copy_version,
  payload_sha256: payloadHash,
  source_order: payload.source_order,
  updated_at: startedAt,
  status: 'running',
  mode,
  token_present: Boolean(token),
  copy_approval: payload.payload_approval,
  tweet_length: {
    codepoints: [...payload.tweet].length,
    weighted_estimate: weightedXLength(payload.tweet),
    limit: 280
  },
  target_lookups: previous.target_lookups || {},
  actions: previous.actions || Object.fromEntries([
    ...payload.direct_messages.map(m => [m.id, { to: m.to, status: 'not_run' }]),
    ['tweet', { status: 'not_run' }]
  ]),
  runs: Array.isArray(previous.runs) ? previous.runs : []
};

const run = { mode, started_at: startedAt, status: 'running' };
receipt.runs.push(run);
receipt.runs = receipt.runs.slice(-10);

async function persist() {
  receipt.updated_at = new Date().toISOString();
  await mkdir(dirname(receiptPath), { recursive: true });
  await writeFile(receiptPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
}

function logSummary() {
  const summary = {
    campaign_id: receipt.campaign_id,
    mode: receipt.mode,
    status: receipt.status,
    token_present: receipt.token_present,
    tweet_weighted_estimate: receipt.tweet_length.weighted_estimate,
    target_lookups: Object.fromEntries(Object.entries(receipt.target_lookups).map(([k, v]) => [k, { status: v.status, user_id: v.user_id || null }])),
    actions: Object.fromEntries(Object.entries(receipt.actions).map(([k, v]) => [k, { status: v.status, http_status: v.http_status || null, id: v.tweet_id || v.dm_event_id || null }])),
    copy_approval: receipt.copy_approval
  };
  console.log(JSON.stringify(summary));
}

async function api(method, url, body) {
  const headers = { Authorization: `Bearer ${token}` };
  const init = { method, headers, signal: AbortSignal.timeout(20000) };
  if (body !== undefined) {
    headers['Content-Type'] = 'application/json';
    init.body = JSON.stringify(body);
  }
  const response = await fetch(url, init);
  const text = await response.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; }
  catch { data = { title: 'non-JSON response' }; }
  return { ok: response.ok, status: response.status, data };
}

async function lookupTarget(handle) {
  try {
    const result = await api('GET', `https://api.x.com/2/users/by/username/${encodeURIComponent(handle)}`);
    if (result.ok && result.data?.data?.id) {
      return { status: 'resolved', user_id: String(result.data.data.id), username: result.data.data.username || handle };
    }
    return { status: 'blocked', http_status: result.status, error: safeApiError(result.data) };
  } catch {
    return { status: 'blocked', error: 'lookup request failed or timed out' };
  }
}

if (!['preflight', 'send'].includes(mode)) {
  receipt.status = 'blocked';
  receipt.block_reason = 'mode must be preflight or send';
  run.status = receipt.status;
  await persist();
  logSummary();
  process.exit(0);
}

if (!token) {
  receipt.status = 'blocked';
  receipt.block_reason = 'X_USER_ACCESS_TOKEN GitHub Actions secret is unavailable to this run';
  run.status = receipt.status;
  await persist();
  logSummary();
  process.exit(0);
}

if (mode === 'send' && payload.payload_approval !== 'approved_by_owner') {
  receipt.status = 'blocked';
  receipt.block_reason = 'corrected campaign copy has not been approved';
  run.status = receipt.status;
  await persist();
  logSummary();
  process.exit(0);
}

const lookups = {};
for (const dm of payload.direct_messages) {
  lookups[dm.to] = await lookupTarget(dm.to);
  receipt.target_lookups[dm.to] = lookups[dm.to];
  await persist();
}
const allResolved = Object.values(lookups).every(v => v.status === 'resolved');

if (mode === 'preflight') {
  receipt.status = allResolved && receipt.tweet_length.weighted_estimate <= 280
    ? 'preflight_ready_copy_confirmation_required'
    : 'blocked';
  if (!allResolved) receipt.block_reason = 'one or more X target lookups failed';
  else if (receipt.tweet_length.weighted_estimate > 280) receipt.block_reason = 'tweet exceeds X weighted character limit';
  receipt.dm_scope_note = 'Read-only lookup confirms users.read only; X requires dm.write, dm.read, tweet.read, and users.read for OAuth 2.0 DM sends. DM-write scope cannot be verified without sending.';
  run.status = receipt.status;
  await persist();
  logSummary();
  process.exit(0);
}

// Do not send if the X token cannot resolve both approved recipients.
if (!allResolved) {
  receipt.status = 'blocked';
  receipt.block_reason = 'recipient lookup failed; no DMs or tweet sent';
  run.status = receipt.status;
  await persist();
  logSummary();
  process.exit(0);
}

for (const dm of payload.direct_messages) {
  const prior = receipt.actions[dm.id];
  if (prior?.status === 'sent' || prior?.status === 'outcome_unknown') continue;
  const action = { to: dm.to, status: 'sending', attempted_at: new Date().toISOString() };
  receipt.actions[dm.id] = action;
  await persist();
  try {
    const result = await api('POST', `https://api.x.com/2/dm_conversations/with/${encodeURIComponent(lookups[dm.to].user_id)}/messages`, { text: dm.text });
    action.http_status = result.status;
    if (result.ok && result.data?.data) {
      action.status = 'sent';
      action.dm_event_id = result.data.data.dm_event_id || null;
      action.dm_conversation_id = result.data.data.dm_conversation_id || null;
      action.completed_at = new Date().toISOString();
    } else {
      action.status = 'blocked';
      action.error = safeApiError(result.data);
    }
  } catch {
    action.status = 'outcome_unknown';
    action.error = 'request timed out or connection failed; do not retry automatically';
  }
  await persist();
}

const tweetAction = receipt.actions.tweet;
if (tweetAction?.status !== 'sent' && tweetAction?.status !== 'outcome_unknown') {
  if (receipt.tweet_length.weighted_estimate > 280) {
    receipt.actions.tweet = { status: 'blocked', error: 'tweet exceeds X weighted character limit; not truncated or sent' };
  } else {
    receipt.actions.tweet = { status: 'sending', attempted_at: new Date().toISOString() };
    await persist();
    try {
      const result = await api('POST', 'https://api.x.com/2/tweets', { text: payload.tweet });
      receipt.actions.tweet.http_status = result.status;
      if (result.ok && result.data?.data?.id) {
        receipt.actions.tweet.status = 'sent';
        receipt.actions.tweet.tweet_id = String(result.data.data.id);
        receipt.actions.tweet.url = `https://x.com/i/web/status/${result.data.data.id}`;
        receipt.actions.tweet.completed_at = new Date().toISOString();
      } else {
        receipt.actions.tweet.status = 'blocked';
        receipt.actions.tweet.error = safeApiError(result.data);
      }
    } catch {
      receipt.actions.tweet.status = 'outcome_unknown';
      receipt.actions.tweet.error = 'request timed out or connection failed; do not retry automatically';
    }
  }
  await persist();
}

const statuses = Object.values(receipt.actions).map(a => a.status);
const sent = statuses.filter(s => s === 'sent').length;
receipt.status = sent === 3 ? 'complete' : sent > 0 ? 'partial' : 'blocked';
receipt.block_reason = sent === 3 ? undefined : 'one or more X API actions did not complete';
run.status = receipt.status;
run.completed_at = new Date().toISOString();
await persist();
logSummary();
