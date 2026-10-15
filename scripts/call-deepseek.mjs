/** DeepSeek streaming adapter. Credentials are supplied only by its executor. */
import {routedModel} from './model-routing.mjs';
import {readDeepSeekResponse} from './lib/deepseek-stream.mjs';
export async function callAgent({apiKey,prompt,model,maxTokens=8192,onProgress}){
 if(!apiKey)return {ok:false,status:'not_configured',error:'DEEPSEEK_API_KEY 未配置'};
 const requestedModel=model||process.env.DEEPSEEK_MODEL||routedModel('deepseek','deepseek-reasoner');
 // Redact before returning or checkpointing; do not retain reasoning_content.
 const redact=value=>{
  if(typeof value==='string')return value.replaceAll(apiKey,'[REDACTED]');
  if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,redact(v)]));
  return value;
 };
 try{
  const response=await fetch('https://api.deepseek.com/v1/chat/completions',{
   method:'POST',signal:AbortSignal.timeout(240000),
   headers:{'Content-Type':'application/json',Authorization:`Bearer ${apiKey}`},
   body:JSON.stringify({model:requestedModel,
    ...(/deepseek-(?:v\d+(?:-\d+)?-)?(pro|flash)/.test(requestedModel)?{thinking:{type:'enabled'}}:{}),
    messages:[{role:'system',content:'你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。'},{role:'user',content:prompt}],
    max_tokens:maxTokens,stream:true,stream_options:{include_usage:true}})
  });
  if(!response.ok){
   // HTTP rejection is known, but do not echo arbitrary upstream response bodies.
   return {ok:false,status:'api_error',error:`HTTP ${response.status}`,request_id:redact(response.headers.get('x-request-id')||response.headers.get('x-ds-request-id')||null),tokens_used:null};
  }
  const result=await readDeepSeekResponse(response,{requestedModel,onProgress:onProgress?state=>onProgress(redact(state)):undefined});
  return redact(result);
 }catch{
  return {ok:false,status:'exception',error:'deepseek_transport_failed',tokens_used:null,automatic_retry_allowed:false};
 }
}
