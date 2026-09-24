/**
 * LTZZZ Telegram Publisher
 * Daily public/group post. This is separate from the interactive bot webhook.
 * Secrets: TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID.
 */

const POSTS = [
  "LTZZZ 今日记录｜观 · 行深 · 大道至简\n先观事实，再行动；先验证结果，再形成记忆。LTZZZ 正在把 AI、任务、资产与结果连成一个长期系统。",
  "LTZZZ Web3 实验｜AI 不能直接支配公共资金。\n今天继续研究 Safe + spending limit + policy engine，让 AI 可以提出和执行受限任务，但每一步都有预算、白名单和可验证结果。",
  "LTZZZ 的一个长期方向：AI 发展不只是提高效率。\n如果未来技术让一些人失去原有谋生技能，LTZZZ 希望探索新的学习、工作和收入机会，让人能够有尊严地参与新的生产方式。",
  "LTZZZ Memory｜每一次任务先观。\n查已有记忆、任务、结果和凭证；已有的不要重复部署，未知的不要猜测。真实结果才进入长期记忆。"
];

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publish(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === '/status') {
      return json({ ok: true, service: 'ltzzz-telegram-publisher', enabled: env.TELEGRAM_PUBLISH_ENABLED !== 'false' });
    }
    if (url.pathname === '/publish-now' && request.method === 'POST') {
      const auth = request.headers.get('Authorization') || '';
      if (!env.TELEGRAM_PUBLISH_SECRET || auth !== `Bearer ${env.TELEGRAM_PUBLISH_SECRET}`) {
        return json({ ok: false, error: 'unauthorized' }, 401);
      }
      return json(await publish(env));
    }
    return json({ ok: false, error: 'not_found' }, 404);
  }
};

async function publish(env) {
  if (env.TELEGRAM_PUBLISH_ENABLED === 'false') return { ok: false, skipped: true, reason: 'disabled' };
  const token = env.TELEGRAM_BOT_TOKEN;
  const chatId = env.TELEGRAM_CHAT_ID;
  if (!token || !chatId) return { ok: false, error: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' };

  const day = Math.floor(Date.now() / 86400000);
  const text = `🤖 LTZZZ Daily\n\n${POSTS[day % POSTS.length]}\n\n#LTZZZ #AI #AGI #Web3`;
  const r = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true })
  });
  const data = await r.json().catch(() => null);
  return { ok: Boolean(data?.ok), telegram: data };
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json' } });
}
