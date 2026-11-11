import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {
  loadPolicy,
  estimateInputTokens,
  evaluateRelayCall,
  costUsd,
  billedPromptTokens,
  deriveBalance,
  readSeatState,
  readLedger,
  seatStatusOf,
  closeRelaySeat,
  openRelaySeat,
  appendSpend,
  setConfirmedBalance,
} from './lib/relay-seat-guard.mjs';

const root = process.cwd();
const argv = process.argv.slice(2);

function flag(name, fallback = null) {
  const index = argv.indexOf('--' + name);
  if (index === -1) return fallback;
  const value = argv[index + 1];
  return value && !value.startsWith('--') ? value : true;
}

function stamp() {
  return new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
}

function loadKey(policy) {
  const fromEnv = process.env[policy.station.key_env];
  if (fromEnv && fromEnv.trim()) return { key: fromEnv.trim(), raw: fromEnv };
  const file = path.join(root, policy.station.local_key_file);
  if (fs.existsSync(file)) {
    const raw = fs.readFileSync(file, 'utf8');
    return { key: raw.trim(), raw };
  }
  return null;
}

function fingerprint(key) {
  return 'sha256:16=' + crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
}

function requestIdFrom(headers, payload) {
  for (const name of ['x-request-id', 'x-oneapi-request-id', 'request-id', 'x-upstream-request-id']) {
    const value = headers?.get ? headers.get(name) : null;
    if (value) return { id: value, source: 'header:' + name };
  }
  if (payload && payload.id) return { id: String(payload.id), source: 'body:id' };
  return { id: null, source: null };
}

function resolveTransport(policy) {
  const boundary = policy.access_boundary || {};
  const proxyEnv = boundary.proxy_env || 'LTZZZ_RELAY_PROXY_URL';
  const proxyUrl = process.env[proxyEnv] || boundary.proxy_url || null;
  if (proxyUrl) {
    // The proxy access token is a scoped gateway credential, never the station key.
    const tokenEnv = boundary.proxy_token_env || 'LTZZZ_RELAY_PROXY_TOKEN';
    const proxyToken = process.env[tokenEnv] || '';
    return {
      mode: 'ltzzz_proxy',
      url: String(proxyUrl).replace(/\/$/, '') + '/chat/completions',
      headers: proxyToken ? { 'x-ltzzz-seat-token': proxyToken } : {},
      fingerprint: null,
      boundaryException: false,
    };
  }
  // The owner ruling keeps the station key in a server secret: a seat may not hold it directly.
  const directAllowed = boundary.seat_direct_key_allowed === true || flag('direct-key', false) === true;
  if (!directAllowed) throw new Error('relay_direct_key_forbidden');
  const key = loadKey(policy);
  if (!key) throw new Error('relay_key_missing_env_or_local_file');
  return {
    mode: 'direct_station_key_dev_exception',
    url: policy.station.base_url.replace(/\/$/, '') + '/chat/completions',
    headers: { Authorization: 'Bearer ' + key.key },
    fingerprint: fingerprint(key.raw),
    boundaryException: true,
  };
}

function writeEvidence(file, payload) {
  const target = path.join(root, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(payload, null, 2) + '\n');
  return file;
}

function currentSeat(policy) {
  const state = readSeatState(root, policy);
  const ledger = readLedger(root, policy);
  return { state, ledger, status: seatStatusOf(state), balance: deriveBalance(ledger) };
}

function print(value) {
  process.stdout.write(JSON.stringify(value, null, 2) + '\n');
}

