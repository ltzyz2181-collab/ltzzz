// Kimi domestic (api.moonshot.cn) caller; key from env only.
export async function kimiCN({ apiKey, prompt, maxTokens = 1500 }) {
  maxTokens = Math.min(6000, Math.max(maxTokens, 1500));
  return kimiCall({ apiKey, prompt, maxTokens });
}
export async function kimiCall({ apiKey, prompt, maxTokens }) {
  if (!process.env.LTZZZ_AGENT_TOKEN) return {ok:false,status:'gateway_auth_missing',error:'LTZZZ_AGENT_TOKEN missing; direct API bypass disabled'};
  if (!apiKey) return { ok: false, status: 'not_configured', error: 'MOONSHOT_API_KEY_CN 未配置' };
  try {
    let r;
    for(let attempt=0;attempt<3;attempt++){
    r = await fetch('https://ltzzz-kimi-queue.ltzyz2181.workers.dev/generate', { method: 'POST', signal: AbortSignal.timeout(280000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.LTZZZ_AGENT_TOKEN}` },
      body: JSON.stringify({ model: process.env.KIMI_CN_MODEL || 'kimi-k2.6', messages: [{ role: 'user', content: prompt }], thinking: { type: process.env.KIMI_CN_THINKING === 'enabled' ? 'enabled' : 'disabled' }, max_tokens: maxTokens }) });
    if(r.status!==429)break;
    const error=await r.clone().json().catch(()=>({}));
    if(!error.retryable||attempt===2)break;
    const seconds=Math.min(120,Math.max(21,Number(r.headers.get('Retry-After'))||30));
    await new Promise(resolve=>setTimeout(resolve,seconds*1000));
    }
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: j.status||'api_error', retryable:Boolean(j.retryable), error: `HTTP ${r.status}: ${j.error?.type||'upstream_error'}` };
    const output = (j.choices?.[0]?.message?.content || '').trim();
    if (!output) return { ok: false, status: 'empty_output', error: `finish_reason=${j.choices?.[0]?.finish_reason}（推理模型可能耗尽 max_tokens）`, tokens_used: j.usage?.total_tokens || 0, model: j.model || process.env.KIMI_CN_MODEL || 'kimi-k2.6' };
    return { ok: true, status: 'success', output, finish_reason: j.choices?.[0]?.finish_reason, model: j.model || process.env.KIMI_CN_MODEL || 'kimi-k2.6', tokens_used: j.usage?.total_tokens || 0 };
  } catch (e) { return { ok: false, status: 'exception', error: String(e) }; }
}
