export const PULSE_URL='https://ltzzz-pulse.ltzyz2181.workers.dev';
const aliases={GPT:'gpt',DeepSeek:'deepseek',Doubao:'doubao',Grok:'grok',Kimi:'kimi',Qianwen:'qianwen',kimi_domestic:'kimi'};
export function pulseGate(snapshot,agent,now=Date.now()){
 const name=aliases[agent]||String(agent).replace(/^did:ltzzz:/,'').toLowerCase(),age=now-Date.parse(snapshot?.ran_at);
 if(snapshot?.manual?.global===true||snapshot?.manual?.[name]===true)return {allowed:false,state:'paused',reason:'persistent_controller_pause'};
 if(!Number.isFinite(age)||age< -60000||age>900000)return {allowed:true,state:'unknown',reason:'pulse_missing_or_stale_use_existing_policy'};
 if(snapshot.controls?.dispatch_paused)return {allowed:false,state:'paused',reason:'controller_global_pause'};
 const a=snapshot.agents?.[name];if(a?.paused||a?.dispatch_allowed===false)return {allowed:false,state:'paused',reason:'agent_health_or_controller_pause'};
 return {allowed:true,state:'fresh',reason:'existing_policy_and_independent_audit_still_apply'};
}
export async function pulseSnapshot({fetcher=fetch}={}){
 try{const r=await fetcher(PULSE_URL+'/status',{signal:AbortSignal.timeout(8000)});if(!r.ok)return {available:false,http:r.status};return {available:true,...await r.json()};}catch{return {available:false,error:'pulse_unreachable'};}
}
export function coordinatorSeat(snapshot,now=Date.now()){
 const age=now-Date.parse(snapshot?.ran_at);return Number.isFinite(age)&&age>=-60000&&age<=900000&&snapshot.active_controller==='qianwen'?'qianwen_proxy':'gpt';
}
