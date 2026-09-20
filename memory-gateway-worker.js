/**
 * LTZZZ Memory Gateway
 * ---------------------------------------------------------------------------
 * 统一只读记忆入口：各 AI / 调度器先打这里，而不是各读各的聊天上下文。
 *
 * 数据源优先级：
 *   1) Cloudflare R2（绑定名 MEMORY_BUCKET）——若已用 Actions 同步
 *   2) GitHub raw（main 分支）——默认可用，无需 R2
 *   3) Edge Cache API 缓存成功响应
 *
 * 端点：
 *   GET /health
 *   GET /manifest
 *   GET /file?path=ltzzz-memory/README.md
 *   GET /bundle?paths=ltzzz-memory/README.md,lab/MEMORY.md  （多文件拼接，有大小限制）
 *
 * 安全：
 *   - 仅允许白名单前缀下的 .md / .json 文本
 *   - 禁止 .. 与绝对路径
 *   - 不写、不删、不持有任何支付/私钥 Secret
 * ---------------------------------------------------------------------------
 */

const REPO = 'ltzyz2181-collab/ltzzz';
const BRANCH = 'main';
const RAW = `https://raw.githubusercontent.com/${REPO}/${BRANCH}`;

const ALLOW_PREFIXES = [
  'ltzzz-memory/',
  'lab/MEMORY.md',
  'lab/DECISIONS.md',
  'lab/tasks.md',
  'lab/CAPABILITY_MAP.md',
  'lab/README.md',
  'memory/daily/',
  'knowledge/memory-review/',
];

const MAX_FILE_BYTES = 400_000;
const MAX_BUNDLE_BYTES = 600_000;

function cors() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...cors(),
      ...extra,
    },
  });
}

function text(body, status = 200, extra = {}) {
  return new Response(body, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      ...cors(),
      ...extra,
    },
  });
}

function normalizePath(p) {
  if (!p || typeof p !== 'string') return null;
  let s = p.trim().replace(/^\/+/, '').replace(/\\/g, '/');
  if (s.includes('..') || s.includes('\0')) return null;
  return s;
}

function isAllowed(path) {
  if (!path) return false;
  if (!/\.(md|json|txt)$/i.test(path)) return false;
  return ALLOW_PREFIXES.some((pre) => {
    if (pre.endsWith('/')) return path.startsWith(pre);
    return path === pre;
  });
}

async function fromR2(env, path) {
  if (!env.MEMORY_BUCKET) return null;
  try {
    const obj = await env.MEMORY_BUCKET.get(path);
    if (!obj) return null;
    const body = await obj.text();
    return { body, source: 'r2', etag: obj.etag || null };
  } catch {
    return null;
  }
}

async function fromGitHub(path) {
  const url = `${RAW}/${path.split('/').map(encodeURIComponent).join('/')}`;
  const resp = await fetch(url, {
    headers: { 'User-Agent': 'ltzzz-memory-gateway/1.0' },
    cf: { cacheTtl: 60, cacheEverything: true },
  });
  if (!resp.ok) {
    return { error: true, status: resp.status, body: null, source: 'github' };
  }
  const body = await resp.text();
  return { body, source: 'github', status: 200 };
}

