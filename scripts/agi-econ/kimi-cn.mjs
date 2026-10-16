// Domestic Kimi: shared cloud lease, native executor request; no unreserved bypass.
const gateway='https://ltzzz-kimi-queue.ltzyz2181.workers.dev';
export async function kimiCN({apiKey,prompt,maxTokens=1500}){return kimiCall({apiKey,prompt,maxTokens:Math.min(6000,Math.max(maxTokens,1500))});}
export async function kimiCall({apiKey,prompt,maxTokens,model=process.env.KIMI_CN_MODEL||'kimi-k2.6',fetcher=fetch}){
 const token=process.env.LTZZZ_AGENT_TOKEN;
 if(!token||!apiKey)return {ok:false,status:'not_configured',error:'Domestic key or gateway token missing; direct bypass disabled'};
 let lease=null,outcome='unknown';
 const payload={model,messages:[{role:'user',content:prompt}],thinking:{type:'disabled'},temperature:0.6,max_tokens:maxTokens};
 const auth={Authorization:`Bearer ${token}`,'Content-Type':'application/json'};
 try{
  let reservation;
  for(let attempt=0;attempt<3;attempt++){
   const r=await fetcher(gateway+'/reserve',{method:'POST',headers:auth,body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
   reservation=await r.json().catch(()=>({}));
   if(r.ok){lease=reservation.lease;break;}
   if(r.status!==429||!reservation.retryable||attempt===2)return {ok:false,status:reservation.status||'gateway_error',retryable:!!reservation.retryable,error:'Shared Kimi reservation not granted',upstream_attempts:0};
   const seconds=Math.min(120,Math.max(21,Number(r.headers.get('Retry-After'))||30));await new Promise(resolve=>setTimeout(resolve,seconds*1000));
  }
  if(!lease)return {ok:false,status:'gateway_error',error:'Missing reservation lease',upstream_attempts:0};
  const r=await fetcher('https://api.moonshot.cn/v1/chat/completions',{method:'POST',headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json'},body:JSON.stringify(payload),signal:AbortSignal.timeout(280000)});
  const j=await r.json().catch(()=>({}));outcome='response_received';
  if(!r.ok){const type=j.error?.type||'';outcome=/exceeded_current_quota|insufficient_quota|insufficient_balance/i.test(type)?'quota_exhausted':r.status===429?'rate_limited':'api_error';return {ok:false,status:outcome,http:r.status,retryable:outcome==='rate_limited',upstream_attempts:1,error:`HTTP ${r.status}: ${type||'upstream_error'}`};}
  const output=String(j.choices?.[0]?.message?.content||'').trim();
  return {ok:!!output,status:output?'success':'empty_output',http:r.status,output,finish_reason:j.choices?.[0]?.finish_reason,model:j.model||payload.model,model_source:j.model?'provider_response':'requested_model',returned_model:j.model||null,request_id:r.headers.get('x-request-id')||r.headers.get('request-id')||null,completion_id:j.id||null,tokens_used:j.usage?.total_tokens||0,upstream_attempts:1};
 }catch{return {ok:false,status:'network_or_timeout',error:'No blind generation retry; unknown lease remains held until expiration'};}
 finally{if(lease)try{await fetcher(gateway+'/release',{method:'POST',headers:auth,body:JSON.stringify({lease,outcome}),signal:AbortSignal.timeout(10000)});}catch{/* lease expires; no unreserved retry */}}
}
