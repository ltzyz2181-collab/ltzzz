const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
export default {
 async fetch(request,env){
  const route=new URL(request.url).pathname;
  if(request.method==='GET'&&route==='/health')return json({service:'ltzzz-meta-hosted',provider:'cloudflare-workers-ai',model:env.META_MODEL,did:'did:ltzzz:meta',auth_configured:Boolean(env.META_WORKER_TOKEN),ai_binding:Boolean(env.AI),onchain_registered:false});
  if(request.method!=='POST'||!['/','/task'].includes(route))return json({error:'not_found'},404);
  if(!env.META_WORKER_TOKEN)return json({error:'auth_not_configured'},503);
  if(request.headers.get('Authorization')!==`Bearer ${env.META_WORKER_TOKEN}`)return json({error:'unauthorized'},401);
  if(!env.AI)return json({error:'ai_binding_missing'},503);
  const raw=await request.text();if(raw.length>12000)return json({error:'body_too_large'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
  if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>6000)return json({error:'prompt_invalid'},400);
  const task=String(body.task_id||'').slice(0,100);if(!task)return json({error:'task_id_required'},400);
  const kind=body.kind||'analysis';if(!['analysis','hire','invest'].includes(kind))return json({error:'kind_invalid'},400);
  try{
   const result=await env.AI.run(env.META_MODEL,{messages:[{role:'system',content:'You are the LTZZZ hosted Llama execution seat. Return concise proposals only. Never claim a payment, trade, deployment, DID registration or social publication occurred. No private keys.'},{role:'user',content:body.prompt}],max_tokens:512});
   const output=String(result.response||'').trim();if(!output)return json({error:'empty_model_output'},502);
   return json({task_id:task,executor:'did:ltzzz:meta',provider:'cloudflare-workers-ai',model:env.META_MODEL,at:new Date().toISOString(),kind,status:'proposal_completed',output,evidence:{type:'real_model_inference',financial_execution:false,tx_hash:null,published_id:null}});
  }catch{return json({error:'upstream_inference_failed'},502);}
 }
};
