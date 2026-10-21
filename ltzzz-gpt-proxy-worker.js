import {modelConfiguration} from './lib/model-configuration.js';
import {proxyAuth,proxyAuthState,authCheck} from './lib/proxy-auth.js';
import {beginExecution,finishExecution} from './lib/provider-execution.js';
/**
 * LTZZZ GPT 通道 Worker（框架）
 * 接口：POST /chat、POST /status、GET /health
 * 密钥：OPENAI_API_KEY / OPENAI_BASE_URL（Cloudflare Secret，绝不入前端/仓库）
 * 状态：代码框架就绪；部署 + Key 待人工授权。
 */
const DEFAULT_BASE = "https://api.openai.com/v1";

async function json(obj, status = 200, headers = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

function maskKey(k) {
  if (!k || k.length < 8) return "***";
  return k.slice(0, 3) + "***" + k.slice(-3);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (request.method === "GET" && path === "/health") {
      const hasKey = !!(env.OPENAI_API_KEY || "");
      return json({ ok: true, engine: "gpt-proxy", key_configured: hasKey, ...proxyAuthState(env), identity_receipt_revision:'ltzzz.provider-execution.v1', ...modelConfiguration(null,{source:'request_required'}), model_selection:'request_selected' });
    }

    if(request.method==='GET'&&path==='/auth/check')return authCheck(request,env,{legacyToken:env.ACCESS_TOKEN});

    const denied=await proxyAuth(request,env,{legacyToken:env.ACCESS_TOKEN});if(denied)return denied;
    if (request.method !== "POST") return json({ error: "method not allowed" }, 405);

    let body = {};
    try { body = await request.json(); } catch { return json({ error: "invalid json" }, 400); }

    if (path === "/status") {
      return json({
        ok: true,
        key_configured: !!(env.OPENAI_API_KEY || ""),
        base_url: env.OPENAI_BASE_URL || DEFAULT_BASE,
        note: "ChatGPT网页订阅≠API，需独立API Key",
      });
    }

    if (path === "/chat") {
      const key = env.OPENAI_API_KEY || "";
      if (!key) return json({ ok: false, error: "OPENAI_API_KEY 未配置（缺 Cloudflare Secret）" }, 503);
      const base = (env.OPENAI_BASE_URL || DEFAULT_BASE).replace(/\/+$/, "");
      const model = body.model || "gpt-4o-mini";
      const messages = Array.isArray(body.messages) ? body.messages : [];
      const execution=beginExecution('gpt',model,body.task_id);
      try {
        const r = await fetch(`${base}/chat/completions`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: "Bearer " + key,
          },
          body: JSON.stringify({ model, messages, max_tokens: body.max_tokens || 1024 }),
        });
        const data = await r.json();
        if (!r.ok) {
          return json({ ok: false, status: r.status, error: (data.error && data.error.message) || "upstream error" }, 502);
        }
        // 用量日志（不落敏感内容）
        const usage = data.usage || {};
        return json({
          ok: true,
          reply: data.choices && data.choices[0] && data.choices[0].message ? data.choices[0].message.content : "",
          model: data.model || null,
          requested_model:model,
          ltzzz_receipt:finishExecution(execution,{http:r.status,data,upstreamRequestId:r.headers.get('x-request-id')}),
          usage,
        });
      } catch (e) {
        return json({ ok: false, error: "upstream fetch failed: " + e.message }, 502);
      }
    }

    return json({ error: "not found" }, 404);
  },
};
