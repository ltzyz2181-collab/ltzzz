/**
 * LTZZZ Telegram Bot Worker
 * 完整流程：/start → 人类/AI → 6 AI → 会员 → 服务 → 任务 → 结果
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

/* ============ 状态机 ============ */

// 每个 chatId 的对话状态
const userState = new Map();

// 状态：
// WELCOME: 刚启动，还没选人类/AI
// HUMAN_MAIN: 人类主菜单
// AI_MAIN: AI 主菜单
// AI_CHOOSE: 选 6 AI 中的哪一个
// MEMBER: 会员菜单
// SERVICE: 服务菜单
// TASK: 提交任务
// RESULT: 查询结果

/* ============ 菜单文案 ============ */

const WELCOME_TEXT = `👋 欢迎来到 LTZZZ AGI 实验室！

请选择您的身份：
1️⃣ 人类
2️⃣ AI

直接回复数字 1 或 2，或回复「人类」/「AI」`;

const HUMAN_MENU = `👤 人类用户主菜单

请选择您需要的服务：
1️⃣ 会员中心
2️⃣ 服务大厅
3️⃣ 我的任务
4️⃣ 我的结果
5️⃣ 联系管理员

直接回复数字选择`;

const AI_MENU = `🤖 AI 用户主菜单

这里是 LTZZZ 面向 AI 代理的六条对话通道：

1️⃣ GPT (OpenAI)
2️⃣ DeepSeek
3️⃣ Claude
4️⃣ 豆包
5️⃣ Grok (XAI)
6️⃣ Microsoft Copilot

请选择要接入的 AI（回复数字 1-6）`;

const AI_CHANNEL_DETAIL = {
  1: `🤖 GPT (OpenAI)
· 代理 Worker：ltzzz-gpt-proxy-worker.js
· 接口：POST /chat
· 网页入口：ai-chat.html`,
  2: `🤖 DeepSeek
· 代理 Worker：deepseek-proxy-worker.js
· 接口：POST /chat
· 网页入口：deepseek.html`,
  3: `🤖 Claude
· 代理 Worker：claude-proxy-worker.js
· 接口：POST /chat
· 网页入口：claude.html`,
  4: `🤖 豆包
· 代理 Worker：doubao-proxy-worker.js
· 接口：POST /chat
· 网页入口：doubao.html`,
  5: `🤖 Grok (XAI)
· 知识库入口：knowledge/ai-chats/XIA/`,
  6: `🤖 Microsoft Copilot
· 知识库入口：knowledge/ai-chats/Microsoft/`,
};

const MEMBER_MENU = `💎 会员中心

1️⃣ 查看会员等级
2️⃣ 会员权益说明
3️⃣ 开通/续费会员
4️⃣ 返回主菜单

直接回复数字选择`;

const SERVICE_MENU = `🛠️ 服务大厅

1️⃣ AI 对话服务
2️⃣ 内容生成服务
3️⃣ 数据分析服务
4️⃣ 定制开发服务
5️⃣ 返回主菜单

直接回复数字选择`;

const TASK_MENU = `📝 我的任务

1️⃣ 提交新任务
2️⃣ 查看进行中任务
3️⃣ 查看历史任务
4️⃣ 返回主菜单

直接回复数字选择`;

const RESULT_MENU = `📊 我的结果

1️⃣ 今日产出
2️⃣ 本周产出
3️⃣ 全部结果
4️⃣ 返回主菜单

直接回复数字选择`;

/* ============ 指令处理 ============ */

async function handleWebhook(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    return json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN", note: "等待人工凭证（@BotFather）" }, { status: 500, ...cors() });
  }

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

    let reply = await handleMessage(chatId, text);

    await tgApi(token, "sendMessage", {
      chat_id: chatId,
      text: reply,
      parse_mode: "Markdown",
    });
  }

  return json({ ok: true }, cors());
}

async function handleMessage(chatId, text) {
  const state = userState.get(chatId) || "WELCOME";

  // /start 指令
  if (text === "/start") {
    userState.set(chatId, "WELCOME");
    return WELCOME_TEXT;
  }

  // 状态机处理
  switch (state) {
    case "WELCOME":
      return handleWelcome(chatId, text);
    case "HUMAN_MAIN":
      return handleHumanMenu(chatId, text);
    case "AI_MAIN":
      return handleAIMenu(chatId, text);
    case "MEMBER":
      return handleMemberMenu(chatId, text);
    case "SERVICE":
      return handleServiceMenu(chatId, text);
    case "TASK":
      return handleTaskMenu(chatId, text);
    case "RESULT":
      return handleResultMenu(chatId, text);
    default:
      userState.set(chatId, "WELCOME");
      return WELCOME_TEXT;
  }
}

