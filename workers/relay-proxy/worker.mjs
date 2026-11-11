// LTZZZ relay proxy: the only component that holds the station key.
// Seats authenticate with a proxy token and never see the upstream key.
export const ALLOWED_MODELS = [
  'claude-opus-5-5',
  'claude-opus-5',
  'claude-sonnet-4-6',
  'claude-haiku-5-5',
  'gpt-6.1-sol',
];
export const MIN_INPUT_TOKENS = 4096;
export const MAX_INPUT_TOKENS = 1100000;

export function estimateTokens(text) {
  const value = String(text ?? '');
  let cjk = 0;
  let other = 0;
  for (const ch of value) {
    if (/[\u3000-\u9fff\uf900-\ufaff\uff00-\uffef]/.test(ch)) cjk += 1;
    else other += 1;
  }
  return cjk + Math.ceil(other / 4);
}

function messageText(messages) {
  return messages
    .map((message) => (typeof message?.content === 'string' ? message.content : JSON.stringify(message?.content ?? '')))
    .join('\n');
}

export function validateRequest(body) {
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
  if (estimated < MIN_INPUT_TOKENS) {
    return { ok: false, status: 400, code: 'proxy_short_request_forbidden', estimated_input_tokens: estimated };
  }
  if (estimated > MAX_INPUT_TOKENS) {
    return { ok: false, status: 413, code: 'proxy_context_too_large', estimated_input_tokens: estimated };
  }
  const maxTokens = body.max_tokens === undefined ? null : Number(body.max_tokens);
  if (maxTokens !== null && (!Number.isSafeInteger(maxTokens) || maxTokens < 1 || maxTokens > 32768)) {
    return { ok: false, status: 400, code: 'proxy_max_tokens_invalid' };
  }
  return { ok: true, model: body.model, estimated_input_tokens: estimated };
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

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const route = url.pathname.replace(/\/+$/, '');
    if (!['/v1/chat/completions', '/chat/completions'].includes(route)) return json(404, 'proxy_route_not_found');
    if (request.method !== 'POST') return json(405, 'proxy_method_not_allowed');
    if (!authorized(request, env.PROXY_ACCESS_TOKEN)) return json(401, 'proxy_unauthorized');
    const stationKey = String(env.RELAY_STATION_KEY ?? '').trim();
    if (!stationKey) return json(503, 'proxy_key_missing');
    let body;
    try {
      body = await request.json();
    } catch {
      return json(400, 'proxy_body_invalid');
    }
    const verdict = validateRequest(body);
    if (!verdict.ok) return json(verdict.status, verdict.code, { estimated_input_tokens: verdict.estimated_input_tokens ?? null });
    const base = String(env.STATION_BASE || 'https://api.apisrouter.com/v1').replace(/\/$/, '');
    let upstream;
    try {
      upstream = await fetch(base + '/chat/completions', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + stationKey },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120000),
      });
    } catch (error) {
      return json(504, 'proxy_upstream_unreachable', { detail: String(error?.name || 'Error') });
    }
    const headers = new Headers({ 'x-ltzzz-relay-proxy': '1' });
    for (const name of PASS_THROUGH_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) headers.set(name, value);
    }
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
    return new Response(upstream.body, { status: upstream.status, headers });
  },
};
