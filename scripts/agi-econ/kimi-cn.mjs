// Kimi domestic (api.moonshot.cn) caller; key from env only.
export async function kimiCN({ apiKey, prompt, maxTokens = 1500 }) {
  maxTokens = Math.min(6000, Math.max(maxTokens, 1500));
  return kimiCall({ apiKey, prompt, maxTokens });
}
export async function kimiCall({ apiKey, prompt, maxTokens }) {
  if (!apiKey) return { ok: false, status: 'not_configured', error: 'MOONSHOT_API_KEY_CN 未配置' };
  try {
    const r = await fetch('https://api.moonshot.cn/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(280000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.KIMI_CN_MODEL || 'kimi-k2.6', messages: [{ role: 'user', content: prompt }], thinking: { type: process.env.KIMI_CN_THINKING === 'enabled' ? 'enabled' : 'disabled' }, max_tokens: maxTokens }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: 'api_error', error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}` };
    const output = (j.choices?.[0]?.message?.content || '').trim();
    if (!output) return { ok: false, status: 'empty_output', error: `finish_reason=${j.choices?.[0]?.finish_reason}（推理模型可能耗尽 max_tokens）`, tokens_used: j.usage?.total_tokens || 0, model: j.model || process.env.KIMI_CN_MODEL || 'kimi-k2.6' };
    return { ok: true, status: 'success', output, finish_reason: j.choices?.[0]?.finish_reason, model: j.model || process.env.KIMI_CN_MODEL || 'kimi-k2.6', tokens_used: j.usage?.total_tokens || 0 };
  } catch (e) { return { ok: false, status: 'exception', error: String(e) }; }
}
