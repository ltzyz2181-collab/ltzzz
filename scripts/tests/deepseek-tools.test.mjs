import test from 'node:test';
import assert from 'node:assert/strict';
import {
  searchWeb,
  fetchPage,
  validateSearchQuery,
  validateFetchUrl,
  normalizeCount,
  TOOL_ENDPOINTS,
  LIMITS,
} from '../lib/deepseek-tools.mjs';

const KEY = 'sk-test-secret-value';

function mockResponse({status = 200, body = null, text = null, headers = {}}) {
  const payload = text !== null ? text : JSON.stringify(body ?? {});
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {get: name => headers[name.toLowerCase()] ?? headers[name] ?? null},
    async text() { return payload; },
  };
}

function recorder(response) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({url, init, body: JSON.parse(init.body)});
    return typeof response === 'function' ? response(url, init) : response;
  };
  return {calls, fetchImpl};
}

test('search sends the documented request shape and normalizes results', async () => {
  const {calls, fetchImpl} = recorder(mockResponse({body: {results: [
    {rerank_score: 2.4, title: 'T', url: 'https://example.com/a', snippet: 'S', summary: 'L', content: 'C', site_name: 'E', date: '2026-06-01T00:00:00+00:00', authority: 3},
  ]}, headers: {'x-request-id': 'req-1'}}));
  const result = await searchWeb({query: 'DeepSeek V4', count: 5, needContent: true, oriQuestion: 'what is new', apiKey: KEY, fetchImpl});
  assert.equal(result.ok, true);
  assert.equal(result.charged, true);
  assert.equal(result.request_id, 'req-1');
  assert.equal(result.results[0].title, 'T');
  assert.equal(result.results[0].authority, 3);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, TOOL_ENDPOINTS.search);
  assert.equal(calls[0].init.headers.authorization, 'Bearer ' + KEY);
  assert.deepEqual(calls[0].body, {query: 'DeepSeek V4', count: 5, need_content: true, ori_question: 'what is new'});
});

test('search refuses blank and over-long queries before any fetch', async () => {
  const {calls, fetchImpl} = recorder(mockResponse({body: {results: []}}));
  for (const query of ['', '   ', 'x'.repeat(LIMITS.query_chars + 1)]) {
    const result = await searchWeb({query, apiKey: KEY, fetchImpl});
    assert.equal(result.ok, false, query.slice(0, 10));
    assert.equal(result.status, 'invalid_query');
    assert.equal(result.sent, false);
  }
  assert.equal(calls.length, 0);
  assert.throws(() => validateSearchQuery(''), /query is required/);
});

test('count is bounded 1-50 and defaults to 10', async () => {
  assert.equal(normalizeCount(undefined), 10);
  assert.equal(normalizeCount(1), 1);
  assert.equal(normalizeCount(50), 50);
  for (const bad of [0, 51, 1.5, 'x']) {
    const {calls, fetchImpl} = recorder(mockResponse({body: {results: []}}));
    const result = await searchWeb({query: 'q', count: bad, apiKey: KEY, fetchImpl});
    assert.equal(result.status, 'invalid_count', String(bad));
    assert.equal(calls.length, 0);
  }
});

test('search maps 429 to retryable and 402 to insufficient balance', async () => {
  for (const [status, code, retryable] of [[429, 'transient_upstream', true], [500, 'transient_upstream', true], [402, 'insufficient_balance', false], [403, 'auth_or_forbidden', false]]) {
    const {fetchImpl} = recorder(mockResponse({status, body: {error: {message: 'upstream says no'}}}));
    const result = await searchWeb({query: 'q', apiKey: KEY, fetchImpl});
    assert.equal(result.ok, false, String(status));
    assert.equal(result.status, code, String(status));
    assert.equal(result.retryable, retryable, String(status));
    assert.equal(result.charged, false);
  }
});

