/**
 * LTZZZ Telegram Bot Worker
 * 接口：/webhook (Telegram 回调) · /send (发文本/图片/视频/文件) · /status (健康检查)
 * Secret 要求：TELEGRAM_BOT_TOKEN（BotFather）、TELEGRAM_CHAT_ID（管理会话，可选）、TELEGRAM_SECRET（webhook 校验，可选但推荐）
 * 权限边界：仅限 LTZZZ Bot 自身会话；不删除/转移/改安全设置。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    try {
      if (path === "/status" && request.method === "GET") {
        return json({ ok: true, bot: "ltzzz-telegram-bot", ts: Date.now() }, cors());
      }

      if (path === "/webhook" && request.method === "POST") {
        return await handleWebhook(request, env);
      }

      if (path === "/send" && request.method === "POST") {
        return await handleSend(request, env);
      }

      return json({ ok: false, error: "not_found" }, { status: 404, ...cors() });
    } catch (e) {
      return json({ ok: false, error: "internal", detail: String(e && e.message || e) }, { status: 500, ...cors() });
    }
  },
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Telegram-Bot-Api-Secret-Token",
  };
}

function json(obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

async function handleWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" }, { status: 500, ...cors() });

  // 若配置了 TELEGRAM_SECRET，校验 Telegram 请求头（防伪造 webhook）
  if (env.TELEGRAM_SECRET) {
    const got = request.headers.get("X-Telegram-Bot-Api-Secret-Token") || "";
    if (got !== env.TELEGRAM_SECRET) {
      return json({ ok: false, error: "bad secret" }, { status: 403, ...cors() });
    }
  }

  const update = await request.json().catch(() => null);
  if (!update) return json({ ok: false, error: "bad json" }, cors());

  const msg = update.message;
  if (msg && msg.text) {
    const chatId = msg.chat && msg.chat.id;
    const text = msg.text.trim();

    let reply = "LTZZZ 已收到 ✅";
    if (text === "/start" || text === "/help") {
      reply = "LTZZZ AGI 实验室 Bot 在线。可接收任务结果 / 通知 / 文件。";
    } else if (text.toLowerCase().startsWith("status")) {
      reply = `LTZZZ Bot 正常 · 收到消息: ${String(text).slice(0, 80)}`;
    }

    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown",
    });
  }

  return json({ ok: true }, cors());
}

async function handleSend(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" }, { status: 500, ...cors() });

  // 若配置了 TELEGRAM_SECRET，/send 也要求 Authorization Bearer <TELEGRAM_SECRET>
  if (env.TELEGRAM_SECRET) {
    const auth = request.headers.get("Authorization") || "";
    if (auth !== `Bearer ${env.TELEGRAM_SECRET}`) {
      return json({ ok: false, error: "unauthorized" }, { status: 401, ...cors() });
    }
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "bad json" }, cors());

  const chatId = body.chat_id || env.TELEGRAM_CHAT_ID;
  if (!chatId) return json({ ok: false, error: "missing chat_id" }, cors());

  // 支持：text / photo / video / document + caption
  let method, payload;
  if (body.photo) {
    method = "sendPhoto";
    payload = { chat_id: chatId, photo: body.photo, caption: body.caption || "" };
  } else if (body.video) {
    method = "sendVideo";
    payload = { chat_id: chatId, video: body.video, caption: body.caption || "" };
  } else if (body.document) {
    method = "sendDocument";
    payload = { chat_id: chatId, document: body.document, caption: body.caption || "" };
  } else {
    method = "sendMessage";
    payload = { chat_id: chatId, text: String(body.text || "").slice(0, 4000), parse_mode: body.parse_mode || "Markdown" };
  }

  const res = await tgApi(token, method, payload);
  return json({ ok: true, method, result: res && res.ok === true ? "sent" : res }, cors());
}

async function tgApi(token, method, payload) {
  const url = `https://api.telegram.org/bot${token}/${method}`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return resp.json().catch(() => null);
}
