import {KIMI_PROFILE} from '../../lib/kimi-profile.js';
import {authCheck} from '../../lib/proxy-auth.js';
export const OBSERVER_REVISION='kimi-readonly-observer-v1';
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
  if(request.method==='GET'&&url.pathname==='/health')return Response.json({ok:true,service:'ltzzz-kimi-queue',region:'cn',version:'shared-lease-native-executor',observer_revision:OBSERVER_REVISION,source_commit:env.KIMI_QUEUE_SOURCE_COMMIT||null,model_calls:0,concurrency:null,min_interval_ms:0,output_profile:KIMI_PROFILE,limiter_mode:'provider_limits_only_no_application_throttle',has_key:!!env.MOONSHOT_API_KEY_CN,auth_configured:!!env.LTZZZ_AGENT_TOKEN,limiter_configured:!!env.KIMI_GATE,global_scope:'requests routed through this gateway only'});
  if(request.method==='GET'&&['/auth/check','/leases/count'].includes(url.pathname)){
   const check=await authCheck(request,env);if(check.status!==200)return check;
   if(url.pathname==='/auth/check')return Response.json({ok:true,authenticated:true,observer_revision:OBSERVER_REVISION,source_commit:env.KIMI_QUEUE_SOURCE_COMMIT||null,read_only:true,model_calls:0});
   if(!env.KIMI_GATE)return Response.json({error:'limiter_not_configured',model_calls:0},{status:503});
   return env.KIMI_GATE.get(env.KIMI_GATE.idFromName('domestic-shared-key')).fetch(request);
  }
  if(!env.LTZZZ_AGENT_TOKEN||request.headers.get('Authorization')!==`Bearer ${env.LTZZZ_AGENT_TOKEN}`)return Response.json({error:'unauthorized'},{status:401});
  if(request.method!=='POST'||!['/reserve','/release'].includes(url.pathname))return Response.json({error:'not_found'},{status:404});
  if(!env.MOONSHOT_API_KEY_CN||!env.KIMI_GATE)return Response.json({error:'gateway_not_configured'},{status:503});
  return env.KIMI_GATE.get(env.KIMI_GATE.idFromName('domestic-shared-key')).fetch(request);
 }
};
export class KimiGate {
 constructor(state,env){this.state=state;this.env=env;}
 async alarm(){
  const leases=await this.state.storage.list({prefix:'lease:'});let next=null;
  for(const [key,row] of leases){if(row.expires_at<=Date.now())await this.state.storage.delete(key);else next=Math.min(next??Infinity,row.expires_at);}
  if(next!==null)await this.state.storage.setAlarm(next);
 }
 async fetch(request){
  if(request.method==='GET'&&new URL(request.url).pathname==='/leases/count'){
   const check=await authCheck(request,this.env);if(check.status!==200)return check;
   const rows=await this.state.storage.list({prefix:'lease:'}),at=Date.now();let active=0,expired=0,invalid=0;
   for(const row of rows.values()){if(!Number.isFinite(row?.expires_at))invalid++;else if(row.expires_at<=at)expired++;else active++;}
   return Response.json({ok:true,observer_revision:OBSERVER_REVISION,source_commit:this.env.KIMI_QUEUE_SOURCE_COMMIT||null,read_only:true,at_utc:new Date(at).toISOString(),active,expired,invalid,records_observed:rows.size,reserved_total:null,released_total:null,historical_totals_available:false,model_calls:0});
  }
  const body=await request.json().catch(()=>null);
  const pathname=new URL(request.url).pathname;
  if(pathname==='/release'){
   if(typeof body?.lease!=='string'||!/^[a-f0-9-]{36}$/.test(body.lease))return Response.json({released:false},{status:409});
   const result=await this.state.storage.transaction(async tx=>{const key='lease:'+body.lease,s=await tx.get(key);if(!s||s.expires_at<Date.now())return false;await tx.delete(key);return true;});
   return Response.json({released:result},{status:result?200:409});
  }
  if(pathname!=='/reserve')return Response.json({error:'not_found'},{status:404});
  if(!body||!Array.isArray(body.messages)||!body.messages.length)return Response.json({error:'invalid_messages'},{status:400});
  // No artificial per-minute or single-concurrency gate. Each call still has a
  // distinct authenticated lease; durable task claims prevent duplicate billing.
  const owner=crypto.randomUUID(),expires_at=Date.now()+330000;
  await this.state.storage.transaction(async tx=>{await tx.put('lease:'+owner,{expires_at});});
  if(this.state.storage.getAlarm&&this.state.storage.setAlarm){const alarm=await this.state.storage.getAlarm();if(!alarm||alarm>expires_at)await this.state.storage.setAlarm(expires_at);}
  return Response.json({lease:owner,lease_seconds:330,upstream_attempts:0,application_throttle:false});
 }
}
