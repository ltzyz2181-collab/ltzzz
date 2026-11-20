import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const source = path.join(root, 'workers', 'meta-worker', 'index.ts');
const copy = path.join(root, 'workers', 'meta-worker', `.tmp-index-${process.pid}.mjs`);
fs.copyFileSync(source, copy);
const worker = (await import(pathToFileURL(copy).href)).default;
fs.rmSync(copy, {force: true});

const call = (route, {method = 'POST', token, body, env = {}} = {}) =>
  worker.fetch(new Request('https://meta.test' + route, {
    method,
    headers: {...(token ? {Authorization: 'Bearer ' + token} : {}), ...(body ? {'Content-Type': 'application/json'} : {})},
    body: body ? JSON.stringify(body) : undefined,
  }), {META_WORKER_TOKEN: 'seat-token', META_MODEL: 'model-x', AI: {}, ...env});

const issue = {task_id: 'META-PROP-1', title: '提案标题', body: '正文内容'};

test('health reports whether the issues token is installed', async () => {
  const off = await (await call('/health', {method: 'GET', env: {GITHUB_ISSUES_TOKEN: ''}})).json();
  assert.equal(off.issues_configured, false);
  assert.equal(off.issues_repo, 'ltzyz2181-collab/ltzzz');
  const on = await (await call('/health', {method: 'GET', env: {GITHUB_ISSUES_TOKEN: 'x'}})).json();
  assert.equal(on.issues_configured, true);
});

test('issue route requires the worker bearer token', async () => {
  const res = await call('/issue', {body: issue, env: {GITHUB_ISSUES_TOKEN: 'gh'}});
  assert.equal(res.status, 401);
});

test('dry_run validates without a GitHub token and never creates anything', async () => {
  const original = globalThis.fetch;
  let called = 0;
  globalThis.fetch = async () => { called += 1; throw Error('should not call GitHub'); };
  try {
    const res = await call('/issue', {token: 'seat-token', body: {...issue, dry_run: true}, env: {GITHUB_ISSUES_TOKEN: ''}});
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.dry_run, true);
    assert.equal(data.issues_configured, false);
    assert.equal(data.would_create.repo, 'ltzyz2181-collab/ltzzz');
    assert.equal(called, 0);
  } finally {
    globalThis.fetch = original;
  }
});

test('real create fails closed when the issues token is missing', async () => {
  const res = await call('/issue', {token: 'seat-token', body: issue, env: {GITHUB_ISSUES_TOKEN: ''}});
  assert.equal(res.status, 503);
  assert.equal((await res.json()).error, 'issues_not_configured');
});

test('creates an issue with the pinned repo and labels', async () => {
  const original = globalThis.fetch;
  const seen = [];
  globalThis.fetch = async (url, options = {}) => {
    seen.push({url: String(url), method: options.method || 'GET'});
    if (String(url).includes('/search/issues')) return new Response(JSON.stringify({total_count: 0, items: []}), {status: 200});
    return new Response(JSON.stringify({number: 42, html_url: 'https://github.com/x/y/issues/42'}), {status: 201});
  };
  try {
    const res = await call('/issue', {token: 'seat-token', body: {...issue, labels: ['meta-review']}, env: {GITHUB_ISSUES_TOKEN: 'gh-token'}});
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.status, 'created');
    assert.equal(data.number, 42);
    assert.equal(seen.length, 2);
    assert.ok(seen[0].url.includes('/search/issues'));
    assert.ok(seen[1].url.endsWith('/repos/ltzyz2181-collab/ltzzz/issues'));
    assert.equal(seen[1].method, 'POST');
  } finally {
    globalThis.fetch = original;
  }
});

test('dedupes by task id and refuses to duplicate', async () => {
  const original = globalThis.fetch;
  let created = 0;
  globalThis.fetch = async (url) => {
    if (String(url).includes('/search/issues')) return new Response(JSON.stringify({total_count: 1, items: [{number: 7, html_url: 'https://github.com/x/y/issues/7'}]}), {status: 200});
    created += 1;
    return new Response('{}', {status: 201});
  };
  try {
    const res = await call('/issue', {token: 'seat-token', body: issue, env: {GITHUB_ISSUES_TOKEN: 'gh-token'}});
    const data = await res.json();
    assert.equal(data.status, 'duplicate_skipped');
    assert.equal(data.number, 7);
    assert.equal(created, 0);
  } finally {
    globalThis.fetch = original;
  }
});