const endpoint='https://ltzzz-doubao-proxy.ltzyz2181.workers.dev/';
export async function callDoubaoProxy({prompt,model,maxTokens=8192,thinking,token=process.env.LTZZZ_AGENT_TOKEN,fetcher=fetch}){
 if(!token)return {ok:false,status:'service_auth_not_configured'};
 try{
  const r=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},body:JSON.stringify({messages:[{role:'user',content:prompt}],...(model?{model}:{}),...(thinking?{thinking:{type:thinking}}:{}),max_tokens:maxTokens}),signal:AbortSignal.timeout(240000)});
  const d=await r.json();if(!r.ok)return {ok:false,status:'proxy_api_error',http:r.status};
  const x=d.ltzzz_receipt,output=String(d.choices?.[0]?.message?.content||'').trim();
  const verified=x?.receipt_source==='worker_code'&&x.executed_by==='doubao'&&x.model_source==='provider_response'&&x.actual_model===d.model&&x.generation_verified===true;
  return {ok:verified&&!!output,status:verified&&output?'success':'incomplete_or_unverified_proxy_output',output,finish_reason:d.choices?.[0]?.finish_reason,tokens_used:d.usage?.total_tokens||0,model:x?.actual_model||null,model_source:x?.model_source||null,http:r.status,execution:x||null,route:'authenticated_doubao_worker'};
 }catch{return {ok:false,status:'proxy_transport_unknown_no_repurchase'};}
}
