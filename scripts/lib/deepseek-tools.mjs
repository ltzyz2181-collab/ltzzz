// DeepSeek official web tools (Search / Fetch), read-only.
//
// Layered integration (2026-11-17): the main line (planner / card writing /
// routing) stays on deepseek-v4-pro. Only the new web tools are attached to
// the flash channel and to SOURCE-INTEL style research. This module never
// changes the model used by call-deepseek.mjs.
//
// Docs: POST https://api.deepseek.com/v1/tools/search
//       POST https://api.deepseek.com/v1/tools/fetch
// Pricing: per successful request (5 CNY / 1000), not per token or result.
import {createHash} from 'node:crypto';

export const TOOL_ENDPOINTS = Object.freeze({
  search: 'https://api.deepseek.com/v1/tools/search',
  fetch: 'https://api.deepseek.com/v1/tools/fetch',
});

export const LIMITS = Object.freeze({
  query_chars: 128,
  count_min: 1,
  count_max: 50,
  url_chars: 8192,
  search_qps: 100,
  fetch_qps: 25,
  max_result_content_chars: 200000,
  max_total_content_chars: 2000000,
});

export class DeepSeekToolError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'DeepSeekToolError';
    this.code = code;
    this.details = details;
  }
}

function charLength(value) {
  return Array.from(value).length;
}

function redact(text, apiKey) {
  const raw = String(text ?? '');
  return apiKey ? raw.split(apiKey).join('[REDACTED]') : raw;
}

function failure(code, message, extra = {}) {
  return {ok: false, status: code, error: message, sent: false, charged: false, ...extra};
}

function classifyStatus(status) {
  if (status === 402) return {retryable: false, code: 'insufficient_balance'};
  if (status === 408 || status === 429 || status >= 500) return {retryable: true, code: 'transient_upstream'};
  if (status === 401 || status === 403) return {retryable: false, code: 'auth_or_forbidden'};
  if (status === 400 || status === 404) return {retryable: false, code: 'invalid_request'};
  return {retryable: false, code: 'http_error'};
}

export function validateSearchQuery(query, {oriQuestion = null} = {}) {
  if (typeof query !== 'string' || !query.trim()) {
    throw new DeepSeekToolError('invalid_query', 'query is required and must not be blank');
  }
  const length = charLength(query.trim());
  if (length < 1 || length > LIMITS.query_chars) {
    throw new DeepSeekToolError('invalid_query', `query must be 1-${LIMITS.query_chars} Unicode characters`, {length});
  }
  if (oriQuestion !== null && oriQuestion !== undefined) {
    if (typeof oriQuestion !== 'string') throw new DeepSeekToolError('invalid_ori_question', 'ori_question must be a string');
    const originalLength = charLength(oriQuestion.trim());
    if (originalLength < 1 || originalLength > LIMITS.query_chars) {
      throw new DeepSeekToolError('invalid_ori_question', `ori_question must be 1-${LIMITS.query_chars} Unicode characters`, {length: originalLength});
    }
  }
  return query.trim();
}

export function normalizeCount(value) {
  if (value === undefined || value === null) return 10;
  const count = Number(value);
  if (!Number.isInteger(count) || count < LIMITS.count_min || count > LIMITS.count_max) {
    throw new DeepSeekToolError('invalid_count', `count must be an integer between ${LIMITS.count_min} and ${LIMITS.count_max}`, {count: value});
  }
  return count;
}

function isPrivateHost(hostname) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host.endsWith('.internal')) return true;
  if (host === '::1' || host === '0.0.0.0') return true;
  if (/^(fc|fd)[0-9a-f]{0,2}:/.test(host) || host.startsWith('fe80:')) return true;
  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!ipv4) return false;
  const [a, b] = ipv4.slice(1).map(Number);
  if (ipv4.slice(1).some(part => Number(part) > 255)) return true;
  return a === 0 || a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31) || (a === 169 && b === 254);
}