async function callModel(policy) {
  const model = String(flag('model', 'claude-opus-5-5'));
  const requestedAgent = String(flag('requested-agent', policy.executor.default_requested_agent));
  const batch = flag('batch', false) === true;
  const maxTokens = Number(flag('max-tokens', 128));
  const promptFile = flag('prompt-file', null);
  if (!promptFile || promptFile === true) throw new Error('relay_prompt_file_required');
  const promptPath = path.resolve(root, String(promptFile));
  if (!fs.existsSync(promptPath)) throw new Error('relay_prompt_file_not_found');
  const prompt = fs.readFileSync(promptPath, 'utf8');
  const promptSha = crypto.createHash('sha256').update(prompt).digest('hex');
  const inputTokens = estimateInputTokens(prompt);

  const purpose = String(flag('purpose', 'generation'));
  if (!['generation', 'acceptance_probe'].includes(purpose)) throw new Error('relay_purpose_invalid');
  if (purpose === 'generation') {
    const verdictPath = path.join(root, policy.access_boundary?.acceptance_verdict || 'knowledge/results/relay-seat/acceptance-verdict.json');
    let verdict = null;
    try {
      verdict = JSON.parse(fs.readFileSync(verdictPath, 'utf8'));
    } catch {
      verdict = null;
    }
    if (!verdict || verdict.verdict !== 'accepted') {
      const decision = {
        allowed: false,
        code: 'relay_acceptance_not_passed',
        detail: 'generation output requires an accepted relay acceptance verdict; run node scripts/relay-seat-acceptance.mjs',
        sent_http_request: false,
        requires_close: false,
        acceptance_verdict: verdict?.verdict ?? 'missing',
      };
      const evidence = writeEvidence('knowledge/results/relay-seat/refusals/' + stamp() + '-' + requestedAgent + '.json', {
        schema_version: 1,
        kind: 'relay_seat_refusal',
        policy_id: policy.policy_id,
        at: new Date().toISOString(),
        requested_agent: requestedAgent,
        purpose,
        station_model: model,
        decision,
        prompt: { chars: prompt.length, estimated_input_tokens: inputTokens, sha256: promptSha },
        sent_http_request: false,
        key_transport: 'not_used_before_http',
        key_fingerprint: null,
      });
      print({ ok: false, status: 'refused_before_http', decision, evidence });
      process.exitCode = 2;
      return;
    }
  }

  const { status, balance } = currentSeat(policy);
  const decision = evaluateRelayCall({ policy, model, inputTokens, batch, balanceUsd: balance, seatStatus: status });

  if (!decision.allowed && decision.requires_close) {
    closeRelaySeat(root, policy, {
      balanceUsd: balance,
      reason: decision.code,
      detail: decision.detail,
      actor: 'relay_seat_guard',
    });
  }
  if (!decision.allowed) {
    const at = new Date().toISOString();
    const evidence = writeEvidence('knowledge/results/relay-seat/refusals/' + stamp() + '-' + requestedAgent + '.json', {
      schema_version: 1,
      kind: 'relay_seat_refusal',
      policy_id: policy.policy_id,
      at,
      requested_agent: requestedAgent,
      purpose,
      station_model: model,
      decision,
      prompt: { chars: prompt.length, estimated_input_tokens: inputTokens, sha256: promptSha },
      sent_http_request: false,
      key_transport: 'not_used_before_http',
      key_fingerprint: null,
    });
    print({ ok: false, status: 'refused_before_http', decision, evidence });
    process.exitCode = 2;
    return;
  }

  const transport = resolveTransport(policy);
  const url = transport.url;
  const requestedAt = new Date().toISOString();
  const started = Date.now();
  const maxAttempts = Math.max(1, Math.min(3, Number(flag('attempts', 2)) || 1));
  const attemptLog = [];
  let http = null;
  let payload = null;
  let failure = null;
  let responseHeaders = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const attemptStart = Date.now();
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...transport.headers },
        body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens, temperature: 0 }),
        signal: AbortSignal.timeout(120000),
      });
      http = response.status;
      responseHeaders = response.headers;
      const text = await response.text();
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { unparsed_length: text.length };
      }
      attemptLog.push({ attempt, http, duration_ms: Date.now() - attemptStart, failure: null });
      break;
    } catch (error) {
      const cause = error?.cause || {};
      failure = {
        name: error?.name || 'Error',
        message: String(error?.message || error).slice(0, 200),
        code: cause.code ?? null,
        cause_message: String(cause.message ?? '').slice(0, 200) || null,
      };
      attemptLog.push({ attempt, http: null, duration_ms: Date.now() - attemptStart, failure });
      const retryable = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ENOTFOUND', 'EAI_AGAIN'].includes(cause.code ?? '');
      // Retry only when no HTTP response arrived, so the same billed request is never replayed knowingly.
      if (!retryable || attempt >= maxAttempts) break;
      await new Promise((resolve) => setTimeout(resolve, 3000));
      failure = null;
    }
  }
  const durationMs = Date.now() - started;
  const choice = payload?.choices?.[0];
  const content = typeof choice?.message?.content === 'string' ? choice.message.content : '';
  const usage = payload?.usage || {};
  const promptTokens = usage.prompt_tokens ?? usage.input_tokens ?? null;
  const completionTokens = usage.completion_tokens ?? usage.output_tokens ?? null;
  const finishReason = choice?.finish_reason ?? payload?.stop_reason ?? null;
  const ok = http === 200 && content.trim().length > 0 && !['length', 'content_filter'].includes(finishReason);
  const billedPrompt = ok ? billedPromptTokens(promptTokens, inputTokens) : null;
  const cost = ok ? costUsd(policy, model, billedPrompt, completionTokens) : null;

  const insufficient = /insufficient|balance|quota|credit|额度|余额/i.test(
    String(payload?.error?.message || payload?.error || failure?.message || ''),
  );
  let balanceAfter = balance;
  let seatAfter = status;
  if (ok && cost !== null) {
    try {
      const recorded = appendSpend(root, policy, {
        model,
        cost,
        promptTokens: billedPrompt,
        completionTokens,
        evidence: 'knowledge/results/relay-seat/calls',
      });
      balanceAfter = recorded.balance_usd;
    } catch (error) {
      failure = { name: 'ledger_write_failed', message: String(error?.message || error).slice(0, 200) };
    }
  }
  if (ok && balanceAfter !== null && balanceAfter < policy.balance_guard.floor_usd) {
    const state = closeRelaySeat(root, policy, {
      balanceUsd: balanceAfter,
      reason: 'balance_below_floor_after_call',
      detail: 'post-call balance fell under the owner floor',
      actor: 'relay_seat_executor',
    });
    seatAfter = state.status;
  } else if (insufficient) {
    const state = closeRelaySeat(root, policy, {
      balanceUsd: balanceAfter,
      reason: 'provider_insufficient_balance',
      detail: 'the station reported an insufficient balance or quota error',
      actor: 'relay_seat_executor',
    });
    seatAfter = state.status;
  }

  const requestId = requestIdFrom(responseHeaders, payload);
  const servedModel = typeof payload?.model === 'string' ? payload.model : null;
  const servedName = String(servedModel || model);
  const modelClass = /^claude/i.test(servedName) ? 'claude' : /^gpt/i.test(servedName) ? 'gpt' : 'other';

  const evidence = writeEvidence(
    'knowledge/results/relay-seat/calls/' + stamp() + '-' + requestedAgent + '-' + model + '-' + promptSha.slice(0, 8) + '.json',
    {
      schema_version: 1,
      kind: 'relay_seat_call',
      policy_id: policy.policy_id,
      at: new Date().toISOString(),
      requested_at: requestedAt,
      responded_at: new Date().toISOString(),
      request_id: requestId.id,
      request_id_source: requestId.source,
      requested_agent: requestedAgent,
      purpose,
      generation_output: purpose === 'generation',
      executed_by: 'apisrouter_relay',
      station: policy.station.name,
      station_kind: policy.station.kind,
      official_provider_api: false,
      station_model: model,
      model_served: servedModel,
      model_tier: decision.model_tier,
      model_class: modelClass,
      routing: {
        requested_model: model,
        served_model: servedModel,
        station: policy.station.name,
        upstream_hint: payload?.system_fingerprint ?? responseHeaders?.get?.('x-upstream-model') ?? null,
      },
      key_transport: transport.mode,
      boundary_exception: transport.boundaryException,
      effects: {
        business_task_completed: false,
        authority_effect: 'none',
        funds_or_signature_surface: false,
        production_write: false,
      },
      max_tokens: maxTokens,
      batch,
      prompt: { chars: prompt.length, estimated_input_tokens: inputTokens, sha256: promptSha },
      http,
      duration_ms: durationMs,
      ok,
      finish_reason: finishReason,
      usage: {
        prompt_tokens_reported: promptTokens,
        prompt_tokens_billed: billedPrompt,
        usage_source: promptTokens && promptTokens > 0 ? 'reported' : 'estimated_floor',
        completion_tokens: completionTokens,
        total_tokens: usage.total_tokens ?? null,
      },
      cost_usd: cost,
      balance_before_usd: balance,
      balance_after_usd: balanceAfter,
      seat_state_before: status,
      seat_state_after: seatAfter,
      guard: { code: decision.code, routing_reason: decision.routing_reason ?? null },
      attempts: attemptLog,
      retry_policy: 'retry only when no HTTP response arrived; a request that reached the station is never replayed',
      reply: { chars: content.length, preview: content.slice(0, 160) },
      key_fingerprint: transport.fingerprint,
      failure,
      http_error: http !== null && http !== 200 ? payload?.error ?? payload : null,
    },
  );

  print({
    ok,
    http,
    duration_ms: durationMs,
    model,
    requested_agent: requestedAgent,
    finish_reason: finishReason,
    usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    cost_usd: cost,
    balance_after_usd: balanceAfter,
    seat_state: seatAfter,
    reply_preview: content.slice(0, 120),
    evidence,
    failure,
  });
  process.exitCode = ok ? 0 : 3;
}

