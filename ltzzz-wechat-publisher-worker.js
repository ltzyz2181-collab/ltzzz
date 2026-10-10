import {reply as channelReply} from './channels/bot-content.mjs';
/**
 * LTZZZ WeChat Publisher Worker
 * 公众号每日图文发布：读 R2 当日 AI 产物 → 组装图文 → 建草稿（人工过目）→（配置开启后）群发
 * 2026-10-02 追加：/wechat 消息与事件回调端点（服务器配置验签 GET + 事件/文本回复 POST）
 *
 * 端点：
 *   GET  /health           健康检查
 *   POST /publish?mode=draft|mass   手动触发（默认 draft，不群发）
 *   GET  /wechat           服务器配置验签（echostr）
 *   POST /wechat           接收消息/菜单事件 → 按关键词模板回复文本
 *   cron：每天 20:00 CST（0 12 * * * UTC）自动建草稿
 *
 * Secrets（只进 Secret，不入库）：
 *   WECHAT_APP_ID     公众号 AppID
 *   WECHAT_APP_SECRET 公众号 AppSecret
 *   WECHAT_TOKEN      服务器配置 Token（owner 在 mp.weixin.qq.com 基本配置里填同一值）
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
        has_token: !!env.WECHAT_TOKEN,
        r2: !!env.MEMORY_BUCKET,
        auto_mass: env.AUTO_MASS === "1",
      });
    }
    if (url.pathname === "/publish" && request.method === "POST") {
      if(!env.BOT_ADMIN_TOKEN || request.headers.get("Authorization")!=="Bearer "+env.BOT_ADMIN_TOKEN)return json({error:"unauthorized"},401);
      const mode = url.searchParams.get("mode") || "draft";
      const out = await publish(env, mode);
      return json(out, out.ok ? 200 : 500);
    }
    // —— 微信服务器配置验签（GET）——
    if (url.pathname === "/wechat" && request.method === "GET") {
      const token = env.WECHAT_TOKEN;
      if (!token) return json({ ok: false, msg: "WECHAT_TOKEN missing in secrets" }, 500);
      const timestamp = url.searchParams.get("timestamp");
      const nonce = url.searchParams.get("nonce");
      const signature = url.searchParams.get("signature");
      const echostr = url.searchParams.get("echostr");
      const ok = await verifySignature(token, timestamp, nonce, signature);
      if (!ok) {
        return json({ ok: false, msg: "signature mismatch" }, 403);
      }
      return new Response(echostr || "", { headers: { "Content-Type": "text/plain; charset=utf-8" } });
    }
    // —— 微信消息/事件回调（POST）——
    if (url.pathname === "/wechat" && request.method === "POST") {
      const token = env.WECHAT_TOKEN;
      if (!token) return json({ ok: false, msg: "WECHAT_TOKEN missing in secrets" }, 500);
      const timestamp = url.searchParams.get("timestamp");
      const nonce = url.searchParams.get("nonce");
      const signature = url.searchParams.get("signature");
      const ok = await verifySignature(token, timestamp, nonce, signature);
      if (!ok) {
        return json({ ok: false, msg: "bad signature" }, 403);
      }
      const xml = await request.text();
      if(xml.includes("<Encrypt>"))return json({error:"encrypted_callback_not_supported"},422);
      const replyXml = await handleWechatMessage(xml);
      return new Response(replyXml, {
        headers: { "Content-Type": "application/xml; charset=utf-8" },
      });
    }
    return json({ ok: false, msg: "unknown endpoint" }, 404);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(publish(env, "draft"));
  },
};

/** 微信服务器配置验签：sha1(token,timestamp,nonce 字典序拼接) === signature */
function verifySignature(token, timestamp, nonce, signature) {
  if (!token || !timestamp || !nonce || !signature) return false;
  const arr = [token, timestamp, nonce].sort();
  const str = arr.join("");
  return crypto.subtle.digest("SHA-1", new TextEncoder().encode(str)).then((buf) => {
    const hex = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
    return hex === signature;
  });
}

