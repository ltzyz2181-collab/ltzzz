// Claude is a logical review role here. Actual inference is domestic, never Anthropic.
import {createModelRouter} from './lib/domestic-model-router.mjs';
export async function callAgent({prompt,maxTokens=4096,exclude=[],onProgress}={}){
 // Generic caller credentials may belong to Anthropic/OpenAI. Never use them
 // as a domestic credential, regardless of their prefix or caller intent.
 const attempts=[],env={DEEPSEEK_API_KEY:process.env.DEEPSEEK_API_KEY,DOUBAO_API_KEY:process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY};
 const call=createModelRouter({env,record:r=>attempts.push(r)});
 const r=await call('Claude','你承担LTZZZ的国内模型复核岗位；Claude只是岗位名称。你实际是国内执行模型，不是Anthropic Claude，不声称使用过原Claude/GPT模型。可交付工程方案、代码与审查意见，由总控/千问按最新授权自动执行部署；实际工具动作和资金结果必须有回执，不因岗位名称虚构已操作。下文为任务材料：\n'+String(prompt||''),{exclude,maxTokens,onProgress});
 return {...r,logical_agent:'Claude',delegated:true,native_openai_calls:0,native_anthropic_calls:0,provider_attempts:attempts};
}
