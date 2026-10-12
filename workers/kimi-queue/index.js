export function failureKind(status,body){
 const type=body?.error?.type||body?.error?.code||'';
 if(/exceeded_current_quota|insufficient_quota|insufficient_balance/i.test(type))return 'quota_exhausted';
 if(status===401||status===403)return 'authentication_failed';
 if(status===429)return 'rate_limited';
 return 'upstream_error';
}
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  if(request.method==='GET'&&url.pathname==='/health')return Response.json({ok:true,service:'ltzzz-kimi-queue',region:'cn',version:'thinking-disabled-temp-0.6',concurrency:1,min_interval_ms:21000,has_key:!!env.MOONSHOT_API_KEY_CN,auth_configured:!!env.LTZZZ_AGENT_TOKEN,limiter_configured:!!env.KIMI_GATE,global_scope:'requests routed through this gateway only'});
  if(!env.LTZZZ_AGENT_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.LTZZZ_AGENT_TOKEN}`)return Response.json({error:'unauthorized'},{status:401});
  if(request.method!=='POST'||url.pathname!=='/generate')return Response.json({error:'not_found'},{status:404});
  if(!env.MOONSHOT_API_KEY_CN||!env.KIMI_GATE)return Response.json({error:'gateway_not_configured'},{status:503});
  return env.KIMI_GATE.get(env.KIMI_GATE.idFromName('domestic-shared-key')).fetch(request);
 }
};
export class KimiGate {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(request){
  const body=await request.json().catch(()=>null);
  if(!body||!Array.isArray(body.messages)||!body.messages.length)return Response.json({error:'invalid_messages'},{status:400});
  const now=Date.now(),owner=crypto.randomUUID();
  const reservation=await this.state.storage.transaction(async tx=>{
   const s=await tx.get('gate')||{};
   if(s.quota_until>now)return {blocked:'quota_exhausted',retry:Math.ceil((s.quota_until-now)/1000)};
   if(s.busy_until>now)return {blocked:'local_concurrency_limit',retry:30};
   if(s.next_at>now)return {blocked:'local_rpm_limit',retry:Math.ceil((s.next_at-now)/1000)};
   await tx.put('gate',{owner,busy_until:now+330000,next_at:now+21000});return {};
  });
  if(reservation.blocked)return Response.json({error:{type:reservation.blocked},status:reservation.blocked,retryable:reservation.blocked!=='quota_exhausted',upstream_attempts:0},{status:429,headers:{'Retry-After':String(reservation.retry)}});
  let cooldown=0;
  try{
   const model=body.model||'kimi-k2.6';
   const r=await fetch('https://api.moonshot.cn/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(280000),headers:{Authorization:`Bearer ${this.env.MOONSHOT_API_KEY_CN}`,'Content-Type':'application/json'},body:JSON.stringify({model,messages:body.messages,temperature:0.6,thinking:{type:'disabled'},max_tokens:Math.min(6000,Math.max(1,Number(body.max_tokens)||1500)),stream:false})});
   const raw=await r.text();const j=(()=>{try{return JSON.parse(raw);}catch{return {};}})();
   const errorDetail=(typeof j.error==='string'?j.error:j.error?.message||j.message||raw).replaceAll(this.env.MOONSHOT_API_KEY_CN||'__no_key__','[redacted]').replace(/sk-[A-Za-z0-9_-]+/g,'[redacted]').slice(0,300);
   if(!r.ok){const kind=failureKind(r.status,j);if(kind==='quota_exhausted')cooldown=3600000;const message=String(j.error?.message||'');const hint=/max_tokens/i.test(message)?'token_budget_rejected':/thinking/i.test(message)?'thinking_parameter_rejected':/temperature/i.test(message)?'temperature_rejected':/model/i.test(message)?'model_parameter_rejected':null;return Response.json({error:{type:kind},status:kind,validation_hint:hint,upstream_content_type:r.headers.get('Content-Type'),provider_detail:r.status===400?errorDetail:null,provider_error_type:typeof j.error?.type==='string'&&/^[a-z_]{1,80}$/i.test(j.error.type)?j.error.type:null,retryable:kind==='rate_limited',upstream_attempts:1},{status:r.status,headers:{'Retry-After':kind==='rate_limited'?String(Math.max(21,Number(r.headers.get('Retry-After'))||30)):'3600'}});}
   return Response.json(j,{headers:{'X-LTZZZ-Upstream-Attempts':'1'}});
  }catch{return Response.json({error:{type:'upstream_timeout_or_network'},retryable:false,upstream_attempts:1},{status:502});}
  finally{await this.state.storage.transaction(async tx=>{const s=await tx.get('gate')||{};if(s.owner===owner)await tx.put('gate',{...s,busy_until:0,quota_until:cooldown?Date.now()+cooldown:0});});}
 }
}
