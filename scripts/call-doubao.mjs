/**
 * call-doubao.mjs — 豆包通道真实调用
 * 端点：默认火山方舟 v3（OpenAI 兼容，已实测该 Key 可用）；可用环境变量切换到 Agent Plan 端点
 * 默认 Base https://ark.cn-beijing.volces.com/api/v3，模型 doubao-1-5-pro-32k-250115
 * 密钥：DOUBAO_API_KEY（兼容旧 ARK_API_KEY），GitHub Secrets 注入
 * 实现：先试 OpenAI 风格 {base}/chat/completions；404/405 时退回 Anthropic 风格 {base}/v1/messages
 */
const BASE = () => process.env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3";
const MODEL = () => process.env.DOUBAO_MODEL || "doubao-1-5-pro-32k-250115";

async function tryOpenAICompatible(apiKey, prompt, base, model) {
  const resp = await fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: "你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。" },
        { role: "user", content: prompt },
      ],
      max_tokens: 600,
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    if (resp.status === 404 || resp.status === 405) return { kind: "unsupported", text: t.slice(0, 200) };
    return { kind: "error", status: resp.status, text: t.slice(0, 200) };
  }
  const data = await resp.json();
  const output = (data.choices?.[0]?.message?.content || "").trim();
  return { kind: "ok", output, tokens_used: data.usage?.total_tokens || 0 };
}

async function tryAnthropicCompatible(apiKey, prompt, base, model) {
  const resp = await fetch(`${base}/v1/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model,
      max_tokens: 600,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  if (!resp.ok) {
    const t = await resp.text();
    return { kind: "error", status: resp.status, text: t.slice(0, 200) };
  }
  const data = await resp.json();
  const output = (data.content?.[0]?.text || "").trim();
  return { kind: "ok", output, tokens_used: data.usage?.input_tokens || 0 };
}

export async function callAgent({ apiKey, prompt, model }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "DOUBAO_API_KEY（或 ARK_API_KEY）未配置（请在 GitHub Secrets 添加）" };
  const base = BASE();
  const mdl = model || MODEL();
  try {
    const r1 = await tryOpenAICompatible(apiKey, prompt, base, mdl);
    if (r1.kind === "ok") return { ok: true, status: "success", output: r1.output, tokens_used: r1.tokens_used };
    if (r1.kind === "unsupported") {
      const r2 = await tryAnthropicCompatible(apiKey, prompt, base, mdl);
      if (r2.kind === "ok") return { ok: true, status: "success", output: r2.output, tokens_used: r2.tokens_used };
      return { ok: false, status: "api_error", error: `openai-style 404/405，anthropic-style HTTP ${r2.status}: ${r2.text}` };
    }
    return { ok: false, status: "api_error", error: `HTTP ${r1.status}: ${r1.text}` };
  } catch (e) {
    return { ok: false, status: "exception", error: String(e) };
  }
}