test('empty results are a successful search and are not charged', async () => {
  const {fetchImpl} = recorder(mockResponse({body: {results: []}}));
  const result = await searchWeb({query: 'nothing', apiKey: KEY, fetchImpl});
  assert.equal(result.ok, true);
  assert.equal(result.count, 0);
  assert.equal(result.charged, false);
});

test('non-http result URLs are dropped', async () => {
  const {fetchImpl} = recorder(mockResponse({body: {results: [
    {title: 'bad', url: 'file:///etc/passwd'},
    {title: 'good', url: 'https://example.com/ok'},
  ]}}));
  const result = await searchWeb({query: 'q', apiKey: KEY, fetchImpl});
  assert.equal(result.count, 1);
  assert.equal(result.dropped, 1);
  assert.equal(result.results[0].title, 'good');
});

test('upstream error text is redacted and never echoes the key', async () => {
  const {fetchImpl} = recorder(mockResponse({status: 401, body: {error: {message: 'bad key ' + KEY}}}));
  const result = await searchWeb({query: 'q', apiKey: KEY, fetchImpl});
  assert.equal(result.ok, false);
  assert.equal(JSON.stringify(result).includes(KEY), false);
});

test('missing api key refuses before fetch', async () => {
  const {calls, fetchImpl} = recorder(mockResponse({body: {results: []}}));
  const result = await searchWeb({query: 'q', apiKey: '', fetchImpl});
  assert.equal(result.status, 'not_configured');
  assert.equal(calls.length, 0);
});

test('fetch sends the documented url and returns Markdown content', async () => {
  const {calls, fetchImpl} = recorder(mockResponse({body: {title: 'Article', content: '# Article\n\nBody'}}));
  const result = await fetchPage({url: 'https://example.com/article', apiKey: KEY, fetchImpl});
  assert.equal(result.ok, true);
  assert.equal(result.title, 'Article');
  assert.match(result.content, /^# Article/);
  assert.equal(result.charged, true);
  assert.equal(calls[0].url, TOOL_ENDPOINTS.fetch);
  assert.deepEqual(calls[0].body, {url: 'https://example.com/article'});
});

test('fetch refuses local, private and credential-bearing URLs before any fetch', async () => {
  const bad = [
    'file:///etc/passwd',
    'http://user:pass@example.com/a',
    'http://localhost/a',
    'http://127.0.0.1/a',
    'http://10.1.2.3/a',
    'http://192.168.1.1/a',
    'http://172.16.0.1/a',
    'http://169.254.169.254/latest/meta-data',
    'http://[::1]/a',
    'http://service.local/a',
    'javascript:alert(1)',
  ];
  for (const url of bad) {
    const {calls, fetchImpl} = recorder(mockResponse({body: {title: '', content: 'x'}}));
    const result = await fetchPage({url, apiKey: KEY, fetchImpl});
    assert.equal(result.ok, false, url);
    assert.ok(['invalid_url', 'blocked_host'].includes(result.status), url + ' -> ' + result.status);
    assert.equal(calls.length, 0, url);
  }
  assert.throws(() => validateFetchUrl('https://example.com/' + 'a'.repeat(LIMITS.url_chars)), /at most/);
});

test('fetch returns no_content when the page has no Markdown body', async () => {
  const {fetchImpl} = recorder(mockResponse({body: {title: 'Empty', content: '   '}}));
  const result = await fetchPage({url: 'https://example.com/empty', apiKey: KEY, fetchImpl});
  assert.equal(result.ok, false);
  assert.equal(result.status, 'no_content');
  assert.equal(result.charged, false);
});

test('search truncates oversized content', async () => {
  const big = 'x'.repeat(LIMITS.max_result_content_chars + 1000);
  const {fetchImpl} = recorder(mockResponse({body: {results: [{title: 'big', url: 'https://example.com/big', content: big}]}}));
  const result = await searchWeb({query: 'q', needContent: true, apiKey: KEY, fetchImpl});
  assert.equal(result.results[0].content.length, LIMITS.max_result_content_chars);
});
