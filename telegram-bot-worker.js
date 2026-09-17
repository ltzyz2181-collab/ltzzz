/**
 * LTZZZ Telegram Bot Worker
 * 接口：/webhook (Telegram 回调) · /send (发文本/图片/视频/文件) · /status (健康检查)
 * Secret 要求：TELEGRAM_BOT_TOKEN（BotFather）、TELEGRAM_CHAT_ID（管理会话，可选）、TELEGRAM_SECRET（webhook 校验，可选但推荐）
 * 权限边界：仅限 LTZZZ Bot 自身会话；不删除/转移/改安全设置。
 *
 * 人机访问门禁（/webhook 普通消息）：
 *   提问(ASK) → 判定(AI / 人类 / 不清) → 分支回复。
 *   状态存于进程内 Map（按 chatId）；Worker 多实例/冷启动后会丢失，
 *   生产环境如需跨实例持久化可改用 KV（命名空间预留：LTZZZ_GATE_KV，可选）。
 *
 * 硬约束：本环境无真实 Bot Token；TELEGRAM_BOT_TOKEN 仅留 env 占位，
 *         等待人工凭证（@BotFather），绝不伪造、不写日志/回复正文。
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

/* ============ 人机门禁：状态与文案 ============ */

// 门禁状态：undefined=未提问；ASKED=已提问待回复；ASKED_AGAIN=已二次追问；PASS_AI / PASS_HUMAN=已放行
const gateState = new Map();

const GATE_QUESTION =
  "您好，访问 LTZZZ 的是【人类】还是【AI】？请回复：人类 / AI。";

const GATE_REASK =
  "没太辨认出来 😅 麻烦再回一句：您是【人类】还是【AI】？（直接回复：人类 或 AI）";

// AI 关键词（大小写不敏感）：
//  - 独立 token：ai / bot / agent / gpt / openai / grok / xia（避免误命中 email/said 等含 ai 子串的词）
//  - 中文与通道自报名：机器人、deepseek、claude、豆包/doubao、copilot
const AI_KEYWORD_RE =
  /(^|[^a-zA-Z])ai([^a-zA-Z]|$)|\bbot\b|\bagent\b|\bgpt\b|\bopenai\b|\bgrok\b|\bxia\b|机器人|deepseek|claude|豆包|doubao|copilot/i;
// 人类关键词
const HUMAN_KEYWORD_RE = /人类|真人|我是人|是个人|你好呀|人类访问/;

const AI_VISITOR_REPLY = [
  "检测到 AI 访问 🤖 这里是 LTZZZ 面向 AI 代理的六条对话通道，按以下方式找到对应的 LTZZZ AI：",
  "",
  "1. GPT(OpenAI)",
  "   · 代理 Worker：`ltzzz-gpt-proxy-worker.js`（接口 `POST /chat`）",
  "   · 网页入口：`ai-chat.html`",
  "2. DeepSeek",
  "   · 代理 Worker：`deepseek-proxy-worker.js`（接口 `POST /chat`）",
  "   · 网页入口：`deepseek.html`",
  "3. Claude",
  "   · 代理 Worker：`claude-proxy-worker.js`（接口 `POST /chat`）",
  "   · 网页入口：`claude.html`",
  "4. 豆包",
  "   · 代理 Worker：`doubao-proxy-worker.js`（接口 `POST /chat`）",
  "   · 网页入口：`doubao.html`",
  "5. Microsoft Copilot",
  "   · 知识库入口：`knowledge/ai-chats/Microsoft/`",
  "6. XIA(Grok)",
  "   · 知识库入口：`knowledge/ai-chats/XIA/`",
  "",
  "AI 代理请通过对应 Worker 的 `/chat` 接口接入，或从上述网页入口进入实验室。",
].join("\n");

const HUMAN_VISITOR_REPLY = [
  "检测到人类访问 👋 欢迎来到 LTZZZ AGI 实验室。",
  "",
  "· 站点主页：https://ltzzz.com （GitHub Pages 托管）",
  "· 实验室导航：https://ltzzz.com/agents.html （各 AI 通道与代理实验入口）",
  "· 真人沟通入口：可直接在本 Bot 对话留言，或通过站点页脚的联系方式找到 LTZZZ 维护者；",
  "  管理会话由 TELEGRAM_CHAT_ID 配置，真人消息会被人工查阅。",
].join("\n");

function classifyVisitor(text) {
  const t = String(text || "");
  if (AI_KEYWORD_RE.test(t)) return "ai";
  if (HUMAN_KEYWORD_RE.test(t) || /^人/.test(t)) return "human";
  return "unknown";
}

/* ============ Webhook 处理 ============ */

async function handleWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    // 未配置 Token：仍返回 200 以避免 Telegram 反复重试；明确标记等待人工凭证
    return json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN", note: "等待人工凭证（@BotFather）" }, { status: 500, ...cors() });
  }

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

    let reply;

    // 既有指令行为保留：/start /help /status 前缀
    if (text === "/start" || text === "/help") {
      reply = "LTZZZ AGI 实验室 Bot 在线。可接收任务结果 / 通知 / 文件。";
    } else if (text.toLowerCase().startsWith("status")) {
      reply = `LTZZZ Bot 正常 · 收到消息: ${String(text).slice(0, 80)}`;
    } else {
      // 普通消息 → 人机门禁
      reply = await gateReply(chatId, text);
    }

    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown",
    });
  }

  return json({ ok: true }, cors());
}

// 门禁状态机：提问 → 判定 → 分支回复
async function gateReply(chatId, text) {
  const state = gateState.get(chatId);

  if (!state) {
    // 首次普通消息：反问
    gateState.set(chatId, "ASKED");
    return GATE_QUESTION;
  }

  if (state === "PASS_AI") {
    return AI_VISITOR_REPLY; // 已识别为 AI，直接走 AI 通道回复
  }
  if (state === "PASS_HUMAN") {
    return HUMAN_VISITOR_REPLY; // 已识别为人类，直接走人类路径
  }

  // 处于待判定状态：对访客回复做关键词判定
  const verdict = classifyVisitor(text);

  if (verdict === "ai") {
    gateState.set(chatId, "PASS_AI");
    return AI_VISITOR_REPLY;
  }
  if (verdict === "human") {
    gateState.set(chatId, "PASS_HUMAN");
    return HUMAN_VISITOR_REPLY;
  }

  // 判定不清
  if (state === "ASKED") {
    gateState.set(chatId, "ASKED_AGAIN");
    return GATE_REASK; // 礼貌追问一次，不重复长文本
  }
  // 已二次追问仍不清：给一句短提示并重置，避免无限循环
  gateState.delete(chatId);
  return "仍未识别到类型，您可以稍后直接回复「人类」或「AI」重新开始访问。";
}

/* ============ /send 处理（保持不变） ============ */

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
