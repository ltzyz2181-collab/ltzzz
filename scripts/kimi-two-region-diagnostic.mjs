import fs from 'node:fs';
const results=[];
for(const [slot,key] of [['domestic',process.env.MOONSHOT_API_KEY],['existing_github_kimi',process.env.KIMI_API_KEY]]){
 if(!key){results.push({slot,status:'missing_github_secret'});continue;}
 for(const region of ['cn','ai']){
  const base=`https://api.moonshot.${region}/v1`;const record={slot,region,base};
  try{
   const headers={Authorization:`Bearer ${key}`};
   const b=await fetch(base+'/users/me/balance',{headers,signal:AbortSignal.timeout(20000)});const balance=await b.json().catch(()=>({}));record.balance_http=b.status;
   if(b.ok)record.balance={available_balance:balance.available_balance??balance.data?.available_balance,cash_balance:balance.cash_balance??balance.data?.cash_balance,voucher_balance:balance.voucher_balance??balance.data?.voucher_balance};
   const m=await fetch(base+'/models',{headers,signal:AbortSignal.timeout(20000)});const models=await m.json().catch(()=>({}));record.models_http=m.status;record.models=(models.data||[]).map(x=>x.id);
   const model=record.models.find(x=>x==='kimi-k2.6')||record.models.find(x=>x==='moonshot-v1-8k')||record.models[0];
   if(model){const r=await fetch(base+'/chat/completions',{method:'POST',headers:{...headers,'Content-Type':'application/json'},body:JSON.stringify({model,messages:[{role:'user',content:'Reply OK only'}],temperature:1,max_tokens:256}),signal:AbortSignal.timeout(45000)});const body=await r.json().catch(()=>({}));record.call_http=r.status;record.nonempty_output=Boolean(body.choices?.[0]?.message?.content?.trim());record.organization_hint=String(body.error?.message||'').match(/org-[A-Za-z0-9]+/)?.[0]||null;record.error_type=body.error?.type||null;}
  }catch{record.status='network_or_timeout';}results.push(record);
 }
}
fs.mkdirSync('knowledge/results/kimi',{recursive:true});fs.writeFileSync(`knowledge/results/kimi/${process.env.GITHUB_RUN_ID}.json`,JSON.stringify({at:new Date().toISOString(),results},null,2));console.log('Regional diagnostics recorded; no credentials printed');
