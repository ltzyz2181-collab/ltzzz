/**
 * LTZZZ X (Twitter) Bot Worker（Cloudflare Worker 适配器）
 * ------------------------------------------------------------------
 * 端点：
 *   GET  /webhook   API v2 Account Activity webhook CRC 校验（?crc_token=...）
 *   POST /webhook   DM / 事件回调
 *   POST /send      主动发 DM（内部用）
 *   GET  /status    健康检查（CORS 全开，5xx 兜底）
 *
 * 鉴权方案：
 *   - X_CONSUMER_KEY      OAuth 1.0a Consumer Key（API Key）——占位
 *   - X_CONSUMER_SECRET   OAuth 1.0a Consumer Secret（API Secret）——占位，CRC HMAC 用它
 *   - X_BEARER_TOKEN      API v2 Bearer Token（发 DM）——占位
 *
 * 所需 env 清单（全部 Cloudflare Secret，代码不出现真实值）：
 *   X_CONSUMER_KEY      —— 状态：等待人工凭证（X Developer Portal）
 *   X_CONSUMER_SECRET   —— 状态：等待人工凭证（X Developer Portal）
 *   X_BEARER_TOKEN      —— 状态：等待人工凭证（X Developer Portal）
 *
 * 人机门禁：与 Telegram / WhatsApp / Facebook 通道共用同一文案；
 *           首条消息先问「人类/AI」，判 AI 后回复六个 LTZZZ AI 通道指引，
 *           判人类走人类路径，判定不清追问一次，二次仍不清默认按 AI 通道指引。
 * 注意：Worker 无状态，门禁会话态保存在单 isolate 内存 Map（重启即失，演示级）。
 */

/* ---------------- 公开账号信息（仅文档 / /status 展示，不用于鉴权） ---------------- */
const PUBLIC_X_HANDLE = "@ltinzh1248958";
const PUBLIC_CHANNEL_INFO = {
  channel: "x",
  name: "X (Twitter)",
  public_handle: PUBLIC_X_HANDLE,
  note: "公开账号信息，仅供文档与状态接口展示；handle 已由用户确认无误。鉴权仍只走 env Secret，本常量不参与任何校验。",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    try {
      // ---- CRC 校验（GET）----
      if (path === "/webhook" && request.method === "GET") {
        const crc = url.searchParams.get("crc_token");
        if (!crc || !env.X_CONSUMER_SECRET) {
          return json({ ok: false, error: "bad crc" }, { status: 400, ...cors() });
        }
        const sig = await hmacSha256Base64(env.X_CONSUMER_SECRET, crc);
        return json({ response_token: `sha256=${sig}` }, cors());
      }

      // ---- 事件回调（POST）----
      if (path === "/webhook" && request.method === "POST") {
        return await handleMessage(request, env);
      }

      // ---- 主动发 DM（内部，Bearer 门禁）----
      if (path === "/send" && request.method === "POST") {
        return await handleSend(request, env);
      }

      // ---- 健康检查 ----
      if (path === "/status" && request.method === "GET") {
        return json({
          ok: true,
          channel: "x",
          bot: "ltzzz-x-bot",
          bearer_configured: Boolean(env.X_BEARER_TOKEN),
          consumer_secret_configured: Boolean(env.X_CONSUMER_SECRET),
          channel_public_info: PUBLIC_CHANNEL_INFO,
          ts: Date.now(),
        }, cors());
      }

      return json({ ok: false, error: "not_found" }, { status: 404, ...cors() });
    } catch (e) {
      return json(
        { ok: false, error: "internal", detail: String((e && e.message) || e) },
        { status: 500, ...cors() }
      );
    }
  },
};

/* ---------------- 公共：CORS / JSON ---------------- */

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(obj, extra = {}) {
  return new Response(JSON.stringify(obj), {
    status: 200,
    headers: { "Content-Type": "application/json", ...extra },
  });
}

/* ---------------- 统一消息模型 ----------------
 * 统一抽成：{ platform, chat_id, text, sender }
 * ------------------------------------------------ */

