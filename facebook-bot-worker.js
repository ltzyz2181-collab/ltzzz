/**
 * LTZZZ Facebook Bot Worker（Cloudflare Worker 适配器）
 * ------------------------------------------------------------------
 * 端点：
 *   GET  /webhook   Graph webhook 验证（hub.challenge 回显）
 *   POST /webhook   页面消息回调（Messaging webhook）
 *   POST /send      主动发页面消息（内部用）
 *   GET  /status    健康检查（CORS 全开，5xx 兜底）
 *
 * 鉴权方案：
 *   - FB_VERIFY_TOKEN        注册 webhook 时自定义的验证令牌（GET 验证比对）
 *   - FB_PAGE_ACCESS_TOKEN   页面访问令牌（调 Graph API 回消息）
 *   - FB_PAGE_ID             页面 ID（非密钥但走 env）
 *   - FB_APP_SECRET          可选，验签 X-Hub-Signature-256（推荐配置）
 *
 * 所需 env 清单（全部 Cloudflare Secret，代码不出现真实值）：
 *   FB_VERIFY_TOKEN        —— 状态：等待人工凭证（Meta 应用后台自定义）
 *   FB_PAGE_ACCESS_TOKEN   —— 状态：等待人工凭证（页面令牌）
 *   FB_PAGE_ID             —— 状态：等待人工凭证（页面 ID）
 *   FB_APP_SECRET          —— 状态：等待人工凭证（可选，应用凭证里）
 *
 * 人机门禁：与 Telegram / WhatsApp / X 通道共用同一文案；
 *           首条消息先问「人类/AI」，判 AI 后回复六个 LTZZZ AI 通道指引，
 *           判人类走人类路径，判定不清追问一次，二次仍不清默认按 AI 通道指引。
 * 注意：Worker 无状态，门禁会话态保存在单 isolate 内存 Map（重启即失，演示级）。
 */
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    try {
      // ---- webhook 验证（GET）----
      if (path === "/webhook" && request.method === "GET") {
        const params = url.searchParams;
        const mode = params.get("hub.mode");
        const token = params.get("hub.verify_token");
        const challenge = params.get("hub.challenge");
        if (mode === "subscribe" && token && token === env.FB_VERIFY_TOKEN && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain", ...cors() },
          });
        }
        return json({ ok: false, error: "verify_failed" }, { status: 403, ...cors() });
      }

      // ---- 页面消息回调（POST）----
      if (path === "/webhook" && request.method === "POST") {
        return await handleMessage(request, env);
      }

      // ---- 主动发消息（内部，Bearer 门禁）----
      if (path === "/send" && request.method === "POST") {
        return await handleSend(request, env);
      }

      // ---- 健康检查 ----
      if (path === "/status" && request.method === "GET") {
        return json({
          ok: true,
          channel: "facebook",
          bot: "ltzzz-facebook-bot",
          page_token_configured: Boolean(env.FB_PAGE_ACCESS_TOKEN),
          verify_token_configured: Boolean(env.FB_VERIFY_TOKEN),
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
    "Access-Control-Allow-Headers": "Content-Type,Authorization,X-Hub-Signature-256",
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

/** 从 Facebook page messaging 回调体抽取统一消息模型；无文本消息返回 null */
function normalizeFB(body) {
  try {
    if (body.object !== "page") return null;
    const evt = (body.entry?.[0]?.messaging?.[0]) || null;
    if (!evt || !evt.message) return null;
    return {
      platform: "facebook",
      chat_id: evt.sender?.id || null,
      text: String(evt.message.text || "").trim(),
      sender: {
        id: evt.sender?.id || null,
        name: null, // page messaging 不直接给昵称，需再查 Graph
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
  // 可选：校验 X-Hub-Signature-256
  if (env.FB_APP_SECRET) {
    const sig = request.headers.get("X-Hub-Signature-256") || "";
    const raw = await request.text();
    if (!(await verifyHubSignature(raw, env.FB_APP_SECRET, sig))) {
      return json({ ok: false, error: "bad signature" }, { status: 403, ...cors() });
    }
    return await processFbPayload(JSON.parse(raw), env);
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "bad json" }, cors());
  return await processFbPayload(body, env);
}

async function processFbPayload(body, env) {
  const msg = normalizeFB(body);
  if (msg && msg.chat_id && msg.text) {
    const reply = gateDecide(msg.chat_id, msg.text);
    if (reply) await sendFBText(env, msg.chat_id, reply);
  }
  return json({ ok: true }, cors());
}

async function handleSend(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.FB_VERIFY_TOKEN || ""}`) {
    return json({ ok: false, error: "unauthorized" }, { status: 401, ...cors() });
  }
  const body = await request.json().catch(() => null);
  if (!body || !body.chat_id || !body.text) {
    return json({ ok: false, error: "missing chat_id or text" }, { status: 400, ...cors() });
  }
  const res = await sendFBText(env, body.chat_id, String(body.text).slice(0, 2000));
  return json({ ok: true, result: res }, cors());
}

async function sendFBText(env, recipientId, text) {
  if (!env.FB_PAGE_ACCESS_TOKEN) {
    return { skipped: "missing_credentials", to: recipientId }; // 等待人工凭证
  }
  const url = `https://graph.facebook.com/v21.0/${env.FB_PAGE_ID || "me"}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      recipient: { id: String(recipientId) },
      messaging_type: "RESPONSE",
      message: { text },
      access_token: env.FB_PAGE_ACCESS_TOKEN,
    }),
  });
  return resp.json().catch(() => ({ status: resp.status }));
}

/* ---------------- 工具：HMAC 验签 ---------------- */

async function verifyHubSignature(rawBody, secret, signatureHeader) {
  const m = /^sha256=([a-f0-9]+)$/.exec(signatureHeader || "");
  if (!m) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sigBuf = await crypto.subtle.sign("HMAC", key, enc.encode(rawBody));
  const hex = [...new Uint8Array(sigBuf)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return timingSafeEqual(hex, m[1]);
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
