/**
 * call-deepseek.mjs — DeepSeek 通道真实调用（密钥只从环境变量读取）
 */
import {routedModel} from './model-routing.mjs';
export async function callAgent({ apiKey, prompt, model, maxTokens = 8192 }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "DEEPSEEK_API_KEY 未配置（请在 GitHub Secrets 添加）" };
  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      signal: AbortSignal.timeout(240000),
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || process.env.DEEPSEEK_MODEL || routedModel("deepseek","deepseek-reasoner"),
        ...(/deepseek-(?:v\d+(?:-\d+)?-)?(pro|flash)/.test(model || process.env.DEEPSEEK_MODEL || routedModel('deepseek','deepseek-reasoner')) ? {thinking:{type:'enabled'}} : {}),
        messages: [
          { role: "system", content: "你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。" },
          { role: "user", content: prompt },
        ],
        max_tokens: maxTokens,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, status: "api_error", error: `HTTP ${resp.status}: ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    const output = (data.choices?.[0]?.message?.content || "").trim();
    return { ok: !!output, status: output ? "success" : "empty_output", output, finish_reason: data.choices?.[0]?.finish_reason, tokens_used: data.usage?.total_tokens || 0, model: model || process.env.DEEPSEEK_MODEL || routedModel("deepseek","deepseek-reasoner") };
  } catch (e) {
    return { ok: false, status: "exception", error: String(e) };
  }
}
