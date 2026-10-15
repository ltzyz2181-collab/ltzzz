import {callAgent as deepseek} from '../call-deepseek.mjs';
import {callAgent as doubao} from '../call-doubao.mjs';
import {callAgent as grok} from '../call-grok.mjs';
import {kimiCN} from '../agi-econ/kimi-cn.mjs';
export const MODEL_AGENTS=['DeepSeek','Doubao','Kimi','Grok'];
export const complete=r=>r?.ok===true&&typeof r.output==='string'&&r.output.trim().length>0&&['stop','end_turn'].includes(r.finish_reason);
export function createModelRouter({env=process.env,record=()=>{},callers={DeepSeek:deepseek,Doubao:doubao,Kimi:kimiCN,Grok:grok}}={}){
 const keys={DeepSeek:env.DEEPSEEK_API_KEY,Doubao:env.DOUBAO_API_KEY||env.ARK_API_KEY,Kimi:env.MOONSHOT_API_KEY_CN,Grok:env.XAI_API_KEY};
 return async function call(requested,prompt,{exclude=[],maxTokens,onProgress,thinking}={}){
  const routes={DeepSeek:['DeepSeek','Doubao','Grok'],Doubao:['Doubao','DeepSeek','Grok'],GPT:['DeepSeek','Doubao','Grok'],Claude:['Doubao','DeepSeek'],Kimi:['Kimi','Grok'],Grok:['Grok','DeepSeek','Doubao']};
  if(!routes[requested])return {ok:false,status:'unsupported_agent',error:'unsupported_agent'};
  let last={ok:false,status:'not_configured',error:'no_independent_provider_key'};
  for(const provider of routes[requested].filter(p=>!exclude.includes(p))){
   if(!keys[provider])continue;
   const redact=value=>{
    if(typeof value==='string'){for(const key of Object.values(keys).filter(Boolean))value=value.replaceAll(key,'[REDACTED]');return value;}
    if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
    return value;
   };
   const out=await callers[provider]({apiKey:keys[provider],prompt,maxTokens:maxTokens||(provider==='Grok'?3000:provider==='Kimi'?6000:8192),...(provider==='Doubao'?{thinking:'disabled'}:provider==='DeepSeek'&&thinking?{thinking}:{}),...(onProgress?{onProgress:state=>onProgress({...redact(state),requested_agent:requested,executed_by:provider})}:{})});
   let error=String(out.error||'');for(const key of Object.values(keys).filter(Boolean))error=error.replaceAll(key,'[REDACTED]');
   record({requested_agent:requested,executed_by:provider,model:out.model||null,model_source:out.model_source||null,status:out.status,finish_reason:out.finish_reason||null,tokens_used:out.tokens_used??null,request_id:out.request_id||null,completion_id:out.completion_id||null,stream_complete:out.stream_complete??null,error:error.slice(0,180)||null});
   last={...out,error,requested_agent:requested,executed_by:provider,delegated:provider!==requested};
   if(complete(last))return last;
   // Known rejected requests may switch provider; timeout/partial output may already be billed.
   if(out.status!=='not_configured'&&!(out.status==='api_error'&&/HTTP (401|402|403|404|429)|insufficient|credit|balance|quota/i.test(error)))return {...last,ok:false,status:'provider_incomplete_or_uncertain'};
  }
  return last;
 };
}

