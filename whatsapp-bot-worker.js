/**
 * LTZZZ WhatsApp Bot Worker（Cloudflare Worker 适配器）
 * ------------------------------------------------------------------
 * 端点：
 *   GET  /webhook   Meta Graph API webhook 验证（hub.challenge 回显）
 *   POST /webhook   WhatsApp 消息回调
 *   POST /send      主动发文本（内部用）
 *   GET  /status    健康检查（CORS 全开，5xx 兜底）
 *
 * 鉴权方案：
 *   - WHATSAPP_VERIFY_TOKEN    注册 webhook 时填写的验证令牌（GET 验证比对）
 *   - WHATSAPP_ACCESS_TOKEN    Meta 系统用户/临时访问令牌（调 Graph API 发消息）
 *   - WHATSAPP_PHONE_NUMBER_ID 发件手机号 ID（Graph 路径段，非密钥但走 env）
 *   - WHATSAPP_APP_SECRET      可选，验签 X-Hub-Signature-256（推荐配置）
 *
 * 所需 env 清单（全部 Cloudflare Secret，代码不出现真实值）：
 *   WHATSAPP_VERIFY_TOKEN       —— 状态：等待人工凭证（Meta 应用后台生成）
 *   WHATSAPP_ACCESS_TOKEN       —— 状态：等待人工凭证（Meta 系统用户令牌）
 *   WHATSAPP_PHONE_NUMBER_ID    —— 状态：等待人工凭证（Meta WhatsApp 号码 ID）
 *   WHATSAPP_APP_SECRET         —— 状态：等待人工凭证（可选，应用凭证里）
 *
 * 人机门禁：与 Telegram 通道共用同一文案；首条消息先问「人类/AI」，
 *           判 AI 后回复六个 LTZZZ AI 通道指引，判人类走人类路径，
 *           判定不清追问一次，二次仍不清默认按 AI 通道指引处理。
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
        if (mode === "subscribe" && token && token === env.WHATSAPP_VERIFY_TOKEN && challenge) {
          return new Response(challenge, {
            status: 200,
            headers: { "Content-Type": "text/plain", ...cors() },
          });
        }
        return json({ ok: false, error: "verify_failed" }, { status: 403, ...cors() });
      }

      // ---- 消息回调（POST）----
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
          channel: "whatsapp",
          bot: "ltzzz-whatsapp-bot",
          access_token_configured: Boolean(env.WHATSAPP_ACCESS_TOKEN),
          verify_token_configured: Boolean(env.WHATSAPP_VERIFY_TOKEN),
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
 * 各平台 webhook 体不同，统一抽成：
 *   { platform, chat_id, text, sender }
 * ------------------------------------------------ */

/** 从 Meta WhatsApp 回调体抽取统一消息模型；无文本消息返回 null */
function normalizeWhatsApp(body) {
  try {
    const change = (body.entry?.[0]?.changes?.[0]) || null;
    const value = change?.value || {};
    const waMsg = (value.messages?.[0]) || null;
    if (!waMsg) return null;
    const contact = value.contacts?.[0] || {};
    return {
      platform: "whatsapp",
      chat_id: waMsg.from || null,
      text: waMsg.type === "text" && waMsg.text ? String(waMsg.text.body || "").trim() : "",
      sender: {
        id: waMsg.from || null,
        name: contact.profile?.name || null,
        phone: waMsg.from || null,
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
  const aiHit = /\b(ai|gpt|bot|robot|chatgpt|claude|deepseek|copilot|grok|automated|机器|机器人|智能体|自动)\b/.test(t) ||
    t.includes("ai") || t.includes("AI");
  const humanHit = /\b(human|human?\s*access|真人|人类|人访问|人)\b/.test(t) ||
    /人类|真人|我是人/.test(t);
  if (aiHit && !humanHit) return "ai";
  if (humanHit && !aiHit) return "human";
  return "unclear";
}

/** 返回应当回复的文本；无回复返回 null */
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
  // unclear
  const st = gateState.get(chatId);
  if (!st) {
    gateState.set(chatId, "asked_gate");
    return GATE_ASK;
  }
  if (st === "asked_gate") {
    gateState.set(chatId, "asked_retry");
    return GATE_RETRY;
  }
  // 二次仍不清：默认按 AI 通道指引兜底（门禁可由人工复核）
  gateState.set(chatId, "resolved");
  return AI_REPLY;
}

/* ---------------- 消息处理 ---------------- */

async function handleMessage(request, env) {
  // 可选：校验 X-Hub-Signature-256
  if (env.WHATSAPP_APP_SECRET) {
    const sig = request.headers.get("X-Hub-Signature-256") || "";
    const raw = await request.text();
    if (!(await verifyHubSignature(raw, env.WHATSAPP_APP_SECRET, sig))) {
      return json({ ok: false, error: "bad signature" }, { status: 403, ...cors() });
    }
    return await processWhatsAppPayload(JSON.parse(raw), env);
  }

  const body = await request.json().catch(() => null);
  if (!body) return json({ ok: false, error: "bad json" }, cors());
  return await processWhatsAppPayload(body, env);
}

async function processWhatsAppPayload(body, env) {
  const msg = normalizeWhatsApp(body);
  if (msg && msg.chat_id && msg.text) {
    const reply = gateDecide(msg.chat_id, msg.text);
    if (reply) await sendWhatsAppText(env, msg.chat_id, reply);
  }
  // Meta 要求尽快 200，避免重投
  return json({ ok: true }, cors());
}

async function handleSend(request, env) {
  const auth = request.headers.get("Authorization") || "";
  if (auth !== `Bearer ${env.WHATSAPP_VERIFY_TOKEN || ""}`) {
    return json({ ok: false, error: "unauthorized" }, { status: 401, ...cors() });
  }
  const body = await request.json().catch(() => null);
  if (!body || !body.chat_id || !body.text) {
    return json({ ok: false, error: "missing chat_id or text" }, { status: 400, ...cors() });
  }
  const res = await sendWhatsAppText(env, body.chat_id, String(body.text).slice(0, 4096));
  return json({ ok: true, result: res }, cors());
}

async function sendWhatsAppText(env, to, text) {
  if (!env.WHATSAPP_ACCESS_TOKEN || !env.WHATSAPP_PHONE_NUMBER_ID) {
    // 无凭证时不真调接口，仅记录（等待人工凭证）
    return { skipped: "missing_credentials", to };
  }
  const url = `https://graph.facebook.com/v21.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
  const resp = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: String(to),
      text: { body: text },
    }),
  });
  return resp.json().catch(() => ({ status: resp.status }));
}

/* ---------------- 工具：HMAC 验签 ---------------- */

async function verifyHubSignature(rawBody, secret, signatureHeader) {
  // signatureHeader 形如 sha256=xxxx
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