function setBalance(policy) {
  const value = Number(flag('balance', 'NaN'));
  const actor = flag('confirmed-by', null);
  const basis = flag('basis', null);
  const note = flag('note', null);
  if (!Number.isFinite(value)) throw new Error('relay_balance_value_required');
  if (!actor || actor === true) throw new Error('relay_balance_confirmed_by_required');
  if (!basis || basis === true) throw new Error('relay_balance_basis_required');
  const result = setConfirmedBalance(root, policy, {
    balanceUsd: value,
    actor: String(actor),
    basis: String(basis),
    note: note && note !== true ? String(note) : null,
  });
  if (result.balance_usd < policy.balance_guard.floor_usd) {
    const state = closeRelaySeat(root, policy, {
      balanceUsd: result.balance_usd,
      reason: 'balance_below_floor',
      detail: 'confirmed balance is under the owner floor',
      actor: String(actor),
    });
    print({ ok: true, balance_usd: result.balance_usd, seat_state: state.status, ledger: policy.balance_guard.ledger_path, state_file: policy.balance_guard.state_path });
    return;
  }
  const state = openRelaySeat(root, policy, {
    balanceUsd: result.balance_usd,
    actor: String(actor),
    basis: String(basis),
  });
  print({ ok: true, balance_usd: result.balance_usd, seat_state: state.status, ledger: policy.balance_guard.ledger_path, state_file: policy.balance_guard.state_path });
}

function showState(policy) {
  const { state, status, balance } = currentSeat(policy);
  print({
    policy_id: policy.policy_id,
    station: policy.station.name,
    floor_usd: policy.balance_guard.floor_usd,
    min_input_tokens: policy.routing.min_input_tokens,
    allowlist: policy.routing.allowlist.map((entry) => entry.model),
    seat_status: status,
    balance_usd_estimate: balance,
    state,
    key_fingerprint: (() => {
      const key = loadKey(policy);
      return key ? fingerprint(key.raw) : null;
    })(),
  });
}

function main() {
  const policy = loadPolicy(root);
  if (argv.includes('--state')) return showState(policy);
  if (argv.includes('--set-balance')) return setBalance(policy);
  if (argv.includes('--call')) return callModel(policy);
  print({ ok: false, usage: 'node scripts/relay-seat.mjs --state | --set-balance --balance <usd> --confirmed-by <actor> --basis <text> | --call --prompt-file <file> [--model <allowlisted>] [--requested-agent deepseek] [--batch] [--max-tokens <n>]' });
  process.exitCode = 2;
}

try {
  await main();
} catch (error) {
  print({ ok: false, error: String(error?.message || error) });
  process.exitCode = 2;
}
