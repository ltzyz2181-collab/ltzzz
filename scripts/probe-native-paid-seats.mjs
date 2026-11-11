/**
 * probe-native-paid-seats.mjs — 原厂（官方）Anthropic / OpenAI 通道最小实测
 *
 * 目的：只回答一个问题——官方端点用仓库现有 Secret 能否真正生成。
 * 不复用中转站结论，不推断余额，不做多模型地毯式测试。
 * 每个厂商最多两次请求：一次目录读取（免费）、一次 max_tokens=16 的最小生成（付费极低）。
 *
 * 输出：knowledge/results/native-paid-seats/<run_id>.json 与 latest.json
 * 约束：不落任何密钥；错误信息截断；失败不影响退出码 0，结论以 JSON 字段为准。
 */
import fs from 'node:fs';
import path from 'node:path';

const TIMEOUT_MS = 60000;
const PING = 'ping';
const ANTHROPIC_BASE = 'https://api.anthropic.com';
const OPENAI_BASE = 'https://api.openai.com/v1';

function redact(text, keys) {
  let out = String(text ?? '');
  for (const k of keys) {
    if (typeof k === 'string' && k.length >= 8) out = out.split(k).join('[REDACTED]');
  }
  return out.slice(0, 400);
}

function classify(status, body, networkError) {
  if (networkError) {
    if (/timeout|aborted/i.test(String(networkError))) return 'timeout';
    return 'network_unreachable';
  }
  const text = String(body ?? '');
  if (/credit balance is too low|insufficient_quota|exceeded your current quota|billing/i.test(text)) {
    return status === 429 ? 'insufficient_quota' : 'insufficient_credits';
  }
  if (status === 401 || status === 403) return 'auth_rejected';
  if (status === 429) return 'rate_limited';
  if (status === 400 || status === 404) return 'request_rejected';
  if (status >= 500) return 'upstream_error';
  if (status >= 200 && status < 300) return 'ok';
  return 'unknown';
}

async function timed(fn) {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, latency_ms: Date.now() - started };
  } catch (e) {
    return { error: String(e?.name || 'ERROR') + ': ' + String(e?.message || e), latency_ms: Date.now() - started };
  }
}

function pickAnthropicModel(ids, override) {
  if (override && ids.includes(override)) return { model: override, source: 'env_override' };
  const haiku = ids.filter((x) => x.startsWith('claude-haiku-4-5')).sort().reverse();
  if (haiku[0]) return { model: haiku[0], source: 'catalogue_cheapest_haiku' };
  const sonnet = ids.filter((x) => x.startsWith('claude-sonnet-4-6')).sort().reverse();
  if (sonnet[0]) return { model: sonnet[0], source: 'catalogue_sonnet_fallback' };
  const any = ids.filter((x) => /^claude-(haiku|sonnet)-/.test(x)).sort().reverse();
  if (any[0]) return { model: any[0], source: 'catalogue_any_haiku_or_sonnet' };
  return { model: null, source: 'none_available' };
}

function pickOpenAIModel(ids, override) {
  if (override && ids.includes(override)) return { model: override, source: 'env_override' };
  const prefer = ['gpt-4o-mini', 'gpt-4.1-mini', 'gpt-5-mini', 'gpt-4o', 'gpt-4.1'];
  for (const p of prefer) if (ids.includes(p)) return { model: p, source: 'catalogue_preferred_mini' };
  const any = ids.filter((x) => /^(gpt|o\d|chatgpt)/.test(x) && !/instruct|audio|image|embed/i.test(x)).sort();
  if (any[0]) return { model: any[0], source: 'catalogue_any_text_model' };
  return { model: null, source: 'none_available' };
}