function handleWelcome(chatId, text) {
  const t = text.toLowerCase();
  if (t === "1" || t === "人类" || t === "human") {
    userState.set(chatId, "HUMAN_MAIN");
    return HUMAN_MENU;
  }
  if (t === "2" || t === "ai" || t === "机器人") {
    userState.set(chatId, "AI_MAIN");
    return AI_MENU;
  }
  return WELCOME_TEXT;
}

function handleHumanMenu(chatId, text) {
  const t = text;
  if (t === "1") {
    userState.set(chatId, "MEMBER");
    return MEMBER_MENU;
  }
  if (t === "2") {
    userState.set(chatId, "SERVICE");
    return SERVICE_MENU;
  }
  if (t === "3") {
    userState.set(chatId, "TASK");
    return TASK_MENU;
  }
  if (t === "4") {
    userState.set(chatId, "RESULT");
    return RESULT_MENU;
  }
  if (t === "5") {
    return "📞 管理员联系方式：ltzyz2181@gmail.com\n\n" + HUMAN_MENU;
  }
  return HUMAN_MENU;
}

function handleAIMenu(chatId, text) {
  const t = text;
  if (["1", "2", "3", "4", "5", "6"].includes(t)) {
    const detail = AI_CHANNEL_DETAIL[t];
    return detail + "\n\n" + AI_MENU;
  }
  return AI_MENU;
}

function handleMemberMenu(chatId, text) {
  const t = text;
  if (t === "1") {
    return "💎 当前会员等级：普通用户\n\n" + MEMBER_MENU;
  }
  if (t === "2") {
    return "💎 会员权益：\n· 无限 AI 对话\n· 优先任务处理\n· 专属通道\n· 月度报告\n\n" + MEMBER_MENU;
  }
  if (t === "3") {
    return "💎 开通/续费会员：\n请联系管理员 ltzyz2181@gmail.com\n\n" + MEMBER_MENU;
  }
  if (t === "4") {
    userState.set(chatId, "HUMAN_MAIN");
    return HUMAN_MENU;
  }
  return MEMBER_MENU;
}

function handleServiceMenu(chatId, text) {
  const t = text;
  if (t === "1") {
    return "🛠️ AI 对话服务：\n· GPT / DeepSeek / Claude / 豆包 / Grok / Copilot\n· 24x7 在线\n\n" + SERVICE_MENU;
  }
  if (t === "2") {
    return "🛠️ 内容生成服务：\n· 文章 / 脚本 / 文案 / 视频脚本\n· 每日自动产出\n\n" + SERVICE_MENU;
  }
  if (t === "3") {
    return "🛠️ 数据分析服务：\n· 财务 / 市场 / 用户行为分析\n· 可视化报告\n\n" + SERVICE_MENU;
  }
  if (t === "4") {
    return "🛠️ 定制开发服务：\n· Web / App / 自动化脚本\n· 按需报价\n\n" + SERVICE_MENU;
  }
  if (t === "5") {
    userState.set(chatId, "HUMAN_MAIN");
    return HUMAN_MENU;
  }
  return SERVICE_MENU;
}

function handleTaskMenu(chatId, text) {
  const t = text;
  if (t === "1") {
    return "📝 提交新任务：\n请直接描述您的任务需求，管理员会在 24 小时内回复。\n\n" + TASK_MENU;
  }
  if (t === "2") {
    return "📝 进行中任务：暂无\n\n" + TASK_MENU;
  }
  if (t === "3") {
    return "📝 历史任务：暂无\n\n" + TASK_MENU;
  }
  if (t === "4") {
    userState.set(chatId, "HUMAN_MAIN");
    return HUMAN_MENU;
  }
  return TASK_MENU;
}

function handleResultMenu(chatId, text) {
  const t = text;
  if (t === "1") {
    return "📊 今日产出：\n· 6 AI 每日报告已生成\n· 详见 https://ltzzz.com/agents.html\n\n" + RESULT_MENU;
  }
  if (t === "2") {
    return "📊 本周产出：\n· 详见实验室归档\n\n" + RESULT_MENU;
  }
  if (t === "3") {
    return "📊 全部结果：\n· 详见 https://ltzzz.com\n\n" + RESULT_MENU;
  }
  if (t === "4") {
    userState.set(chatId, "HUMAN_MAIN");
    return HUMAN_MENU;
  }
  return RESULT_MENU;
}

/* ============ /send 处理 ============ */

async function handleSend(request, env) {
  const token = env.TELEGRAM_BOT_TOKEN;
  if (!token) return json({ ok: false, error: "missing TELEGRAM_BOT_TOKEN" }, { status: 500, ...cors() });

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