export function validateFetchUrl(raw) {
  if (typeof raw !== 'string' || !raw.trim()) throw new DeepSeekToolError('invalid_url', 'url is required');
  const value = raw.trim();
  if (value.length > LIMITS.url_chars) throw new DeepSeekToolError('invalid_url', `url must be at most ${LIMITS.url_chars} characters`, {length: value.length});
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new DeepSeekToolError('invalid_url', 'url must be a valid HTTP/HTTPS URL');
  }
  if (!['http:', 'https:'].includes(url.protocol)) throw new DeepSeekToolError('invalid_url', 'url must use http or https');
  if (!url.hostname) throw new DeepSeekToolError('invalid_url', 'url must include a host');
  if (url.username || url.password) throw new DeepSeekToolError('invalid_url', 'url must not carry a username or password');
  if (isPrivateHost(url.hostname)) throw new DeepSeekToolError('blocked_host', 'local, private and link-local hosts are refused', {host: url.hostname});
  return url;
}

function requestIdOf(headers) {
  if (!headers?.get) return null;
  for (const name of ['x-request-id', 'x-ds-request-id', 'request-id']) {
    const value = headers.get(name);
    if (value) return value;
  }
  return null;
}

async function postJson(endpoint, body, {apiKey, fetchImpl, timeoutMs}) {
  const response = await fetchImpl(endpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      accept: 'application/json',
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const text = await response.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return {response, json, text};
}

function upstreamFailure({response, json, text, apiKey, endpoint}) {
  const status = response?.status ?? null;
  const kind = classifyStatus(status);
  const providerMessage = json?.error?.message || json?.message || (typeof json?.error === 'string' ? json.error : null);
  return {
    ok: false,
    status: kind.code,
    error: redact(providerMessage || `HTTP ${status ?? 'unknown'}`, apiKey).slice(0, 300),
    http: status,
    retryable: kind.retryable,
    request_id: requestIdOf(response?.headers),
    endpoint,
    sent: true,
    charged: false,
    raw_length: typeof text === 'string' ? text.length : null,
  };
}

export async function searchWeb({
  query,
  count = 10,
  needContent = false,
  oriQuestion = null,
  localization = null,
  apiKey = process.env.DEEPSEEK_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
} = {}) {
  let normalizedQuery;
  let normalizedCount;
  let normalizedOriginal = null;
  try {
    normalizedQuery = validateSearchQuery(query, {oriQuestion});
    normalizedCount = normalizeCount(count);
    normalizedOriginal = oriQuestion == null ? null : String(oriQuestion).trim();
  } catch (error) {
    if (error instanceof DeepSeekToolError) return failure(error.code, error.message, {details: error.details});
    throw error;
  }
  if (localization !== null && localization !== undefined && localization !== '') {
    if (typeof localization !== 'string' || !/^\d{1,3}(\.\d{1,3}){3}$/.test(localization)) {
      return failure('invalid_localization', 'localization must be an IPv4 address when provided');
    }
  }
  if (!apiKey) return failure('not_configured', 'DEEPSEEK_API_KEY 未配置');
  if (typeof fetchImpl !== 'function') return failure('invalid_fetch', 'fetch implementation is required');

  const payload = {query: normalizedQuery, count: normalizedCount, need_content: Boolean(needContent)};
  if (normalizedOriginal) payload.ori_question = normalizedOriginal;
  if (localization) payload.localization = localization;

  let exchange;
  try {
    exchange = await postJson(TOOL_ENDPOINTS.search, payload, {apiKey, fetchImpl, timeoutMs});
  } catch (error) {
    return {
      ok: false,
      status: 'transport_error',
      error: redact(error?.message || 'search transport failed', apiKey).slice(0, 200),
      code: error?.cause?.code ?? error?.code ?? null,
      retryable: false,
      sent: true,
      charged: false,
      endpoint: TOOL_ENDPOINTS.search,
    };
  }
  if (!exchange.response.ok) return upstreamFailure({...exchange, apiKey, endpoint: TOOL_ENDPOINTS.search});
  const rawResults = exchange.json?.results;
  if (!Array.isArray(rawResults)) {
    return {
      ok: false,
      status: 'invalid_response',
      error: 'response has no results array',
      http: exchange.response.status,
      request_id: requestIdOf(exchange.response.headers),
      endpoint: TOOL_ENDPOINTS.search,
      sent: true,
      charged: false,
    };
  }

  const results = [];
  let dropped = 0;
  let totalContent = 0;
  for (const row of rawResults.slice(0, normalizedCount)) {
    let url = String(row?.url || '');
    try {
      const parsed = new URL(url);
      if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error('bad protocol');
    } catch {
      dropped += 1;
      continue;
    }
    let content = String(row?.content || '');
    if (content.length > LIMITS.max_result_content_chars) content = content.slice(0, LIMITS.max_result_content_chars);
    if (totalContent + content.length > LIMITS.max_total_content_chars) {
      content = content.slice(0, Math.max(0, LIMITS.max_total_content_chars - totalContent));
    }
    totalContent += content.length;
    results.push({
      title: String(row?.title || ''),
      url,
      snippet: String(row?.snippet || ''),
      summary: String(row?.summary || ''),
      content,
      site_name: row?.site_name ?? null,
      date: row?.date ?? null,
      authority: Number.isInteger(row?.authority) ? row.authority : -1,
      rerank_score: Number.isFinite(row?.rerank_score) ? row.rerank_score : null,
    });
  }

  return {
    ok: true,
    status: 'ok',
    endpoint: TOOL_ENDPOINTS.search,
    http: exchange.response.status,
    request_id: requestIdOf(exchange.response.headers),
    query: normalizedQuery,
    results,
    count: results.length,
    dropped,
    charged: results.length > 0,
    content_sha256: createHash('sha256').update(JSON.stringify(results)).digest('hex'),
  };
}

export async function fetchPage({
  url,
  apiKey = process.env.DEEPSEEK_API_KEY,
  fetchImpl = globalThis.fetch,
  timeoutMs = 30000,
} = {}) {
  let parsed;
  try {
    parsed = validateFetchUrl(url);
  } catch (error) {
    if (error instanceof DeepSeekToolError) return failure(error.code, error.message, {details: error.details});
    throw error;
  }
  if (!apiKey) return failure('not_configured', 'DEEPSEEK_API_KEY 未配置');
  if (typeof fetchImpl !== 'function') return failure('invalid_fetch', 'fetch implementation is required');

  let exchange;
  try {
    exchange = await postJson(TOOL_ENDPOINTS.fetch, {url: parsed.toString()}, {apiKey, fetchImpl, timeoutMs});
  } catch (error) {
    return {
      ok: false,
      status: 'transport_error',
      error: redact(error?.message || 'fetch transport failed', apiKey).slice(0, 200),
      code: error?.cause?.code ?? error?.code ?? null,
      retryable: false,
      sent: true,
      charged: false,
      endpoint: TOOL_ENDPOINTS.fetch,
    };
  }
  if (!exchange.response.ok) return upstreamFailure({...exchange, apiKey, endpoint: TOOL_ENDPOINTS.fetch});
  const content = typeof exchange.json?.content === 'string' ? exchange.json.content : '';
  if (!content.trim()) {
    return {
      ok: false,
      status: 'no_content',
      error: 'fetch returned no usable Markdown body',
      http: exchange.response.status,
      request_id: requestIdOf(exchange.response.headers),
      endpoint: TOOL_ENDPOINTS.fetch,
      sent: true,
      charged: false,
    };
  }
  return {
    ok: true,
    status: 'ok',
    endpoint: TOOL_ENDPOINTS.fetch,
    http: exchange.response.status,
    request_id: requestIdOf(exchange.response.headers),
    url: parsed.toString(),
    title: typeof exchange.json?.title === 'string' ? exchange.json.title : '',
    content,
    content_chars: content.length,
    charged: true,
    content_sha256: createHash('sha256').update(content).digest('hex'),
  };
}