/** 解析微信 XML（消息/事件），返回要回复的文本；无回复返回 "success" */
async function handleWechatMessage(xml) {
  const g = (tag) => {
    const m = xml.match(new RegExp("<" + tag + "><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></" + tag + ">"));
    if (m) return m[1];
    const m2 = xml.match(new RegExp("<" + tag + ">([\\s\\S]*?)</" + tag + ">"));
    return m2 ? m2[1] : "";
  };
  const from = g("FromUserName").replace(/\]\]>/g,""); // 粉丝 openid
  const to = g("ToUserName").replace(/\]\]>/g,"");     // 公众号原始 ID
  const msgType = g("MsgType");
  const event = g("Event");
  const eventKey = g("EventKey");
  const content = (g("Content") || "").trim();

  let reply = "";
  // 菜单 click 事件：按 EventKey 回复
  if (msgType === "event" && event === "CLICK") {
    reply = await channelReply(eventKey);
  } else if (msgType === "event" && event === "subscribe") {
    reply = await channelReply("start");
  } else if (msgType === "text" && content) {
    reply = await channelReply(content);
  }

  if (!reply) return "success";
  const ts = Math.floor(Date.now() / 1000);
  return (
    "<xml>" +
    "<ToUserName><![CDATA[" + from + "]]></ToUserName>" +
    "<FromUserName><![CDATA[" + to + "]]></FromUserName>" +
    "<CreateTime>" + ts + "</CreateTime>" +
    "<MsgType><![CDATA[text]]></MsgType>" +
    "<Content><![CDATA[" + reply + "]]></Content>" +
    "</xml>"
  );
}

/** 关键词即命令（对齐 docs/wechat-reply-templates.md 模板） */
function keywordReply(kw) {
  const k = (kw || "").toLowerCase();
  if (k.includes("商品") || k.includes("购买") || k.includes("下单") || k.includes("买")) {
    return "LTZZZ AI Agent Economy Starter Kit（$19）：https://ltzyz.gumroad.com/l/ugyhy\n\n订单号格式 WX-YYYYMMDD-XXXX，支付回执发回本号后自动推送交付链接。";
  }
  if (k.includes("观") || k.includes("今日") || k.includes("实验")) {
    return "今日实验一句话：LTZZZ 多 AI 流水线已跑通（Qwen/Kimi/DeepSeek 直连验证 OK），视频已公开 YT。详见 ltzzz.com/dashboard.html。";
  }
  if (k.includes("状态") || k.includes("health")) {
    return "系统状态：ltzzz.com 在线 · 视频已公开 · Gumroad $19 模板包可购 · 公众号回调已接入。";
  }
  if (k.includes("99")) {
    return "99 元 AI 模板包（国内版）：私聊下单后发支付回执，AI 自动交付链接。海外版走 $19 Gumroad。";
  }
  return "回复关键词：商品 / 观 / 状态 / 99，或访问 ltzzz.com 查看更多。";
}


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

// 2026-10-10 Grok Bot：优先使用 Actions 生成的 AI 编辑日报（articles/daily/<date>.md，已脱敏），没有再回退旧拼接
function mdToHtml(md) {
  const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  return md.split("\n").filter((l) => !/^# /.test(l)).map((l) => {
    if (/^#{2,3} /.test(l)) return `<h3>${esc(l.replace(/^#+ /, ""))}</h3>`;
    if (/^[-*] /.test(l)) return `<p>• ${esc(l.slice(2))}</p>`;
    return l.trim() ? `<p>${esc(l)}</p>` : "";
  }).join("");
}
async function buildArticle(env) {
  const date = todayCN(); // YYYY-MM-DD
  const ai = await env.MEMORY_BUCKET.get(`articles/daily/${date}.md`);
  if (ai) {
    const md = await ai.text();
    const t = (md.match(/^# (.+)$/m) || [])[1];
    if (md.trim()) return { title: (t || `LTZZZ 每日实验 · ${date}`).slice(0, 64), content: mdToHtml(md), sources: [`articles/daily/${date}.md`] };
  }
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
