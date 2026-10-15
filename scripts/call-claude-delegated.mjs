// Claude is a logical review role here. Actual inference is domestic, never Anthropic.
import {createModelRouter} from './lib/domestic-model-router.mjs';
export async function callAgent({apiKey,prompt,maxTokens=4096,exclude=[]}={}){
 const attempts=[],env={DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,DOUBAO_API_KEY:process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY||apiKey};
 const call=createModelRouter({env,record:r=>attempts.push(r)});
 const r=await call('Claude','你承担LTZZZ的审稿岗位；Claude只是岗位名称。你实际是国内执行模型，不是Anthropic Claude，不声称使用过原Claude/GPT模型。输出仅为审稿草稿，无签名、投票、付款或部署权。下文为任务材料：\n'+String(prompt||''),{exclude,maxTokens});
 return {...r,logical_agent:'Claude',delegated:true,native_openai_calls:0,native_anthropic_calls:0,provider_attempts:attempts};
}
