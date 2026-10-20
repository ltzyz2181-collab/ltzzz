import test from 'node:test';
import assert from 'node:assert/strict';
import {webcrypto} from 'node:crypto';
import hub from '../../ltzzz-cloud-hub-worker.js';
globalThis.crypto ??= webcrypto;

function mockKV() {
  const m = new Map();
  return {
    get: async (k) => (m.has(k) ? m.get(k) : null),
    put: async (k, v) => { m.set(k, v); return { key: k }; },
    _m: m,
  };
}
const env = { ACCESS_TOKEN: 'fixture', KV: mockKV() };

async function call(path, { method = 'GET', body, token = 'fixture', headers = {} } = {}) {
  const h = { ...headers };
  if (token) h.Authorization = 'Bearer ' + token;
  if (body && !(body instanceof FormData)) h['Content-Type'] = 'application/json';
  const r = await hub.fetch(new Request('https://hub' + path, {
    method,
    headers: h,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  }), env);
  return { http: r.status, data: await r.json() };
}

test('health is open and reports tiktok disabled / boundary', async () => {
  const r = await hub.fetch(new Request('https://hub/health'), env);
  const j = await r.json();
  assert.equal(r.status, 200);
  assert.equal(j.ok, true);
  assert.equal(j.engine, 'cloud-hub');
  assert.equal(j.platforms.tiktok, false);
});

test('write endpoints reject anonymous (401) fail-closed', async () => {
  for (const p of ['/task/create', '/task/result']) {
    const r = await hub.fetch(new Request('https://hub' + p, { method: 'POST', body: '{}' }), env);
    assert.equal(r.status, 401, p);
  }
  const st = await hub.fetch(new Request('https://hub/video/status?sha256=' + 'a'.repeat(64)), env);
  assert.equal(st.status, 401);
});

test('task create/status roundtrip and result log redacts a token', async () => {
  const created = await call('/task/create', { method: 'POST', body: { domain: 'video', to: 'doubao', type: 'video' } });
  assert.equal(created.data.ok, true);
  const status = await call('/task/status', { method: 'POST', body: { task_id: created.data.task_id } });
  assert.equal(status.data.task.status, 'queued');
  await call('/task/result', { method: 'POST', body: { task_id: created.data.task_id, status: 'success', note: 'token ghp_ABCDEF123456SECRET leaked' } });
  const after = await call('/task/status', { method: 'POST', body: { task_id: created.data.task_id } });
  const logNote = JSON.stringify(after.data.task.log);
  assert.equal(logNote.includes('ghp_ABCDEF123456SECRET'), false);
  assert.match(logNote, /REDACTED_TOKEN/);
});

test('submit accepts an allowlisted raw github video_url and enqueues to scheduler', async () => {
  const original = globalThis.fetch;
  let schedulerUploaded = false;
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    if (u.hostname === 'raw.githubusercontent.com') return new Response(new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112]));
    if (u.pathname.startsWith('/queue/upload/')) {
      schedulerUploaded = true;
      return Response.json({ ok: true, status: 'queued' });
    }
    throw Error('unexpected fetch ' + u.href);
  };
  try {
    const r = await call('/video/submit', { method: 'POST', body: { video_url: 'https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/videos/demo.mp4', title: 'demo' } });
    assert.equal(r.http, 200);
    assert.equal(r.data.ok, true);
    assert.equal(schedulerUploaded, true);
    assert.match(r.data.sha256, /^[a-f0-9]{64}$/);
  } finally {
    globalThis.fetch = original;
  }
});

test('submit rejects non-allowlisted hosts without calling scheduler', async () => {
  const original = globalThis.fetch;
  let called = false;
  globalThis.fetch = async () => { called = true; return Response.json({ ok: true }); };
  try {
    const r = await call('/video/submit', { method: 'POST', body: { video_url: 'https://evil.example.com/a.mp4' } });
    assert.equal(r.http, 400);
    assert.equal(r.data.error, 'video_source_not_allowed');
    assert.equal(called, false);
  } finally {
    globalThis.fetch = original;
  }
});

test('video/status reconciles local receipt and remote scheduler', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ ok: true, receipt: { state: 'published', video_id: 'abc' } });
  try {
    const r = await call('/video/status?sha256=' + 'a'.repeat(64));
    assert.equal(r.http, 200);
    assert.ok('local' in r.data);
    assert.ok('remote' in r.data);
  } finally {
    globalThis.fetch = original;
  }
});
