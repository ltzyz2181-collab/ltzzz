/**
 * LTZZZ proxy P0 guard (2026-10-21)
 *
 * REQUIRE_TOKEN defaults OFF so existing callers keep working.
 * When REQUIRE_TOKEN is true/1/yes, POST requires Authorization: Bearer <token>
 * matching seat token or LTZZZ_AGENT_TOKEN.
 *
 * Always-on soft limits (do not break auth): max_tokens hard cap, optional origin allowlist.
 * Doubao public page cannot store Bearer — use origin + rate + token-cap path instead of forcing Bearer.
 */

export function requireTokenEnabled(env) {
  const v = String(env.REQUIRE_TOKEN || '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes' || v === 'on';
}

export function serviceToken(env, seatTokenEnvName) {
  if (seatTokenEnvName && env[seatTokenEnvName]) return env[seatTokenEnvName];
  return env.LTZZZ_AGENT_TOKEN || env.KIMI_WORKER_TOKEN || null;
}

/**
 * @returns {null | Response} null = pass; Response = reject
 */
export function checkServiceAuth(request, env, { seatTokenEnvName, json } = {}) {
  if (!requireTokenEnabled(env)) return null;
  const expected = serviceToken(env, seatTokenEnvName);
  if (!expected) {
    return json(
      { error: 'service_auth_not_configured', stage: 'proxy_guard', hint: 'REQUIRE_TOKEN is on but no LTZZZ_AGENT_TOKEN / seat token' },
      503
    );
  }
  const auth = request.headers.get('Authorization') || '';
  if (auth !== `Bearer ${expected}`) {
    return json({ error: 'unauthorized', stage: 'proxy_guard' }, 401);
  }
  return null;
}

export function clampMaxTokens(value, defaultTokens, hardCap) {
  const cap = Number.isInteger(hardCap) && hardCap > 0 ? hardCap : 4096;
  const fallback = Number.isInteger(defaultTokens) && defaultTokens > 0 ? defaultTokens : 1200;
  let n = Number.isInteger(value) ? value : fallback;
  if (!(n > 0)) n = fallback;
  return Math.min(n, cap);
}

/**
 * Optional Origin allowlist. Empty ALLOWED_ORIGINS = allow all (current CORS *).
 * Comma-separated exact origins, e.g. https://ltzzz.com,https://ltzyz2181-collab.github.io
 */
export function checkOrigin(request, env, { json } = {}) {
  const raw = String(env.ALLOWED_ORIGINS || '').trim();
  if (!raw) return null;
  const allowed = raw.split(',').map((s) => s.trim()).filter(Boolean);
  if (!allowed.length) return null;
  const origin = request.headers.get('Origin');
  // Non-browser (no Origin) is allowed for worker-to-worker / curl with Bearer.
  if (!origin) return null;
  if (allowed.includes(origin)) return null;
  return json({ error: 'origin_not_allowed', stage: 'proxy_guard' }, 403);
}

/**
 * Soft per-IP rate limit via Cache API (best-effort; not global durable quota).
 * RATE_LIMIT_PER_HOUR default 60; set 0 to disable.
 */
export async function checkRateLimit(request, env, { json, bucket = 'proxy' } = {}) {
  const limit = Number.parseInt(String(env.RATE_LIMIT_PER_HOUR ?? '60'), 10);
  if (!Number.isFinite(limit) || limit <= 0) return null;
  const ip =
    request.headers.get('CF-Connecting-IP') ||
    request.headers.get('X-Forwarded-For')?.split(',')[0]?.trim() ||
    'unknown';
  const hour = new Date().toISOString().slice(0, 13);
  const key = new Request(`https://ltzzz-proxy-guard.local/${bucket}/${hour}/${ip}`);
  try {
    const cache = caches.default;
    const hit = await cache.match(key);
    let count = 0;
    if (hit) {
      count = Number.parseInt(await hit.text(), 10) || 0;
    }
    if (count >= limit) {
      return json(
        { error: 'rate_limited', stage: 'proxy_guard', limit_per_hour: limit },
        429
      );
    }
    const body = String(count + 1);
    await cache.put(
      key,
      new Response(body, {
        headers: {
          'Content-Type': 'text/plain',
          'Cache-Control': 'max-age=3600'
        }
      })
    );
  } catch {
    // Cache API unavailable in some local runtimes — fail open for soft limit only.
  }
  return null;
}

export function authHealthFields(env, seatTokenEnvName) {
  return {
    require_token: requireTokenEnabled(env),
    auth_configured: Boolean(serviceToken(env, seatTokenEnvName)),
    allowed_origins_configured: Boolean(String(env.ALLOWED_ORIGINS || '').trim()),
    rate_limit_per_hour: Number.parseInt(String(env.RATE_LIMIT_PER_HOUR ?? '60'), 10) || 0,
    max_tokens_hard_cap: Number.parseInt(String(env.MAX_TOKENS_HARD_CAP || '4096'), 10) || 4096
  };
}
