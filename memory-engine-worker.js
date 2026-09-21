/**
 * LTZZZ Memory Engine — shared OS state.
 * Reads core memory files (R2 first, GitHub fallback), writes STATE snapshot + memory_id.
 * Does not call model APIs. Does not pay. Does not publish.
 */
const CORE = [
  'ltzzz-memory/README.md',
  'ltzzz-memory/装备论.md',
  'ltzzz-memory/魄.md',
  'ltzzz-memory/识神.md',
  'ltzzz-memory/梦境数据库.md',
  'ltzzz-memory/文明研究.md',
  'ltzzz-memory/项目历史.md',
  'ltzzz-memory/重要事件.md',
  'lab/MEMORY.md',
  'lab/DECISIONS.md',
  'lab/tasks.md',
];
const RAW = 'https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-memory-engine',
        r2_bound: Boolean(env.MEMORY_BUCKET),
        cron: '50 23 * * *',
        core: CORE,
      });
    }
    if (path === '/snapshot' || path === '/run') {
      const snap = await buildSnapshot(env);
      return json(snap);
    }
    return json({ endpoints: ['/health', '/snapshot'] });
  },
  async scheduled(event, env) {
    await buildSnapshot(env);
  },
};

async function getPath(env, path) {
  if (env.MEMORY_BUCKET) {
    try {
      const obj = await env.MEMORY_BUCKET.get(path);
      if (obj) {
        return { path, exists: true, readable: true, source: 'r2', bytes: (await obj.text()).length };
      }
    } catch (e) {
      return { path, exists: false, readable: false, source: 'r2-error', error: String(e) };
    }
  }
  const r = await fetch(RAW + '/' + path.split('/').map(encodeURIComponent).join('/'));
  if (!r.ok) return { path, exists: false, readable: false, source: 'github', status: r.status };
  const body = await r.text();
  return { path, exists: true, readable: true, source: 'github', bytes: body.length, preview: body.slice(0, 240) };
}

async function loadFull(env, path) {
  if (env.MEMORY_BUCKET) {
    try {
      const obj = await env.MEMORY_BUCKET.get(path);
      if (obj) return await obj.text();
    } catch {}
  }
  const r = await fetch(RAW + '/' + path.split('/').map(encodeURIComponent).join('/'));
  return r.ok ? await r.text() : '';
}

async function buildSnapshot(env) {
  const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const probes = [];
  for (const p of CORE) probes.push(await getPath(env, p));
  const parts = [];
  for (const p of CORE) {
    const text = await loadFull(env, p);
    parts.push('## ' + p + '\n\n' + text);
  }
  const blob = parts.join('\n\n---\n\n');
  const memory_id = 'STATE-' + day + '-' + await shortHash(blob);
  const snapshot = {
    ok: true,
    memory_id,
    state: 'STATE-' + day,
    generated_at: new Date().toISOString(),
    r2_bound: Boolean(env.MEMORY_BUCKET),
    files: probes,
    context_header:
      'LTZZZ OS shared memory. memory_id=' +
      memory_id +
      '. Read this snapshot before answering. Do not invent unread files.',
    context: blob.slice(0, 180000),
    ais: ['GPT', '豆包', 'Claude', 'Grok', 'DeepSeek', 'Microsoft'],
    publish: false,
    payment: false,
  };
  if (env.MEMORY_BUCKET) {
    try {
      await env.MEMORY_BUCKET.put('memory/state/' + snapshot.state + '.json', JSON.stringify(snapshot));
      await env.MEMORY_BUCKET.put('memory/state/CURRENT.json', JSON.stringify({
        memory_id,
        state: snapshot.state,
        generated_at: snapshot.generated_at,
      }));
      snapshot.written_r2 = true;
    } catch (e) {
      snapshot.written_r2 = false;
      snapshot.r2_write_error = String(e);
    }
  } else {
    snapshot.written_r2 = false;
  }
  return snapshot;
}

async function shortHash(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].slice(0, 6).map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}
