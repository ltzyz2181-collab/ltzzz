// Seats and gateway names do not establish independent model providers.
export const canonicalProvider=value=>{
 const p=typeof value==='string'?value.trim().toLowerCase():'';
 return ({gpt:'openai',codex:'openai',claude:'anthropic',qianwen:'aliyun_dashscope',qwen:'aliyun_dashscope',kimi:'moonshot_cn',doubao:'bytedance',grok:'xai'})[p]||p||null;
};
