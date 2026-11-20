// LTZZZ relay proxy: the only component that holds the station key.
// Seats authenticate with a proxy token and never see the upstream key.
//
// Budget enforcement lives here because this is the single choke point shared
// by the CLI seat (scripts/relay-seat.mjs) and the Deep Worker's direct relay
// path. A Durable Object keeps one atomic ledger for per-call, daily, project
// and balance-floor limits, so a caller cannot bypass the caps by skipping the
// CLI guard. The seat guard remains the pre-flight for CLI calls; this gateway
// is the authoritative runtime gate for every transport.

import policy from '../../config/relay-seat-policy.json' with {type: 'json'};

export const ALLOWED_MODELS = (policy.routing?.allowlist || []).map(entry => entry.model);
export const MIN_INPUT_TOKENS = policy.routing?.min_input_tokens ?? 4096;
export const MAX_INPUT_TOKENS = 1100000;
export const MAX_CALL_COST_USD = policy.cost_guard?.per_call_cost_cap_usd ?? 0.05;
export const DAILY_COST_CAP_USD = policy.cost_guard?.daily_cost_cap_usd ?? 0.5;
export const PROJECT_COST_CAP_USD = policy.cost_guard?.project_cost_cap_usd ?? 10;
export const BALANCE_FLOOR_USD = policy.balance_guard?.floor_usd ?? 3;
export const RESERVATION_TTL_MS = 10 * 60 * 1000;
export const BUDGET_SCHEMA = 'ltzzz.relay-budget.v1';

export const MODEL_PRICES = Object.fromEntries(
  (policy.routing?.allowlist || []).map(entry => [entry.model, {
    input: entry.price_input_usd_per_1m,
    output: entry.price_output_usd_per_1m,
    hiddenInputTokens: entry.known_input_inflation_tokens || 0,
  }]),
);

function numberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function utcDayOf(iso) {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
}

function round6(value) {
  return Number(Number(value).toFixed(6));
}