async function probeAnthropic(env) {
  const key = env.ANTHROPIC_API_KEY || '';
  const record = {
    provider: 'anthropic',
    official_base: ANTHROPIC_BASE,
    credential_binding: 'ANTHROPIC_API_KEY',
    key_present: Boolean(key),
    catalogue: null,
    generation: null,
    status: null,
    generation_verified: false
  };
  if (!key) {
    record.status = 'missing_secret';
    return record;
  }
  const list = await timed(() =>
    fetch(`${ANTHROPIC_BASE}/v1/models?limit=100`, {
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  );
  if (list.error) {
    record.catalogue = { ok: false, error_class: 'network_unreachable', error: redact(list.error, [key]), latency_ms: list.latency_ms };
    record.status = 'network_unreachable';
    return record;
  }
  const r = list.value;
  const text = await r.text().catch(() => '');
  const ids = (() => {
    try {
      const j = JSON.parse(text);
      return (Array.isArray(j.data) ? j.data : []).map((x) => x.id).filter((x) => typeof x === 'string');
    } catch {
      return [];
    }
  })();
  record.catalogue = {
    ok: r.ok,
    http: r.status,
    error_class: r.ok ? 'ok' : classify(r.status, text, null),
    error: r.ok ? null : redact(text, [key]),
    model_count: ids.length,
    model_ids: ids.slice(0, 30),
    latency_ms: list.latency_ms
  };
  if (!r.ok) {
    record.status = record.catalogue.error_class;
    return record;
  }

  const chosen = pickAnthropicModel(ids, env.NATIVE_ANTHROPIC_MODEL || '');
  if (!chosen.model) {
    record.status = 'catalogue_verified_no_generation_model';
    return record;
  }
  const gen = await timed(() =>
    fetch(`${ANTHROPIC_BASE}/v1/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: chosen.model, max_tokens: 16, messages: [{ role: 'user', content: PING }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  );
  if (gen.error) {
    record.generation = { ok: false, model: chosen.model, model_source: chosen.source, error_class: 'network_unreachable', error: redact(gen.error, [key]), latency_ms: gen.latency_ms };
    record.status = 'network_unreachable';
    return record;
  }
  const g = gen.value;
  const gtext = await g.text().catch(() => '');
  let body = null;
  try {
    body = JSON.parse(gtext);
  } catch {
    body = null;
  }
  const out = (body?.content || [])
    .filter((x) => x?.type === 'text')
    .map((x) => x.text)
    .join('')
    .trim();
  const usage = body?.usage || {};
  const inputTokens = Number.isSafeInteger(usage.input_tokens) ? usage.input_tokens : null;
  record.generation = {
    ok: g.ok && Boolean(out),
    http: g.status,
    model: chosen.model,
    model_source: chosen.source,
    actual_model: typeof body?.model === 'string' ? body.model : null,
    finish_reason: body?.stop_reason || null,
    output: out.slice(0, 200),
    usage: { input_tokens: inputTokens, output_tokens: Number.isSafeInteger(usage.output_tokens) ? usage.output_tokens : null },
    provider_request_id: g.headers.get('request-id') || body?.id || null,
    // 一句 ping 的输入 token 若远超个位数，说明上游注入了隐藏前缀（中转站特征）
    input_token_inflation: inputTokens !== null && inputTokens > 200,
    error_class: g.ok ? (out ? 'ok' : 'empty_output') : classify(g.status, gtext, null),
    error: g.ok ? null : redact(gtext, [key]),
    latency_ms: gen.latency_ms
  };
  record.status = record.generation.error_class;
  record.generation_verified = record.generation.ok === true;
  return record;
}

async function probeOpenAI(env) {
  const key = env.OPENAI_API_KEY || '';
  const record = {
    provider: 'openai',
    official_base: OPENAI_BASE,
    credential_binding: 'OPENAI_API_KEY',
    key_present: Boolean(key),
    catalogue: null,
    generation: null,
    status: null,
    generation_verified: false
  };
  if (!key) {
    record.status = 'missing_secret';
    return record;
  }
  const list = await timed(() =>
    fetch(`${OPENAI_BASE}/models`, {
      headers: { authorization: 'Bearer ' + key },
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  );
  if (list.error) {
    record.catalogue = { ok: false, error_class: 'network_unreachable', error: redact(list.error, [key]), latency_ms: list.latency_ms };
    record.status = 'network_unreachable';
    return record;
  }
  const r = list.value;
  const text = await r.text().catch(() => '');
  const ids = (() => {
    try {
      const j = JSON.parse(text);
      return (Array.isArray(j.data) ? j.data : []).map((x) => x.id).filter((x) => typeof x === 'string');
    } catch {
      return [];
    }
  })();
  record.catalogue = {
    ok: r.ok,
    http: r.status,
    error_class: r.ok ? 'ok' : classify(r.status, text, null),
    error: r.ok ? null : redact(text, [key]),
    model_count: ids.length,
    model_ids: ids.slice(0, 30),
    latency_ms: list.latency_ms
  };
  if (!r.ok) {
    record.status = record.catalogue.error_class;
    return record;
  }

  const chosen = pickOpenAIModel(ids, env.NATIVE_OPENAI_MODEL || '');
  if (!chosen.model) {
    record.status = 'catalogue_verified_no_generation_model';
    return record;
  }
  // 部分新模型只接受 max_completion_tokens；先按 max_tokens 请求，400 时换字段重试一次。
  let gen = await timed(() =>
    fetch(`${OPENAI_BASE}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
      body: JSON.stringify({ model: chosen.model, max_tokens: 16, messages: [{ role: 'user', content: PING }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS)
    })
  );
  let gtext = '';
  if (!gen.error) {
    gtext = await gen.value.text().catch(() => '');
    if (gen.value.status === 400 && /max_tokens|max_completion_tokens/i.test(gtext)) {
      gen = await timed(() =>
        fetch(`${OPENAI_BASE}/chat/completions`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', authorization: 'Bearer ' + key },
          body: JSON.stringify({ model: chosen.model, max_completion_tokens: 16, messages: [{ role: 'user', content: PING }] }),
          signal: AbortSignal.timeout(TIMEOUT_MS)
        })
      );
      gtext = gen.error ? '' : await gen.value.text().catch(() => '');
    }
  }
  if (gen.error) {
    record.generation = { ok: false, model: chosen.model, model_source: chosen.source, error_class: 'network_unreachable', error: redact(gen.error, [key]), latency_ms: gen.latency_ms };
    record.status = 'network_unreachable';
    return record;
  }
  const g = gen.value;
  let body = null;
  try {
    body = JSON.parse(gtext);
  } catch {
    body = null;
  }
  const out = String(body?.choices?.[0]?.message?.content || '').trim();
  const usage = body?.usage || {};
  const inputTokens = Number.isSafeInteger(usage.prompt_tokens) ? usage.prompt_tokens : null;
  record.generation = {
    ok: g.ok && Boolean(out),
    http: g.status,
    model: chosen.model,
    model_source: chosen.source,
    actual_model: typeof body?.model === 'string' ? body.model : null,
    finish_reason: body?.choices?.[0]?.finish_reason || null,
    output: out.slice(0, 200),
    usage: { input_tokens: inputTokens, output_tokens: Number.isSafeInteger(usage.completion_tokens) ? usage.completion_tokens : null },
    provider_request_id: body?.id || g.headers.get('x-request-id') || null,
    input_token_inflation: inputTokens !== null && inputTokens > 200,
    error_class: g.ok ? (out ? 'ok' : 'empty_output') : classify(g.status, gtext, null),
    error: g.ok ? null : redact(gtext, [key]),
    latency_ms: gen.latency_ms
  };
  record.status = record.generation.error_class;
  record.generation_verified = record.generation.ok === true;
  return record;
}

async function main() {
  const env = process.env;
  const runId = env.GITHUB_RUN_ID || 'local-' + Date.now();
  const [anthropic, openai] = await Promise.all([probeAnthropic(env), probeOpenAI(env)]);
  const report = {
    schema_version: 'ltzzz.native-paid-seat-probe.v1',
    observed_at_utc: new Date().toISOString(),
    run_id: runId,
    source_commit: env.GITHUB_SHA || null,
    vantage: 'GitHub Actions runner; official provider endpoints only; no relay',
    probe_shape: { max_tokens: 16, prompt_chars: PING.length, timeout_ms: TIMEOUT_MS },
    seats: { claude: anthropic, gpt: openai },
    conclusion: {
      claude_native_generation_verified: anthropic.generation_verified,
      gpt_native_generation_verified: openai.generation_verified,
      both_verified: anthropic.generation_verified && openai.generation_verified,
      relay_results_not_reused: true
    },
    secrets_printed: false,
    financial_actions: 0
  };
  const dir = path.join('knowledge', 'results', 'native-paid-seats');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, runId + '.json'), JSON.stringify(report, null, 2) + '\n');
  fs.writeFileSync(path.join(dir, 'latest.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(
    JSON.stringify({
      run_id: runId,
      claude: { status: anthropic.status, http: anthropic.generation?.http ?? null, verified: anthropic.generation_verified },
      gpt: { status: openai.status, http: openai.generation?.http ?? null, verified: openai.generation_verified }
    })
  );
}

main().catch((e) => {
  console.error(JSON.stringify({ status: 'probe_runtime_error', error: String(e?.message || e).slice(0, 200) }));
  process.exitCode = 0;
});
