// 日课调用的有界参数（GPT 2026-11-22 更正 #591）。
//
// 2026-11-22 run 44973737908：Doubao 同步非流式调用在约 90 秒超时并返回 HTTP 504，
// 工件 generation_verified=false。原因是日课路径没有显式上限，落到 provider 隐式
// 8192 输出 + 隐式 thinking。这里把日课 Doubao 的请求固定为有界输出并关闭 thinking；
// 其他席位保持原参数不变（它们的调用实现不接受这两个字段）。

export const DAILY_DOUBAO_MAX_TOKENS = 4096;
const MIN_TOKENS = 256;

export function dailyCallOptions({agent, apiKey, prompt, maxTokens = DAILY_DOUBAO_MAX_TOKENS} = {}) {
  const base = {apiKey: apiKey || '', prompt};
  if (agent !== 'doubao') return base;
  const requested = Number(maxTokens);
  const bounded = Number.isFinite(requested) && requested > 0
    ? Math.min(Math.max(Math.trunc(requested), MIN_TOKENS), DAILY_DOUBAO_MAX_TOKENS)
    : DAILY_DOUBAO_MAX_TOKENS;
  return {...base, maxTokens: bounded, thinking: 'disabled'};
}
