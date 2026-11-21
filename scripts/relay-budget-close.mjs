import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import policy from '../config/relay-seat-policy.json' with {type: 'json'};
import {closeRelaySeat} from './lib/relay-seat-guard.mjs';

export const TASK_ID = 'RELAY-BUDGET-POSTCALL-CAP-20261120-01';
export const DECISION_ID = 'GPT-DECISION-20261121-RELAY-PAID-LANE-CLOSE-01';
export const DEFAULT_PROXY_URL = 'https://ltzzz-relay-proxy.ltzyz2181.workers.dev/v1';

async function request(fetchImpl, url, token, method, body) {
  try {
    const response = await fetchImpl(url, {
      method,
      headers: {
        'content-type': 'application/json',
        'x-ltzzz-seat-token': token,
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
      signal: AbortSignal.timeout(20000),
    });
    let data = null;
    try { data = await response.json(); } catch {}
    return {http: response.status, ok: response.ok, data};
  } catch (error) {
    return {http: null, ok: false, data: null, error: String(error?.name || 'network_error')};
  }
}

function estimateTokens(text) {
  let cjk = 0;
  let other = 0;
  for (const ch of String(text ?? '')) {
    const code = ch.codePointAt(0);
    if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

function compactState(result) {
  const data = result?.data || {};
  return {
    http: result?.http ?? null,
    ok: result?.ok === true,
    closed: data.closed === true,
    closed_reason: data.closed_reason ?? null,
    active_reservations: Number.isInteger(data.active_reservations) ? data.active_reservations : null,
    daily_spent_usd: typeof data.daily_spent_usd === 'number' ? data.daily_spent_usd : null,
    project_spent_usd: typeof data.project_spent_usd === 'number' ? data.project_spent_usd : null,
    error: result?.error ?? data.error?.code ?? null,
  };
}

export async function closeAndVerify({
  fetchImpl = fetch,
  baseUrl = DEFAULT_PROXY_URL,
  token,
  promptText,
  at = new Date().toISOString(),
  runId = 'local',
  runAttempt = '1',
  sourceCommit = null,
} = {}) {
  let base = String(baseUrl || '');
  while (base.endsWith('/')) base = base.slice(0, -1);
  const result = {
    schema: 'ltzzz.relay-budget-close.v1',
    task_id: TASK_ID,
    decision_id: DECISION_ID,
    at,
    workflow_run_id: String(runId),
    workflow_run_attempt: String(runAttempt),
    source_commit: sourceCommit,
    worker_url: base,
    action: 'durable_paid_relay_seat_close',
    close_reason: 'gpt_decision_hold_pending_balance_reconciliation',
    closed_by: 'gpt-decision-seat',
    paid_model_call_attempted: false,
    official_provider_balance_verified: false,
    state_before: null,
    close_response: null,
    state_after_close: null,
    synthetic_reserve_probe: null,
    state_after_probe: null,
    verified: false,
    local_state_updated: false,
    status: 'blocked_evidence',
  };

  if (!token) {
    result.error = 'proxy_token_missing';
    return result;
  }
  if (!base || typeof promptText !== 'string' || estimateTokens(promptText) < 4096) {
    result.error = !base ? 'proxy_url_missing' : 'synthetic_probe_fixture_too_short';
    return result;
  }

  const stateBefore = await request(fetchImpl, base + '/budget/state', token, 'GET');
  result.state_before = compactState(stateBefore);
  if (!stateBefore.ok || stateBefore.data?.ok !== true || typeof stateBefore.data?.closed !== 'boolean') {
    result.error = 'runtime_budget_state_unavailable';
    return result;
  }

  if (stateBefore.data.closed === true) {
    result.close_response = {skipped: true, reason: 'already_closed'};
  } else {
    result.close_response = await request(fetchImpl, base + '/budget/close', token, 'POST', {
      reason: result.close_reason,
      closed_by: result.closed_by,
      at,
    });
  }

  const stateAfterClose = await request(fetchImpl, base + '/budget/state', token, 'GET');
  result.state_after_close = compactState(stateAfterClose);
  const closed = stateAfterClose.ok && stateAfterClose.data?.ok === true && stateAfterClose.data?.closed === true;
  if (!closed) {
    result.error = 'runtime_close_not_verified';
    return result;
  }

  const synthetic = await request(fetchImpl, base + '/chat/completions', token, 'POST', {
    model: 'gpt-6.1-sol',
    messages: [{role: 'user', content: promptText}],
    max_tokens: 64,
  });
  const syntheticCode = synthetic.data?.error?.code ?? null;
  result.synthetic_reserve_probe = {
    http: synthetic.http,
    ok: synthetic.ok,
    error_code: syntheticCode,
    expected_error_code: 'proxy_budget_refused_relay_seat_closed',
    upstream_generation_reached: false,
  };

  const stateAfterProbe = await request(fetchImpl, base + '/budget/state', token, 'GET');
  result.state_after_probe = compactState(stateAfterProbe);
  const noReservation = stateAfterProbe.ok
    && stateAfterProbe.data?.closed === true
    && stateAfterProbe.data?.active_reservations === 0;
  result.verified = synthetic.http === 403
    && syntheticCode === 'proxy_budget_refused_relay_seat_closed'
    && noReservation;
  result.status = result.verified ? 'closed_verified' : 'blocked_evidence';
  if (!result.verified) result.error = 'synthetic_closed_gate_probe_not_verified';
  return result;
}

export function writeReceipt(result, {root = process.cwd()} = {}) {
  const dir = path.join(root, 'knowledge/results/relay-seat/close-receipts');
  fs.mkdirSync(dir, {recursive: true});
  const stamp = String(result.at || new Date().toISOString()).replace(/[:.]/g, '-');
  const name = `RELAY-CLOSE-${stamp}-run-${result.workflow_run_id}-attempt-${result.workflow_run_attempt}.json`;
  const file = path.join(dir, name);
  fs.writeFileSync(file, JSON.stringify(result, null, 2) + '\\n', {flag: 'wx'});
  return path.relative(root, file);
}

async function main() {
  const root = process.cwd();
  let result;
  try {
    const promptText = fs.readFileSync(path.join(root, 'fixtures/relay-seat/long-context-probe.txt'), 'utf8');
    result = await closeAndVerify({
      baseUrl: process.env.LTZZZ_RELAY_PROXY_URL || DEFAULT_PROXY_URL,
      token: process.env.LTZZZ_RELAY_PROXY_TOKEN || '',
      promptText,
      runId: process.env.GITHUB_RUN_ID || 'local',
      runAttempt: process.env.GITHUB_RUN_ATTEMPT || '1',
      sourceCommit: process.env.GITHUB_SHA || null,
    });
  } catch (error) {
    result = {
      schema: 'ltzzz.relay-budget-close.v1',
      task_id: TASK_ID,
      decision_id: DECISION_ID,
      at: new Date().toISOString(),
      status: 'blocked_evidence',
      verified: false,
      paid_model_call_attempted: false,
      official_provider_balance_verified: false,
      error: String(error?.message || error).slice(0, 160),
      workflow_run_id: process.env.GITHUB_RUN_ID || 'local',
      workflow_run_attempt: process.env.GITHUB_RUN_ATTEMPT || '1',
      source_commit: process.env.GITHUB_SHA || null,
    };
  }
  if (result.verified === true) {
    try {
      const local = closeRelaySeat(root, policy, {
        balanceUsd: null,
        reason: result.close_reason,
        detail: 'Live Durable Object close and closed-seat refusal verified; provider balance remains unverified.',
        at: result.at,
        actor: 'gpt-decision-seat',
      });
      result.local_state_updated = local.status === 'closed';
      result.local_state = {
        status: local.status,
        balance_usd: local.balance_usd,
        closed_at: local.closed_at,
        close_reason: local.close_reason,
        closed_by: local.closed_by,
      };
      if (!result.local_state_updated) result.status = 'closed_verified_local_state_sync_failed';
    } catch (error) {
      result.local_state_updated = false;
      result.local_state_error = String(error?.message || error).slice(0, 160);
      result.status = 'closed_verified_local_state_sync_failed';
    }
  }
  const receipt = writeReceipt(result, {root});
  console.log(JSON.stringify({
    status: result.status,
    verified: result.verified === true,
    receipt,
    state_before_closed: result.state_before?.closed ?? null,
    state_after_closed: result.state_after_probe?.closed ?? result.state_after_close?.closed ?? null,
    synthetic_probe_http: result.synthetic_reserve_probe?.http ?? null,
    synthetic_probe_error: result.synthetic_reserve_probe?.error_code ?? null,
    paid_model_call_attempted: false,
    local_state_updated: result.local_state_updated === true,
    official_provider_balance_verified: false,
  }));
  if (result.verified !== true || result.local_state_updated !== true) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
