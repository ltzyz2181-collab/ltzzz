/**
 * LTZZZ X Publisher
 * Activation date: 2026-10-01 (Asia/Shanghai).
 * Before activation it deliberately does nothing.
 * Secret required: X_USER_ACCESS_TOKEN (OAuth 2 user access token with post/write scope).
 */

const ACTIVATION = '2026-10-01T00:00:00+08:00';
const POSTS = [
  'LTZZZ｜观 · 行深 · 大道至简。先观事实，再行动；先验证结果，再形成记忆。',
  'LTZZZ Web3：AI 可以提出支付，但公共资金必须有预算、白名单、额度和可验证的链上结果。',
  'LTZZZ 长期方向：当 AI 改变谋生技能后，探索新的学习、工作和收入机会，让更多人有尊严地参与新的生产方式。',
  'LTZZZ Memory：已有凭证不重复注册，已有任务不重复部署；未知事实不猜，真实结果才进入长期记忆。'
];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publish(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      return new Response(JSON.stringify({ ok: true, activation: ACTIVATION, now: new Date().toISOString() }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: false, error: 'not_found' }), { status: 404, headers: { 'content-type': 'application/json' } });
  }
};

async function publish(env) {
  const now = new Date();
  if (now < new Date(ACTIVATION)) return { ok: true, skipped: true, reason: 'before_activation' };
  const token = env.X_USER_ACCESS_TOKEN;
  if (!token) return { ok: false, blocked: true, reason: 'missing_X_USER_ACCESS_TOKEN' };

  const day = Math.floor((now.getTime() - new Date(ACTIVATION).getTime()) / 86400000);
  const text = `${POSTS[day % POSTS.length]}\n\n#LTZZZ #AI #AGI #Web3`;
  const r = await fetch('https://api.x.com/2/tweets', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ text })
  });
  const data = await r.json().catch(() => null);
  return { ok: r.ok, status: r.status, data };
}
