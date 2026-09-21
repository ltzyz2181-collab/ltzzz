/**
 * Memory Engine: REAL reads, not exists-only probes.
 * Records memory_id, files_read, files_missing, snapshot_hash, timestamp.
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
const AIS = ['GPT', '豆包', 'Claude', 'Grok', 'DeepSeek'];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';
    if (path === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-memory-engine',
        mode: 'real-read',
        r2_bound: Boolean(env.MEMORY_BUCKET),
        core: CORE,
      });
    }
    if (path === '/snapshot' || path === '/run') {
      return json(await buildSnapshot(env));
    }
    return json({ endpoints: ['/health', '/snapshot'] });
  },
  async scheduled(_e, env) {
    await buildSnapshot(env);
  },
};

async function readOne(env, path) {
  if (env.MEMORY_BUCKET) {
    try {
      const obj = await env.MEMORY_BUCKET.get(path);
      if (obj) {
        const text = await obj.text();
        if (text && text.length) {
          return { path, read: true, source: 'r2', bytes: text.length, text };
        }
      }
    } catch (e) {
      return { path, read: false, source: 'r2-error', error: String(e), text: '' };
    }
  }
  const r = await fetch(RAW + '/' + path.split('/').map(encodeURIComponent).join('/'), {
    headers: { 'User-Agent': 'ltzzz-memory-engine/2.0' },
  });
  if (!r.ok) return { path, read: false, source: 'github', status: r.status, text: '' };
  const text = await r.text();
  if (!text) return { path, read: false, source: 'github-empty', text: '' };
  return { path, read: true, source: 'github', bytes: text.length, text };
}

async function buildSnapshot(env) {
  const timestamp = new Date().toISOString();
  const day = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10).replace(/-/g, '');
  const loaded = [];
  for (const p of CORE) loaded.push(await readOne(env, p));

  const files_read = loaded.filter((f) => f.read).map((f) => f.path);
  const files_missing = loaded.filter((f) => !f.read).map((f) => f.path);
  const blob = loaded
    .filter((f) => f.read)
    .map((f) => '## ' + f.path + '\n\n' + f.text)
    .join('\n\n---\n\n');
  const snapshot_hash = await sha256hex(blob);
  const memory_id = 'STATE-' + day + '-' + snapshot_hash.slice(0, 12);

  const snapshot = {
    ok: files_missing.length === 0,
    mode: 'real-read',
    memory_id,
    files_read,
    files_missing,
    snapshot_hash,
    timestamp,
    bytes: blob.length,
    r2_bound: Boolean(env.MEMORY_BUCKET),
    context_header: 'memory_id=' + memory_id + ' snapshot_hash=' + snapshot_hash,
    context: blob.slice(0, 180000),
    ais: AIS,
    review_chain: ['GPT', 'DeepSeek', 'Claude', 'Grok', 'GPT'],
    publish: false,
    payment: false,
  };

  if (env.MEMORY_BUCKET) {
    try {
      await env.MEMORY_BUCKET.put('memory/state/' + memory_id + '.json', JSON.stringify(snapshot));
      await env.MEMORY_BUCKET.put(
        'memory/state/CURRENT.json',
        JSON.stringify({
          memory_id,
          files_read,
          files_missing,
          snapshot_hash,
          timestamp,
        }),
      );
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

async function sha256hex(s) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj, null, 2), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' },
  });
}
