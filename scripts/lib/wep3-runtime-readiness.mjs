// Deployment propagation can return an HTML edge page. Preserve that observation
// and retry read-only readiness; never turn a parse failure into a missing receipt.
export async function waitMarketRuntime({base,token,revision,procurementRevision,fetchImpl=(...args)=>fetch(...args),pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts=12}={}){
  let state={ok:false,error:'not_observed'};const observations=[];
  for(let attempt=0;attempt<attempts;attempt++){
    let response;
    try{
      response=await fetchImpl(base+'/market/runtime-state',{headers:{'X-Lab-Pin':token},signal:AbortSignal.timeout(15000)});
      try{state=await response.json();}catch{state={ok:false,error:'non_json_response'};}
      observations.push({attempt:attempt+1,http:response.status,content_type:response.headers.get('content-type'),market_runtime_revision:state?.market_runtime_revision||null,aave_runtime_revision:state?.aave_runtime_revision||null,error:state?.error||null});
      if(response.ok&&state?.ok&&state.market_runtime_revision==='market-runtime-v2'&&state.aave_runtime_revision===revision&&(!procurementRevision||state.procurement_runtime_revision===procurementRevision))return {ready:true,state,observations};
    }catch{state={ok:false,error:'transport_or_body_timeout'};observations.push({attempt:attempt+1,http:response?.status||null,error:state.error});}
    if(attempt+1<attempts)await pause(3000);
  }
  return {ready:false,state,observations};
}
