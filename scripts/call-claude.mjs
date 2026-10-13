/**
 * call-claude.mjs — Claude 通道真实调用（密钥只从环境变量读取）
 */
import {routedModel} from './model-routing.mjs';
export function classifyClaudeFailure(status,text){
 if(/credit balance is too low|insufficient.*credit/i.test(text))return 'insufficient_api_credits';
 if(status===429)return 'rate_limited';
 if(status===401||status===403)return 'authentication_failed';
 return 'api_error';
}
export async function callAgent({ apiKey, prompt, model, maxTokens = 3000 }) {
  if (!apiKey) return { ok: false, status: "not_configured", error: "ANTHROPIC_API_KEY 未配置（请在 GitHub Secrets 添加）" };
  try {
    const resp = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: AbortSignal.timeout(240000),
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || process.env.ANTHROPIC_MODEL || routedModel("claude","claude-sonnet-5-5"),
        max_tokens: maxTokens,
        messages: [{ role: "user", content: prompt }],
      }),
    });
    if (!resp.ok) {
      const t = await resp.text();
      const status=classifyClaudeFailure(resp.status,t);
      return {ok:false,status,http:resp.status,retryable:status==="rate_limited",error:`HTTP ${resp.status}: ${status}`,model:model||process.env.ANTHROPIC_MODEL||routedModel("claude","claude-sonnet-5-5")};
    }
    const data = await resp.json();
    const output = (data.content?.filter(x=>x.type==="text").map(x=>x.text).join("\n") || "").trim();
    return { ok: !!output, status: output ? "success" : "empty_output", output, tokens_used: (data.usage?.input_tokens || 0)+(data.usage?.output_tokens || 0), finish_reason:data.stop_reason, model:data.model };
  } catch (e) {
    return { ok: false, status: "exception", error: String(e) };
  }
}
