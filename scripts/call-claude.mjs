/**
 * call-claude.mjs — Claude 通道真实调用（密钥只从环境变量读取）
 */
export async function callAgent({ apiKey, prompt, model }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "ANTHROPIC_API_KEY 未配置（请在 GitHub Secrets 添加）" };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-20241022",
        max_tokens: 600,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      return { ok: false, status: "api_error", error: `HTTP ${resp.status}: ${t.slice(0, 200)}` };
    }
    const data = await resp.json();
    const output = (data.content?.[0]?.text || "").trim();
    return { ok: true, status: "success", output, tokens_used: data.usage?.input_tokens || 0 };
  } catch (e) {
    return { ok: false, status: "exception", error: String(e) };
  }
}
