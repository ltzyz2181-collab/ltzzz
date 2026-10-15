import config from './pulse.json' with {type:'json'};
import {dashboardHTML,dashboardJS} from './dashboard.js';
import {validateConfig,heartbeat,walletBalance,evolve,control,names} from './engine.js';
const json=(value,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'no-store'}});
async function same(a,b){if(!a||!b)return false;const enc=new TextEncoder(),hash=async s=>new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s)));const [x,y]=await Promise.all([hash(a),hash(b)]);let difference=0;for(let i=0;i<x.length;i++)difference|=x[i]^y[i];return difference===0;}
async function actorFor(request,env){const token=request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];if(await same(token,env.PULSE_TOKEN))return 'gpt';if(await same(token,env.PULSE_QIANWEN_TOKEN))return 'qianwen';return null;}
export default {
 async fetch(request,env){
  const path=new URL(request.url).pathname;
  if(request.method==='GET'&&(path==='/'||path==='/dashboard.js'))return new Response(path==='/'?dashboardHTML:dashboardJS,{headers:{'Content-Type':path==='/'?'text/html; charset=utf-8':'text/javascript; charset=utf-8','Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self'; base-uri 'none'; frame-ancestors 'none'"}});
  if(path==='/health'&&request.method==='GET')return json({ok:!!env.PULSE,service:'ltzzz-pulse',version:config.version,storage:!!env.PULSE,auth_configured:!!env.PULSE_TOKEN,qianwen_control_configured:!!env.PULSE_QIANWEN_TOKEN,model_calls:0});
  if(path==='/schema'&&request.method==='GET')return json({controllers:config.controller_roles,equivalent_operational_authority:true,automatic_recovery:true,authentication:'role-specific Bearer or owner GitHub workflow',actions:['pause','resume','set_concurrency','dispatch','ack_dispatch','probe'],policy_source:'bundled_git_config',private_keys_in_monitor:false,money_execution:'existing signing executors; no payment is performed by a health check'});
  if(!env.PULSE)return json({error:'storage_not_configured'},503);
  const publicRead=path==='/status'&&request.method==='GET';
  if(!publicRead){
   if(!['/run','/control','/incentives'].includes(path))return json({error:'not_found'},404);
   if(request.method!=='POST')return json({error:'POST_required'},405);
   if(!env.PULSE_TOKEN&&!env.PULSE_QIANWEN_TOKEN)return json({error:'auth_not_configured'},503);
   const actor=await actorFor(request,env);if(!actor)return json({error:'unauthorized'},401);
   if(Number(request.headers.get('content-length')||0)>32768)return json({error:'body_too_large'},413);
   const text=await request.text();if(text.length>32768)return json({error:'body_too_large'},413);
   request=new Request(request.url,{method:'POST',headers:{'Content-Type':'application/json','X-Pulse-Actor':actor},body:text||'{}'});
  }
  return env.PULSE.get(env.PULSE.idFromName('ltzzz-global')).fetch(request);
 }
};
export class PulseState{
 constructor(state,env){this.storage=state.storage;this.env=env;this.tail=Promise.resolve();}
 serial(fn){const result=this.tail.then(fn);this.tail=result.catch(()=>{});return result;}
 async run(){
  validateConfig(config);const prior=await this.storage.get('state')||{};
  const [heartbeats,wallet]=await Promise.all([Promise.all(config.targets.map(t=>heartbeat(t))),walletBalance(config.wallet)]);
  const {state,events}=evolve(prior,{heartbeats,wallet},config);state.notification={active_channel:'status_and_github_actions',telegram:false,note:'未配置主动消息渠道；告警保存在/status，由外部工作流检查。'};
  state.history=[...(prior.history||[]),{at:state.ran_at,mode:state.mode,unhealthy:heartbeats.filter(h=>!h.ok).map(h=>h.name),alerts:events.length}].slice(-288);
  await this.storage.put('state',state);return state;
 }
 alarm(){return this.serial(async()=>{try{await this.run();}finally{await this.storage.setAlarm(Date.now()+config.interval_seconds*1000);}});}
 fetch(request){return this.serial(async()=>{
  const path=new URL(request.url).pathname;
  try{
   if(path==='/status'){const state=await this.storage.get('state')||{};return json({...state,version:config.version,ran_at:state.ran_at||null,stale:!state.ran_at||Date.now()-Date.parse(state.ran_at)>config.stale_seconds*1000,alarm_at:await this.storage.getAlarm(),controllers:config.controller_roles,model_calls:0,financial_execution:false});}
   // Keep the autonomous loop armed even if an individual observation fails.
   if(path==='/run'){await this.storage.setAlarm(Date.now()+config.interval_seconds*1000);return json(await this.run());}
   const actor=request.headers.get('X-Pulse-Actor');if(!config.controller_roles.includes(actor))return json({error:'controller_required'},403);
   const body=await request.json();const prior=await this.storage.get('state')||{};
   if(path==='/control'){
    const result=control(prior,body,actor,config);await this.storage.put('state',result.state);return json({ok:true,actor,duplicate:result.duplicate,controls:result.state.controls});
   }
   if(path==='/incentives'){
    if(!/^[0-9a-f]{40}$/i.test(body.source_commit||'')||!Number.isFinite(Date.parse(body.at))||Math.abs(Date.now()-Date.parse(body.at))>900000||body.verification!=='recomputed_from_hashed_independent_receipts'||!body.profiles||typeof body.profiles!=='object'||Array.isArray(body.profiles))return json({error:'verified_snapshot_required'},400);
    for(const [name,p]of Object.entries(body.profiles))if(!names(config).includes(name)||!Number.isFinite(p.score)||p.score< -20||p.score>20||!Number.isFinite(p.priority_multiplier)||p.priority_multiplier<.8||p.priority_multiplier>1.2||p.real_money_penalty!==false)return json({error:'profile_invalid'},400);
    prior.incentives={...body,accepted_by:actor};prior.reference_task_failures=body.task_failures||null;await this.storage.put('state',prior);return json({ok:true,profiles:Object.keys(body.profiles),source_commit:body.source_commit});
   }
   return json({error:'not_found'},404);
  }catch{return json({error:'pulse_operation_failed'},500);}
 });}
}