export function estimateTokens(text) {
  const value = String(text ?? '');
  let cjk = 0;
  let other = 0;
  for (const ch of value) {
    const code = ch.codePointAt(0);
    if ((code >= 0x3000 && code <= 0x9fff) || (code >= 0xf900 && code <= 0xfaff) || (code >= 0xff00 && code <= 0xffef)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

function messageText(messages) {
  return messages
    .map((message) => (typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '')))
    .join('\n');
}

export function validateRequest(body, { batch = false } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { ok: false, status: 400, code: 'proxy_body_invalid' };
  }
  if (!ALLOWED_MODELS.includes(body.model)) {
    return { ok: false, status: 403, code: 'proxy_model_not_allowlisted', model: body.model ?? null };
  }
  if (body.stream === true) {
    return { ok: false, status: 400, code: 'proxy_stream_not_supported' };
  }
  if (!Array.isArray(body.messages) || !body.messages.length) {
    return { ok: false, status: 400, code: 'proxy_messages_invalid' };
  }
  const text = messageText(body.messages);
  const estimated = estimateTokens(text);
  // A batch caller declares itself explicitly; a plain short prompt is still refused.
  if (estimated < MIN_INPUT_TOKENS && batch !== true) {
    return { ok: false, status: 400, code: 'proxy_short_request_forbidden', estimated_input_tokens: estimated };
  }
  if (estimated > MAX_INPUT_TOKENS) {
    return { ok: false, status: 413, code: 'proxy_context_too_large', estimated_input_tokens: estimated };
  }
  const maxTokens = body.max_tokens === undefined ? null : Number(body.max_tokens);
  if (maxTokens !== null && (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768)) {
    return { ok: false, status: 400, code: 'proxy_max_tokens_invalid' };
  }
  if (maxTokens === null) {
    return { ok: false, status: 400, code: 'proxy_max_tokens_required_for_cost_cap' };
  }
  const prices = MODEL_PRICES[body.model];
  const billedInput = estimated + (prices.hiddenInputTokens || 0);
  const worstCaseCost = round6((billedInput * prices.input + maxTokens * prices.output) / 1e6);
  if (worstCaseCost > MAX_CALL_COST_USD) {
    return {
      ok: false,
      status: 403,
      code: 'proxy_per_call_cost_cap_exceeded',
      estimated_input_tokens: estimated,
      worst_case_cost_usd: worstCaseCost,
      per_call_cost_cap_usd: MAX_CALL_COST_USD,
    };
  }
  return { ok: true, model: body.model, estimated_input_tokens: estimated, worst_case_cost_usd: worstCaseCost };
}

// Actual cost after the response: never below our own estimate for the prompt,
// and never below the station's reported completion count.
export function actualCostUsd({ model, estimatedInputTokens, promptTokens, completionTokens }) {
  const prices = MODEL_PRICES[model];
  if (!prices) return null;
  const reported = numberOrNull(promptTokens);
  const estimated = numberOrNull(estimatedInputTokens) ?? 0;
  const billedInput = Math.max(reported !== null && reported > 0 ? reported : 0, estimated + prices.hiddenInputTokens);
  const completion = numberOrNull(completionTokens);
  const billedOutput = completion !== null && completion >= 0 ? completion : 0;
  return round6((billedInput * prices.input + billedOutput * prices.output) / 1e6);
}

function constantTimeEqual(a, b) {
  const left = String(a ?? '');
  const right = String(b ?? '');
  if (!left || left.length !== right.length) return false;
  let diff = 0;
  for (let index = 0; index < left.length; index += 1) diff |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return diff === 0;
}

export function authorized(request, expectedToken) {
  if (!expectedToken) return false;
  const header = request.headers.get('x-ltzzz-seat-token');
  return constantTimeEqual(header, expectedToken);
}

const PASS_THROUGH_HEADERS = ['content-type', 'x-request-id', 'x-oneapi-request-id', 'request-id', 'x-upstream-request-id'];

function json(status, code, extra = {}) {
  return new Response(JSON.stringify({ error: { code, ...extra } }), {
    status,
    headers: { 'content-type': 'application/json', 'x-ltzzz-relay-proxy': '1' },
  });
}

// --- durable budget ledger -------------------------------------------------

function emptyBudgetState(env) {
  const balance = numberOrNull(env?.RELAY_CONFIRMED_BALANCE_USD);
  return {
    schema: BUDGET_SCHEMA,
    currency: 'USD',
    baseline: balance === null ? null : {
      balance_usd: balance,
      confirmed_at: typeof env.RELAY_BALANCE_CONFIRMED_AT === 'string' ? env.RELAY_BALANCE_CONFIRMED_AT : null,
      confirmed_by: typeof env.RELAY_BALANCE_CONFIRMED_BY === 'string' ? env.RELAY_BALANCE_CONFIRMED_BY : 'deployment_variable',
      source: typeof env.RELAY_BALANCE_SOURCE === 'string' ? env.RELAY_BALANCE_SOURCE : 'wrangler.relay-proxy.toml',
    },
    entries: [],
    reservations: {},
    prior_periods: [],
    closed: false,
    closed_reason: null,
    updated_at: null,
  };
}

export function budgetTotals(state, now = new Date().toISOString()) {
  const day = utcDayOf(now);
  let spent = 0;
  let daily = 0;
  let reserved = 0;
  let dailyReserved = 0;
  for (const entry of Array.isArray(state.entries) ? state.entries : []) {
    const cost = numberOrNull(entry?.cost_usd) ?? 0;
    spent += cost;
    if (day !== null && utcDayOf(entry?.at) === day) daily += cost;
  }
  for (const reservation of Object.values(state.reservations || {})) {
    const cost = numberOrNull(reservation?.estimated_cost_usd) ?? 0;
    reserved += cost;
    if (day !== null && utcDayOf(reservation?.at) === day) dailyReserved += cost;
  }
  return {
    day,
    spent_usd: round6(spent),
    daily_spent_usd: round6(daily),
    reserved_usd: round6(reserved),
    daily_reserved_usd: round6(dailyReserved),
  };
}

// A reservation that never settled may still have been billed upstream. Roll it
// into the spend ledger at its worst-case estimate instead of forgetting it.
function rollExpiredReservations(state, now) {
  let changed = false;
  for (const [callId, reservation] of Object.entries(state.reservations || {})) {
    if (Date.parse(reservation?.expires_at) > Date.parse(now)) continue;
    state.entries.push({
      at: reservation.expires_at,
      call_id: callId,
      model: reservation.model,
      task_id: reservation.task_id ?? null,
      estimated_cost_usd: reservation.estimated_cost_usd,
      cost_usd: reservation.estimated_cost_usd,
      prompt_tokens: null,
      completion_tokens: null,
      upstream_http: null,
      request_id: null,
      outcome: 'reservation_expired_assumed_spent',
      settled_at: null,
    });
    delete state.reservations[callId];
    changed = true;
  }
  return changed;
}

function budgetSnapshot(state) {
  const totals = budgetTotals(state);
  const base = numberOrNull(state.baseline?.balance_usd);
  return {
    ok: true,
    schema: state.schema,
    baseline_usd: base,
    balance_usd: base === null ? null : round6(base - totals.spent_usd),
    available_usd: base === null ? null : round6(base - totals.spent_usd - totals.reserved_usd),
    daily_spent_usd: totals.daily_spent_usd,
    daily_reserved_usd: totals.daily_reserved_usd,
    project_spent_usd: totals.spent_usd,
    project_reserved_usd: totals.reserved_usd,
    active_reservations: Object.keys(state.reservations || {}).length,
    closed: state.closed === true,
    closed_reason: state.closed_reason ?? null,
    limits: {
      per_call_cost_cap_usd: MAX_CALL_COST_USD,
      daily_cost_cap_usd: DAILY_COST_CAP_USD,
      project_cost_cap_usd: PROJECT_COST_CAP_USD,
      balance_floor_usd: BALANCE_FLOOR_USD,
    },
  };
}

export class RelayBudget {
  constructor(state, env) {
    this.state = state;
    this.env = env;
  }

  async fetch(request) {
    const path = new URL(request.url).pathname;
    try {
      if (path === '/reserve' && request.method === 'POST') return Response.json(await this.reserve(await request.json()));
      if (path === '/settle' && request.method === 'POST') return Response.json(await this.settle(await request.json()));
      if (path === '/confirm' && request.method === 'POST') return Response.json(await this.confirm(await request.json()));
      if (path === '/state' && request.method === 'GET') {
        return Response.json(await this.state.storage.transaction(async tx => budgetSnapshot(await this.load(tx))));
      }
      return Response.json({ ok: false, status: 404, code: 'relay_budget_route_not_found' }, { status: 404 });
    } catch (error) {
      return Response.json({ ok: false, status: 500, code: 'relay_budget_error', detail: String(error?.message || error).slice(0, 160) }, { status: 500 });
    }
  }

  async load(tx) {
    return (await tx.get('budget')) || emptyBudgetState(this.env);
  }

  async reserve(payload) {
    const callId = typeof payload?.call_id === 'string' ? payload.call_id : '';
    const model = payload?.model;
    const estimated = numberOrNull(payload?.estimated_cost_usd);
    if (!/^[A-Za-z0-9._:-]{6,120}$/.test(callId) || !ALLOWED_MODELS.includes(model) || estimated === null || estimated < 0) {
      return { ok: false, status: 400, code: 'relay_budget_reserve_invalid' };
    }
    const at = typeof payload?.at === 'string' ? payload.at : new Date().toISOString();
    return this.state.storage.transaction(async tx => {
      const state = await this.load(tx);
      rollExpiredReservations(state, at);
      const refuse = (status, code, detail) => ({ ok: false, status, code, detail, snapshot: budgetSnapshot(state) });
      if (state.closed === true) return refuse(403, 'relay_seat_closed', state.closed_reason || 'the relay seat is closed');
      const base = numberOrNull(state.baseline?.balance_usd);
      if (base === null) return refuse(503, 'relay_balance_unverified', 'no confirmed balance is configured for the relay budget ledger');
      const totals = budgetTotals(state, at);
      const balance = round6(base - totals.spent_usd);
      if (balance < BALANCE_FLOOR_USD) {
        state.closed = true;
        state.closed_reason = 'balance_below_floor';
        state.closed_at = at;
        state.updated_at = at;
        await tx.put('budget', state);
        return refuse(403, 'relay_balance_below_floor', 'the confirmed balance is below the owner floor');
      }
      if (estimated > MAX_CALL_COST_USD) return refuse(403, 'relay_per_call_cap_exceeded', 'worst-case cost exceeds the per-call cap');
      if (round6(totals.daily_spent_usd + totals.daily_reserved_usd + estimated) > DAILY_COST_CAP_USD) {
        return refuse(429, 'relay_daily_cap_exceeded', 'this call would exceed the daily spend cap');
      }
      if (round6(totals.spent_usd + totals.reserved_usd + estimated) > PROJECT_COST_CAP_USD) {
        return refuse(429, 'relay_project_cap_exceeded', 'this call would exceed the project lifetime spend cap');
      }
      const availableAfter = round6(base - totals.spent_usd - totals.reserved_usd - estimated);
      if (availableAfter < BALANCE_FLOOR_USD) {
        return refuse(403, 'relay_balance_below_floor', 'reserving this call would push the available balance below the floor');
      }
      if (state.reservations[callId]) return { ok: true, status: 200, duplicate: true, call_id: callId, snapshot: budgetSnapshot(state) };
      state.reservations[callId] = {
        at,
        model,
        task_id: typeof payload?.task_id === 'string' ? payload.task_id : null,
        estimated_cost_usd: estimated,
        expires_at: new Date(Date.parse(at) + RESERVATION_TTL_MS).toISOString(),
      };
      state.updated_at = at;
      await tx.put('budget', state);
      return { ok: true, status: 200, duplicate: false, call_id: callId, snapshot: budgetSnapshot(state) };
    });
  }

  async settle(payload) {
    const callId = typeof payload?.call_id === 'string' ? payload.call_id : '';
    if (!/^[A-Za-z0-9._:-]{6,120}$/.test(callId)) return { ok: false, status: 400, code: 'relay_budget_settle_invalid' };
    const at = typeof payload?.at === 'string' ? payload.at : new Date().toISOString();
    const actual = numberOrNull(payload?.actual_cost_usd);
    return this.state.storage.transaction(async tx => {
      const state = await this.load(tx);
      rollExpiredReservations(state, at);
      const existingEntry = state.entries.find(entry => entry.call_id === callId);
      if (existingEntry) {
        if (state.reservations[callId]) delete state.reservations[callId];
        if (existingEntry.outcome === 'reservation_expired_assumed_spent' && actual !== null && actual > (numberOrNull(existingEntry.cost_usd) ?? 0)) {
          existingEntry.cost_usd = actual;
        }
        existingEntry.settled_at = at;
        existingEntry.upstream_http = Number.isFinite(Number(payload?.upstream_http)) ? Number(payload.upstream_http) : existingEntry.upstream_http;
        existingEntry.request_id = typeof payload?.request_id === 'string' ? payload.request_id : existingEntry.request_id;
        state.updated_at = at;
        await tx.put('budget', state);
        return { ok: true, status: 200, duplicate: true, call_id: callId, snapshot: budgetSnapshot(state) };
      }
      const reservation = state.reservations[callId];
      if (!reservation) return { ok: false, status: 404, code: 'relay_reservation_not_found', snapshot: budgetSnapshot(state) };
      const cost = actual === null ? reservation.estimated_cost_usd : actual;
      state.entries.push({
        at,
        call_id: callId,
        model: reservation.model,
        task_id: reservation.task_id ?? null,
        estimated_cost_usd: reservation.estimated_cost_usd,
        cost_usd: cost,
        prompt_tokens: numberOrNull(payload?.prompt_tokens),
        completion_tokens: numberOrNull(payload?.completion_tokens),
        upstream_http: Number.isFinite(Number(payload?.upstream_http)) ? Number(payload.upstream_http) : null,
        request_id: typeof payload?.request_id === 'string' ? payload.request_id : null,
        outcome: typeof payload?.outcome === 'string' ? payload.outcome.slice(0, 80) : 'completed',
        settled_at: at,
      });
      delete state.reservations[callId];
      const totals = budgetTotals(state, at);
      const base = numberOrNull(state.baseline?.balance_usd);
      if (base !== null && round6(base - totals.spent_usd) < BALANCE_FLOOR_USD) {
        state.closed = true;
        state.closed_reason = 'balance_below_floor_after_call';
        state.closed_at = at;
      }
      state.updated_at = at;
      await tx.put('budget', state);
      return { ok: true, status: 200, duplicate: false, call_id: callId, cost_usd: cost, snapshot: budgetSnapshot(state) };
    });
  }

  async confirm(payload) {
    const balance = numberOrNull(payload?.balance_usd);
    const confirmedBy = typeof payload?.confirmed_by === 'string' ? payload.confirmed_by.trim() : '';
    const basis = typeof payload?.basis === 'string' ? payload.basis.trim() : '';
    if (balance === null || balance < 0 || !confirmedBy || !basis) return { ok: false, status: 400, code: 'relay_budget_confirm_invalid' };
    const at = typeof payload?.at === 'string' ? payload.at : new Date().toISOString();
    return this.state.storage.transaction(async tx => {
      const state = await this.load(tx);
      rollExpiredReservations(state, at);
      const totals = budgetTotals(state, at);
      const prior = {
        baseline_usd: numberOrNull(state.baseline?.balance_usd),
        entries: state.entries.length,
        recorded_cost_usd: totals.spent_usd,
        closed_at: at,
      };
      state.prior_periods = [...(state.prior_periods || []), ...(state.baseline ? [prior] : [])].slice(-24);
      state.baseline = { balance_usd: balance, confirmed_at: at, confirmed_by: confirmedBy, source: basis };
      state.entries = [];
      state.closed = balance < BALANCE_FLOOR_USD;
      state.closed_reason = state.closed ? 'balance_below_floor' : null;
      state.closed_at = state.closed ? at : null;
      state.updated_at = at;
      await tx.put('budget', state);
      return { ok: true, status: 200, snapshot: budgetSnapshot(state) };
    });
  }
}

async function budgetRequest(env, path, body) {
  if (!env?.BUDGET?.idFromName) return { ok: false, status: 503, code: 'relay_budget_binding_missing' };
  try {
    const stub = env.BUDGET.get(env.BUDGET.idFromName('relay-budget-global'));
    const response = await stub.fetch(new Request('https://relay-budget.internal' + path, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { 'content-type': 'application/json' },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    }));
    return await response.json();
  } catch (error) {
    return { ok: false, status: 503, code: 'relay_budget_unavailable', detail: String(error?.message || error).slice(0, 120) };
  }
}

