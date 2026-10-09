/**
 * call-grok.mjs — XAI/Grok 通道真实调用（密钥只从环境变量读取）
 * 默认模型 grok-4.6（该账号 Key.doc 标注可访问）；404 模型无权限时自动回退候选模型列表
 */
const MODEL_CANDIDATES = [
  process.env.XAI_MODEL, "grok-4.6", "grok-4-1", "grok-4", "grok-4-fast", "grok-2-latest",
].filter(Boolean);

export async function callAgent({ apiKey, prompt, model, maxTokens = 600 }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "XAI_API_KEY 未配置（请在 GitHub Secrets 添加）" };
  const candidates = model ? [model, ...MODEL_CANDIDATES] : MODEL_CANDIDATES;
  for (const mdl of [...new Set(candidates)]) {
    try {
      const resp = await fetch("https://api.x.ai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
        body: JSON.stringify({
          model: mdl,
          messages: [
            { role: "system", content: "你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。" },
            { role: "user", content: prompt },
          ],
          max_tokens: maxTokens,
        }),
      });
      if (!resp.ok) {
        const t = await resp.text();
        if (resp.status === 404 && t.includes("does not exist or your team")) {
          continue; // 模型无权限，试下一个候选
        }
        return { ok: false, status: "api_error", error: `HTTP ${resp.status}: ${t.slice(0, 200)}` };
      }
      const data = await resp.json();
      const output = (data.choices?.[0]?.message?.content || "").trim();
      return { ok: true, status: "success", output, finish_reason: data.choices?.[0]?.finish_reason, tokens_used: data.usage?.total_tokens || 0, model: mdl };
    } catch (e) {
      return { ok: false, status: "exception", error: String(e) };
    }
  }
  return { ok: false, status: "api_error", error: "全部候选模型均无访问权限（模型不存在或团队未授权）" };
}
