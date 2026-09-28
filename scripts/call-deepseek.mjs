/**
 * call-deepseek.mjs — DeepSeek 通道真实调用（密钥只从环境变量读取）
 */
export async function callAgent({ apiKey, prompt, model }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "DEEPSEEK_API_KEY 未配置（请在 GitHub Secrets 添加）" };
  try {
    const resp = await fetch("https://api.deepseek.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model || process.env.DEEPSEEK_MODEL || "deepseek-chat",
        messages: [
          { role: "system", content: "你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。" },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, status: "api_error", error: `HTTP ${resp.status}: ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    const output = (data.choices?.[0]?.message?.content || "").trim();
    return { ok: true, status: "success", output, tokens_used: data.usage?.total_tokens || 0 };
  } catch (e) {
    return { ok: false, status: "exception", error: String(e) };
  }
}