function budgetHeaders(result) {
  const snapshot = result?.snapshot || {};
  const headers = {
    'x-ltzzz-budget-reservation': String(result?.call_id || ''),
    'x-ltzzz-balance-after-usd': snapshot.balance_usd === null || snapshot.balance_usd === undefined ? '' : String(snapshot.balance_usd),
    'x-ltzzz-budget-daily-usd': String(snapshot.daily_spent_usd ?? ''),
    'x-ltzzz-budget-project-usd': String(snapshot.project_spent_usd ?? ''),
    'x-ltzzz-budget-settled': result?.ok === true ? '1' : '0',
  };
  if (typeof result?.cost_usd === 'number') headers['x-ltzzz-cost-usd'] = String(result.cost_usd);
  return headers;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, '');
    const budgetRoute = route.replace(/^\/v1(?=\/budget\/)/, '');
    const known = ['/v1/chat/completions', '/chat/completions', '/budget/confirm', '/budget/state'];
    if (!known.includes(route) && !known.includes(budgetRoute)) return json(404, 'proxy_route_not_found');
    const method = budgetRoute === '/budget/state' ? 'GET' : 'POST';
    if (request.method !== method) return json(405, 'proxy_method_not_allowed');
    if (!authorized(request, env.PROXY_ACCESS_TOKEN)) return json(401, 'proxy_unauthorized');

    if (budgetRoute === '/budget/state') return Response.json(await budgetRequest(env, '/state'));
    if (budgetRoute === '/budget/confirm') {
      let confirmBody;
      try {
        confirmBody = await request.json();
      } catch {
        return json(400, 'proxy_body_invalid');
      }
      const confirmed = await budgetRequest(env, '/confirm', confirmBody);
      return Response.json(confirmed, { status: confirmed.status && confirmed.status >= 400 ? confirmed.status : 200 });
    }

    const batch = request.headers.get('x-ltzzz-batch') === '1';
    const stationKey = String(env.RELAY_STATION_KEY ?? '').trim();
    if (!stationKey) return json(503, 'proxy_key_missing');
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, 'proxy_body_invalid');
    }
    const verdict = validateRequest(body, { batch });
    if (!verdict.ok) {
      return json(verdict.status, verdict.code, {
        estimated_input_tokens: verdict.estimated_input_tokens ?? null,
        worst_case_cost_usd: verdict.worst_case_cost_usd ?? null,
      });
    }

    // Atomic reservation before egress: per-call, daily, project and floor caps
    // are enforced even when the caller never ran the CLI seat guard.
    const callId = crypto.randomUUID();
    const reservation = await budgetRequest(env, '/reserve', {
      call_id: callId,
      model: body.model,
      estimated_cost_usd: verdict.worst_case_cost_usd,
      at: new Date().toISOString(),
    });
    if (!reservation.ok) {
      return json(reservation.status || 402, 'proxy_budget_refused_' + reservation.code, {
        budget: reservation.snapshot || null,
        detail: reservation.detail || null,
      });
    }

    const base = String(env.STATION_BASE || 'https://api.apisrouter.com/v1').replace(/\/$/, '');
    let upstream;
    let upstreamText = null;
    try {
      upstream = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + stationKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
      upstreamText = await upstream.text();
    } catch (error) {
      // The request may have reached the station; charge the worst case rather
      // than assuming it was free, and never retry it here.
      const settled = await budgetRequest(env, '/settle', {
        call_id: callId,
        actual_cost_usd: verdict.worst_case_cost_usd,
        upstream_http: null,
        outcome: 'proxy_upstream_unreachable',
        at: new Date().toISOString(),
      });
      return new Response(JSON.stringify({ error: { code: 'proxy_upstream_unreachable', detail: String(error?.name || 'Error') } }), {
        status: 504,
        headers: { 'content-type': 'application/json', 'x-ltzzz-relay-proxy': '1', ...budgetHeaders({ ...settled, call_id: callId }) },
      });
    }

    let parsed = null;
    try {
      parsed = JSON.parse(upstreamText);
    } catch {
      parsed = null;
    }
    const usage = parsed?.usage || {};
    const promptTokens = numberOrNull(usage.prompt_tokens ?? usage.input_tokens);
    const completionTokens = numberOrNull(usage.completion_tokens ?? usage.output_tokens);
    const actual = actualCostUsd({
      model: body.model,
      estimatedInputTokens: verdict.estimated_input_tokens,
      promptTokens,
      completionTokens,
    });
    const settled = await budgetRequest(env, '/settle', {
      call_id: callId,
      actual_cost_usd: actual === null ? verdict.worst_case_cost_usd : actual,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      upstream_http: upstream.status,
      request_id: typeof parsed?.id === 'string' ? parsed.id : null,
      outcome: upstream.ok ? 'completed' : 'upstream_http_' + upstream.status,
      at: new Date().toISOString(),
    });

    const headers = new Headers({ 'x-ltzzz-relay-proxy': '1' });
    for (const name of PASS_THROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    for (const [name, value] of Object.entries(budgetHeaders({ ...settled, call_id: callId }))) {
      if (value !== '') headers.set(name, value);
    }
    if (actual !== null) headers.set('x-ltzzz-cost-usd', String(actual));
    return new Response(upstreamText, { status: upstream.status, headers });
  },
};
