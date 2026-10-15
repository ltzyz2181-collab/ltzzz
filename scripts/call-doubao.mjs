import {preconnectFetch,networkCode} from './lib/preconnect-fetch.mjs';
/**
 * call-doubao.mjs — 豆包通道真实调用
 * 端点：默认火山方舟 v3（OpenAI 兼容，已实测该 Key 可用）；可用环境变量切换到 Agent Plan 端点
 * 默认 Base https://ark.cn-beijing.volces.com/api/v3，模型 doubao-seed-evolving（实测可调用）
 * 密钥：DOUBAO_API_KEY（兼容旧 ARK_API_KEY），GitHub Secrets 注入
 * 实现：先试 OpenAI 风格 {base}/chat/completions；404/405 时退回 Anthropic 风格 {base}/v1/messages
 */
import {routedModel} from './model-routing.mjs';
const BASE = () => process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const MODEL = () => process.env.DOUBAO_MODEL || routedModel("doubao","doubao-seed-evolving");

async function tryOpenAICompatible(apiKey, prompt, base, model, maxTokens, thinking) {
  const resp = await preconnectFetch(`${base}/chat/completions`, {
    method: "POST",
      signal: AbortSignal.timeout(240000),
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      ...(thinking?{thinking:{type:thinking}}:{}),
      messages: [
        { role: "system", content: "你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。" },
        { role: "user", content: prompt },
      ],
      max_tokens: maxTokens,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 404 || resp.status === 405) return { kind: "unsupported", text: t.slice(0, 200) };
    return { kind: "error", status: resp.status, text: t.slice(0, 200) };
  }
  const data = await resp.json();
  const output = (data.choices?.[0]?.message?.content || "").trim();
  return { kind: "ok", output, finish_reason: data.choices?.[0]?.finish_reason, tokens_used: data.usage?.total_tokens || 0, model:data.model||model, model_source:data.model?"provider_response":"requested_model" };
}

async function tryAnthropicCompatible(apiKey, prompt, base, model, maxTokens) {
  const resp = await preconnectFetch(`${base}/v1/messages`, {
    method: "POST",
      signal: AbortSignal.timeout(240000),
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { kind: "error", status: resp.status, text: t.slice(0, 200) };
  }
  const data = await resp.json();
  const output = (data.content?.[0]?.text || "").trim();
  return { kind: "ok", output, finish_reason: data.stop_reason, tokens_used: (data.usage?.input_tokens || 0)+(data.usage?.output_tokens || 0), model:data.model||model, model_source:data.model?"provider_response":"requested_model" };
}

export async function callAgent({ apiKey, prompt, model, maxTokens = 8192, thinking }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "DOUBAO_API_KEY（或 ARK_API_KEY）未配置（请在 GitHub Secrets 添加）" };
  const base = BASE();
  const mdl = model || MODEL();
  try {
    const r1 = await tryOpenAICompatible(apiKey, prompt, base, mdl, maxTokens, thinking);
    if (r1.kind === "ok") return { ok: !!r1.output, status: r1.output ? "success" : "empty_output", output: r1.output, finish_reason: r1.finish_reason, tokens_used: r1.tokens_used, model: r1.model, model_source:r1.model_source };
    if (r1.kind === "unsupported") {
      const r2 = await tryAnthropicCompatible(apiKey, prompt, base, mdl, maxTokens);
      if (r2.kind === "ok") return { ok: !!r2.output, status: r2.output ? "success" : "empty_output", output: r2.output, finish_reason:r2.finish_reason, tokens_used: r2.tokens_used, model: r2.model, model_source:r2.model_source };
      return { ok: false, status: "api_error", error: `openai-style 404/405，anthropic-style HTTP ${r2.status}: ${r2.text}` };
    }
    return { ok: false, status: "api_error", error: `HTTP ${r1.status}: ${r1.text}` };
  } catch (e) {
    return { ok: false, status: "exception", network_error_code:networkCode(e),error: (String(e)+'; network_code='+networkCode(e)).replaceAll(apiKey,'[REDACTED]') };
  }
}