/** 从 X v2 Account Activity 回调体抽取统一消息模型；无 DM 文本返回 null */
function normalizeX(body) {
  try {
    // DM 事件：{ dm_events: [ { id, text, sender_id, ... } ], users: {...} }
    const dm = (body.dm_events?.[0]) || null;
    if (!dm) return null;
    const senderId = dm.sender_id || null;
    const u = senderId && body.users ? body.users[senderId] : null;
    return {
      platform: "x",
      chat_id: senderId, // DM 会话以参与者 user_id 为键
      text: String(dm.text || "").trim(),
      sender: {
        id: senderId,
        name: u?.name || null,
        username: u?.username || null,
      },
    };
  } catch {
    return null;
  }
}

/* ---------------- 人机门禁（与 Telegram 共用文案） ---------------- */

const GATE_ASK =
  "你好，这里是 LTZZZ 消息通道 ✅\n请问你是【人类访问】还是【AI 访问】？\n回复「人类」走人类路径，回复「AI」获取六个 LTZZZ AI 通道指引。";

const GATE_RETRY =
  "暂未识别身份，请再明确一次：回复「人类」走人类路径，或回复「AI」获取六个 LTZZZ AI 通道指引。";

const HUMAN_REPLY =
  "已识别为人类访问 ✅\n请直接说明你的需求（任务 / 问题 / 合作），LTZZZ 会由人工或人工审核后处理。";

const AI_REPLY = [
  "已识别为 AI 访问 ✅\n以下是六个 LTZZZ AI 通道，请前往对应官方通道发起协作：",
  "1. GPT / OpenAI —— ChatGPT 官方",
  "2. DeepSeek —— 深度求索",
  "3. Claude —— Anthropic",
  "4. 豆包 —— 字节跳动",
  "5. Microsoft Copilot —— 微软",
  "6. XIA / Grok —— X 平台",
  "请携带本会话标识，由对应 AI 通道回传任务结果。",
].join("\n");

const gateState = new Map(); // chat_id -> 'asked_gate' | 'asked_retry' | 'resolved'

function classify(text) {
  const t = (text || "").toLowerCase();
  const aiHit = /\b(ai|gpt|bot|robot|chatgpt|claude|deepseek|copilot|grok|automated|机器|机器人|智能体|自动)\b/.test(t);
  const humanHit = /\b(human|真人|人类|人访问|人)\b/.test(t) || /人类|真人|我是人/.test(t);
  if (aiHit && !humanHit) return "ai";
  if (humanHit && !aiHit) return "human";
  return "unclear";
}

function gateDecide(chatId, text) {
  const cls = classify(text);
  if (cls === "ai") {
    gateState.set(chatId, "resolved");
    return AI_REPLY;
  }
  if (cls === "human") {
    gateState.set(chatId, "resolved");
    return HUMAN_REPLY;
  }
  const st = gateState.get(chatId);
  if (!st) {
    gateState.set(chatId, "asked_gate");
    return GATE_ASK;
  }
  if (st === "asked_gate") {
    gateState.set(chatId, "asked_retry");
    return GATE_RETRY;
  }
  gateState.set(chatId, "resolved");
  return AI_REPLY;
}

/* ---------------- 消息处理 ---------------- */

async function handleMessage(request, env) {
  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "bad json" }, cors());

  const msg = normalizeX(body);
  if (msg && msg.chat_id && msg.text) {
    const reply = gateDecide(msg.chat_id, msg.text);
    if (reply) await sendXDM(env, msg.chat_id, reply);
  }
  return json({ ok: true, received: true }, cors());
}

async function handleSend(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.X_BEARER_TOKEN || ""}`) {
    return json({ ok: false, error: "unauthorized" }, { status: 401, ...cors() });
  }
  const body = await request.json().catch(() => null);
  if (!body || !body.chat_id || !body.text) {
    return json({ ok: false, error: "missing chat_id or text" }, { status: 400, ...cors() });
  }
  const res = await sendXDM(env, body.chat_id, String(body.text).slice(0, 10000));
  return json({ ok: true, result: res }, cors());
}

async function sendXDM(env, participantId, text) {
  if (!env.X_BEARER_TOKEN) {
    return { skipped: "missing_credentials", to: participantId }; // 等待人工凭证
  }
  const url = `https://api.twitter.com/2/dm_conversations/with/${encodeURIComponent(participantId)}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.X_BEARER_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ text }),
  });
  return resp.json().catch(() => ({ status: resp.status }));
}

/* ---------------- 工具：HMAC-SHA256 Base64 ---------------- */

async function hmacSha256Base64(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return b64encode(sig);
}

function b64encode(buf) {
  let bin = "";
  const bytes = new Uint8Array(buf);
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}
