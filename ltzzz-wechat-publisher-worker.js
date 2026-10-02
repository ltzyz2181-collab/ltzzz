/**
 * LTZZZ WeChat Publisher Worker
 * 公众号每日图文发布：读 R2 当日 AI 产物 → 组装图文 → 建草稿（人工过目）→（配置开启后）群发
 *
 * 端点：
 *   GET  /health           健康检查
 *   POST /publish?mode=draft|mass   手动触发（默认 draft，不群发）
 *   cron：每天 20:00 CST（0 12 * * * UTC）自动建草稿
 *
 * Secrets（只进 Secret，不入库）：
 *   WECHAT_APP_ID     公众号 AppID
 *   WECHAT_APP_SECRET 公众号 AppSecret
 *   （可选）AUTO_MASS=1 时草稿通过后自动群发；默认 0=只建草稿等人工
 *
 * 内容源：R2 bucket `ltzzz-memory`，key 前缀 `knowledge/daily/`
 *   → 取当天各 AI 产物（xia/gpt/doubao/deepseek/kimi…）组装一篇日报图文
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return json({
        ok: true,
        service: "ltzzz-wechat-publisher",
        app_id: !!env.WECHAT_APP_ID,
        has_secret: !!env.WECHAT_APP_SECRET,
        r2: !!env.MEMORY_BUCKET,
        auto_mass: env.AUTO_MASS === "1",
      });
    }
    if (url.pathname === "/publish" && request.method === "POST") {
      const mode = url.searchParams.get("mode") || "draft";
      const out = await publish(env, mode);
      return json(out, out.ok ? 200 : 500);
    }
    return json({ ok: false, msg: "unknown endpoint" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publish(env, "draft"));
  },
};

async function publish(env, mode) {
  try {
    const token = await getAccessToken(env);
    if (!token) return { ok: false, msg: "token failed: check WECHAT_APP_ID/SECRET" };

    const { title, content, sources } = await buildArticle(env);
    if (!content) return { ok: false, msg: "no daily content found in R2" };

    // 草稿箱接口（draft/add）：直接传图文内容 + 封面 media_id
    const draftId = await addDraft(env, token, title, content);
    if (!draftId) return { ok: false, msg: "addDraft failed" };

    let massResult = null;
    if (mode === "mass" && env.AUTO_MASS === "1") {
      massResult = await massSend(env, token, draftId);
    }

    const receipt = {
      ok: true,
      date: todayCN(),
      title,
      draft_id: draftId,
      mode,
      mass: massResult,
      sources,
      at: new Date().toISOString(),
    };
    await env.MEMORY_BUCKET.put(`wechat/publish/${todayCN()}.json`, JSON.stringify(receipt, null, 2));
    return receipt;
  } catch (e) {
    return { ok: false, msg: "error: " + e.message };
  }
}

async function getAccessToken(env) {
  const url = `https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${env.WECHAT_APP_ID}&secret=${env.WECHAT_APP_SECRET}`;
  const r = await fetch(url);
  const j = await r.json();
  return j.access_token || null;
}

async function buildArticle(env) {
  const date = todayCN(); // YYYY-MM-DD
  const prefix = "knowledge/daily/";
  const listed = await env.MEMORY_BUCKET.list({ prefix });
  let parts = [];
  let sources = [];
  for (const obj of listed.objects || []) {
    const name = obj.key.replace(prefix, "");
    if (!name.includes(date)) continue; // 只要当天
    const body = await env.MEMORY_BUCKET.get(obj.key);
    if (!body) continue;
    const text = await body.text();
    const snippet = text.slice(0, 1200);
    parts.push(`【${name.split("/")[0]}】\n${snippet}`);
    sources.push(obj.key);
  }
  if (parts.length === 0) return { title: "", content: "", sources: [] };

  const title = `LTZZZ 每日实验 · ${date}`;
  const content =
    `LTZZZ 数字实验室 — ${date} 各 AI 协作日报\n\n` +
    parts.join("\n\n---\n\n") +
    `\n\n— 由 LTZZZ 多 AI 自动流水线生成 · 数据与产物存于 ltzzz.com`;
  return { title, content, sources };
}

async function addDraft(env, token, title, content) {
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      articles: [{
        title,
        author: "LTZZZ",
        digest: content.slice(0, 100),
        content,
        content_source_url: "https://ltzzz.com",
        thumb_media_id: env.THUMB_MEDIA_ID,
        need_open_comment: 0,
        only_fans_can_comment: 0,
      }],
    }),
  });
  const j = await r.json();
  if (j.errcode) return null;
  return j.media_id || null;
}

async function massSend(env, token, mediaId) {
  const r = await fetch(`https://api.weixin.qq.com/cgi-bin/message/mass/sendall?access_token=${token}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ filter: { is_to_all: true }, mpnews: { media_id: mediaId }, msgtype: "mpnews", send_ignore_reprint: 1 }),
  });
  return await r.json();
}

function todayCN() {
  const now = new Date();
  const off = 8 * 60;
  const d = new Date(now.getTime() + now.getTimezoneOffset() * 60000 + off * 60000);
  return d.toISOString().slice(0, 10);
}

function json(o, status = 200) {
  return new Response(JSON.stringify(o), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Access-Control-Allow-Origin": "*" },
  });
}