async function loadFile(env, path) {
  const r2 = await fromR2(env, path);
  if (r2 && r2.body != null) return r2;
  return fromGitHub(path);
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors() });
    }
    if (request.method !== 'GET') {
      return json({ error: 'GET only' }, 405);
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (path === '/health') {
      return json({
        ok: true,
        service: 'ltzzz-memory-gateway',
        version: '1.0.0',
        repo: REPO,
        branch: BRANCH,
        r2_bound: Boolean(env.MEMORY_BUCKET),
        sources: env.MEMORY_BUCKET ? ['r2', 'github'] : ['github'],
        note: 'Read-only memory gateway. Not a scheduler. No keys for payments.',
        time: new Date().toISOString(),
      });
    }

    if (path === '/manifest') {
      const cacheKey = new Request(url.toString(), request);
      const cache = caches.default;
      let hit = await cache.match(cacheKey);
      if (hit) return hit;

      const loaded = await loadFile(env, 'ltzzz-memory/manifest.json');
      if (loaded.error || loaded.body == null) {
        // 无 manifest 时返回内置最小清单，避免完全不可用
        return json({
          ok: true,
          generated: false,
          source: 'builtin-fallback',
          files: [
            'ltzzz-memory/README.md',
            'ltzzz-memory/memory-engine.md',
            'ltzzz-memory/LTZZZ-OS.md',
            'ltzzz-memory/Daily-AI-Scheduler.md',
            'ltzzz-memory/重要事件.md',
            'ltzzz-memory/项目历史.md',
            'ltzzz-memory/装备论.md',
            'ltzzz-memory/魄.md',
            'ltzzz-memory/识神.md',
            'ltzzz-memory/梦境数据库.md',
            'ltzzz-memory/文明研究.md',
            'lab/MEMORY.md',
            'lab/DECISIONS.md',
            'lab/tasks.md',
            'lab/CAPABILITY_MAP.md',
          ],
          read_order: [
            'ltzzz-memory/README.md',
            'lab/MEMORY.md',
            'lab/DECISIONS.md',
            'lab/tasks.md',
            'ltzzz-memory/重要事件.md',
            'ltzzz-memory/项目历史.md',
          ],
        });
      }

      let parsed;
      try {
        parsed = JSON.parse(loaded.body);
      } catch {
        return json({ error: 'manifest.json invalid JSON', source: loaded.source }, 500);
      }
      const res = json({
        ok: true,
        source: loaded.source,
        ...parsed,
      });
      const cached = new Response(res.body, res);
      cached.headers.set('Cache-Control', 'public, max-age=60');
      ctx.waitUntil(cache.put(cacheKey, cached.clone()));
      return cached;
    }

    if (path === '/file') {
      const rel = normalizePath(url.searchParams.get('path') || '');
      if (!isAllowed(rel)) {
        return json({
          error: 'path not allowed',
          path: rel,
          allow_prefixes: ALLOW_PREFIXES,
        }, 400);
      }
      const loaded = await loadFile(env, rel);
      if (loaded.error || loaded.body == null) {
        return json({ error: 'not found', path: rel, status: loaded.status || 404 }, 404);
      }
      if (loaded.body.length > MAX_FILE_BYTES) {
        return json({ error: 'file too large', path: rel, bytes: loaded.body.length }, 413);
      }
      return text(loaded.body, 200, {
        'Cache-Control': 'public, max-age=60',
        'X-LTZZZ-Memory-Source': loaded.source,
        'X-LTZZZ-Memory-Path': rel,
      });
    }

    if (path === '/bundle') {
      const raw = url.searchParams.get('paths') || '';
      const parts = raw.split(',').map((s) => normalizePath(s)).filter(Boolean);
      if (!parts.length || parts.length > 12) {
        return json({ error: 'paths required (1..12 comma-separated)' }, 400);
      }
      const out = [];
      let total = 0;
      for (const rel of parts) {
        if (!isAllowed(rel)) {
          out.push({ path: rel, error: 'not allowed' });
          continue;
        }
        const loaded = await loadFile(env, rel);
        if (loaded.error || loaded.body == null) {
          out.push({ path: rel, error: 'not found', status: loaded.status || 404 });
          continue;
        }
        total += loaded.body.length;
        if (total > MAX_BUNDLE_BYTES) {
          out.push({ path: rel, error: 'bundle size limit' });
          break;
        }
        out.push({ path: rel, source: loaded.source, content: loaded.body });
      }
      return json({ ok: true, files: out, bytes: total });
    }

    return json({
      service: 'ltzzz-memory-gateway',
      endpoints: [
        'GET /health',
        'GET /manifest',
        'GET /file?path=ltzzz-memory/README.md',
        'GET /bundle?paths=lab/MEMORY.md,ltzzz-memory/README.md',
      ],
    });
  },
};
