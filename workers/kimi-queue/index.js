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
  if(request.method==='GET'&&url.pathname==='/health')return Response.json({ok:true,service:'ltzzz-kimi-queue',region:'cn',version:'shared-lease-native-executor',concurrency:1,min_interval_ms:21000,has_key:!!env.MOONSHOT_API_KEY_CN,auth_configured:!!env.LTZZZ_AGENT_TOKEN,limiter_configured:!!env.KIMI_GATE,global_scope:'requests routed through this gateway only'});
  if(!env.LTZZZ_AGENT_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.LTZZZ_AGENT_TOKEN}`)return Response.json({error:'unauthorized'},{status:401});
  if(request.method!=='POST'||!['/reserve','/release'].includes(url.pathname))return Response.json({error:'not_found'},{status:404});
  if(!env.MOONSHOT_API_KEY_CN||!env.KIMI_GATE)return Response.json({error:'gateway_not_configured'},{status:503});
  return env.KIMI_GATE.get(env.KIMI_GATE.idFromName('domestic-shared-key')).fetch(request);
 }
};
export class KimiGate {
 constructor(state,env){this.state=state;this.env=env;}
 async fetch(request){
  const body=await request.json().catch(()=>null);
  if(new URL(request.url).pathname==='/release'){
   const result=await this.state.storage.transaction(async tx=>{const s=await tx.get('gate')||{};if(!body?.lease||s.owner!==body.lease)return false;await tx.put('gate',{...s,busy_until:body.outcome==='unknown'?s.busy_until:0,quota_until:body.outcome==='quota_exhausted'?Date.now()+3600000:0});return true;});
   return Response.json({released:result},{status:result?200:409});
  }
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
  if(new URL(request.url).pathname==='/reserve')return Response.json({lease:owner,lease_seconds:330,upstream_attempts:0});
  return Response.json({error:'not_found'},{status:404});
 }
}
