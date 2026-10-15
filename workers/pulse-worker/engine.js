import {seedTasks,taskCommand} from './tasks.js';
export const names=config=>config.targets.map(t=>t.name);
export function validateConfig(config){
 if(!Array.isArray(config.targets)||!config.targets.length||new Set(names(config)).size!==config.targets.length)throw Error('targets_invalid');
 for(const t of config.targets){const u=new URL(t.url);if(u.protocol!=='https:'||u.username||u.password||u.port||!(/^[a-z0-9-]+\.ltzyz2181\.workers\.dev$/.test(u.hostname)||u.hostname.endsWith('.ltzzz.com')))throw Error('target_not_allowed');}
 if(!/^0x[a-fA-F0-9]{40}$/.test(config.wallet.address)||!/^0x[a-fA-F0-9]{40}$/.test(config.wallet.token)||config.wallet.chain_id!==8453)throw Error('wallet_config_invalid');
 if(config.failure_threshold<1||config.recovery_threshold<1||config.interval_seconds<60)throw Error('threshold_invalid');
}
export async function heartbeat(target,{fetcher=(...args)=>globalThis.fetch(...args)}={}){
 const start=Date.now();try{const r=await fetcher(target.url,{redirect:'manual',signal:AbortSignal.timeout(7000)});let j;try{j=await r.json();}catch{return {name:target.name,ok:false,http:r.status,latency_ms:Date.now()-start,error:'non_json_health_response'};}return {name:target.name,ok:r.ok&&j.ok!==false&&j.has_key!==false&&j.key_configured!==false,http:r.status,latency_ms:Date.now()-start,evidence:'http_health_only_not_generation'};}catch(error){return {name:target.name,ok:false,http:null,latency_ms:Date.now()-start,error:'health_unreachable_or_non_json',error_kind:error?.name||'Error',error_detail:String(error?.message||'').slice(0,140),transport_code:/illegal invocation/i.test(String(error))?'illegal_invocation':/different request|I\/O context/i.test(String(error))?'request_context':/timeout|abort/i.test(String(error))?'timeout':'transport_or_non_json'};}
}
export async function walletBalance(config,{fetcher=(...args)=>globalThis.fetch(...args)}={}){
 for(const rpc of config.rpc_urls){try{
  const r=await fetcher(rpc,{method:'POST',redirect:'manual',signal:AbortSignal.timeout(7000),headers:{'Content-Type':'application/json'},body:JSON.stringify([{jsonrpc:'2.0',id:1,method:'eth_chainId',params:[]},{jsonrpc:'2.0',id:2,method:'eth_call',params:[{to:config.token,data:'0x70a08231'+config.address.slice(2).toLowerCase().padStart(64,'0')},'latest']}])});
  const j=await r.json();if(!r.ok||!Array.isArray(j))continue;const chain=j.find(x=>x.id===1),balance=j.find(x=>x.id===2);if(chain?.error||balance?.error||BigInt(chain.result)!==BigInt(config.chain_id)||!/^0x[0-9a-fA-F]{1,64}$/.test(balance.result))continue;
  const units=BigInt(balance.result),whole=units/1000000n,fraction=(units%1000000n).toString().padStart(6,'0');return {name:'wallet_balance',ok:true,units:units.toString(),balance_usdc:whole+'.'+fraction,address:config.address,chain_id:config.chain_id,rpc,evidence:'eth_chainId_and_eth_call_balanceOf'};
 }catch{}}
 return {name:'wallet_balance',ok:false,error:'rpc_unavailable',address:config.address,chain_id:config.chain_id};
}
export function evolve(previous,observations,config,now=Date.now()){
 const state=seedTasks(previous||{},now);state.agents||={};state.events||=[];state.cooldowns||={};state.limits||={concurrency:config.baseline_concurrency};state.manual||={};
 const collectorUnknown=observations.heartbeats.length>1&&observations.heartbeats.every(h=>!h.ok&&h.http===null);state.collector_health=collectorUnknown?'common_transport_failure_unconfirmed':'observed';
 const events=[];const emit=(key,type,detail)=>{if(!state.cooldowns[key]||now-state.cooldowns[key]>=config.alert_cooldown_seconds*1000){events.push({id:key+':'+now,type,at:new Date(now).toISOString(),...detail});state.cooldowns[key]=now;}};
 for(const h of observations.heartbeats){
  const old=state.agents[h.name]||{failures:0,successes:0,offline:false},a={...old,...h};for(const key of ['error','error_kind','error_detail','transport_code'])if(!(key in h))delete a[key];
  if(collectorUnknown&&old.offline&&old.http===null&&old.observation!=='independent_http'){a.offline=false;a.failures=0;events.push({id:'uncertain-pause-cleared:'+h.name+':'+now,type:'uncertain_pause_cleared',agent:h.name,at:new Date(now).toISOString(),note:'Unconfirmed collector outage is not independent proof of agent failure.'});}
  a.failures=collectorUnknown?a.failures:h.ok?0:old.failures+1;a.successes=collectorUnknown?0:h.ok?old.successes+1:0;a.observation=collectorUnknown?'unknown_collector_transport':'independent_http';
  if(a.failures>=config.failure_threshold){a.offline=true;emit('offline:'+h.name,'agent_offline',{agent:h.name,failures:a.failures});}
  if(a.offline&&h.ok&&a.successes>=config.recovery_threshold&&config.automatic_recovery){a.offline=false;events.push({id:'recovered:'+h.name+':'+now,type:'agent_recovered',agent:h.name,at:new Date(now).toISOString()});delete state.cooldowns['offline:'+h.name];}
  a.paused=!!state.manual[h.name]||a.offline;a.dispatch_allowed=!state.manual.global&&!a.paused;a.max_concurrency=a.dispatch_allowed?state.limits.concurrency:0;a.priority_multiplier=state.incentives?.profiles?.[h.name]?.priority_multiplier??1;
  state.agents[h.name]=a;
 }
 if(collectorUnknown)emit('collector_transport','sensor_unavailable',{sensor:'heartbeat_collector',note:'all probes failed without independent HTTP evidence; do not fabricate six agent outages'});
 const w=observations.wallet;state.wallet=w;
 let assetAlert=false;
 if(w.ok){
  const units=BigInt(w.units),last=state.last_balance;w.low=units<BigInt(Math.round(config.wallet.low_usdc*1e6));w.sudden_drop=!!last&&now-last.at<=config.wallet.drop_window_seconds*1000&&BigInt(last.units)-units>=BigInt(Math.round(config.wallet.drop_usdc*1e6));
  if(w.low){assetAlert=true;emit('wallet_low','wallet_low',{balance_usdc:w.balance_usdc});}else delete state.cooldowns.wallet_low;
  if(w.sudden_drop){assetAlert=true;emit('wallet_drop','wallet_drop',{balance_usdc:w.balance_usdc,previous_units:last.units});}
  state.last_balance={units:w.units,at:now};
 }else emit('wallet_unknown','sensor_unavailable',{sensor:'wallet_balance'});
 const offline=Object.values(state.agents).some(a=>a.offline),failed=observations.heartbeats.filter(a=>!a.ok).length;
 state.mode=offline||assetAlert||state.manual.global?'sympathetic':failed?'observing':'parasympathetic';
 state.controls={dispatch_paused:!!state.manual.global,automatic_recovery:config.automatic_recovery,concurrency:state.manual.global?0:state.limits.concurrency,investment_hold:assetAlert||!w.ok,paused_agents:Object.entries(state.agents).filter(([,v])=>v.paused).map(([k])=>k),all_tasks_independent_review:true};
 state.active_controller=state.agents.deepseek?.dispatch_allowed||state.agents.doubao?.dispatch_allowed?'gpt':state.agents.qianwen?.dispatch_allowed?'qianwen':'unavailable';
 state.events.push(...events);state.events=state.events.slice(-200);state.ran_at=new Date(now).toISOString();state.version=config.version;state.model_calls=0;state.financial_execution=false;state.paid=false;state.tx_hash=null;
 return {state,events};
}
export function control(previous,command,actor,config,now=Date.now()){
 let state=structuredClone(previous||{});if(!['gpt','qianwen'].includes(actor))throw Error('controller_required');
 if(typeof command.id!=='string'||!/^[A-Za-z0-9_.:-]{1,128}$/.test(command.id)||typeof command.reason!=='string'||!command.reason.trim()||command.reason.length>1000)throw Error('id_and_reason_required');
 state.command_ids||=[];if(state.command_ids.includes(command.id))return {state,duplicate:true};state.manual||={};state.limits||={concurrency:config.baseline_concurrency};
 let taskDuplicate=false;
 switch(command.action){
  case 'claim_task':case 'submit_task':{const r=taskCommand(state,command,actor,['gpt',...names(config)],now);state=r.state;taskDuplicate=r.duplicate;break;}
  case 'pause':case 'resume':if(!['global',...names(config)].includes(command.target))throw Error('unknown_target');state.manual[command.target]=command.action==='pause';break;
  case 'set_concurrency':if(!Number.isSafeInteger(command.value)||command.value<1||command.value>64)throw Error('concurrency_invalid');state.limits.concurrency=command.value;break;
  case 'dispatch':if(!names(config).includes(command.target)||typeof command.instruction!=='string'||!command.instruction.trim()||command.instruction.length>3000)throw Error('dispatch_invalid');state.dispatches||=[];state.dispatches.push({id:command.id,agent:command.target,instruction:command.instruction,actor,at:new Date(now).toISOString(),status:'queued'});state.dispatches=state.dispatches.slice(-30);break;
  case 'ack_dispatch':if(!Array.isArray(command.ids)||command.ids.some(id=>typeof id!=='string'))throw Error('ack_invalid');for(const d of state.dispatches||[])if(command.ids.includes(d.id)&&d.status==='queued')d.status='consumed_by_existing_executor';break;
  case 'probe':break;
  default:throw Error('unsupported_action');
 }
 // Recompute actuators immediately; waiting for the next probe would leave a pause ineffective.
 for(const [name,a]of Object.entries(state.agents||{})){a.paused=!!state.manual[name]||a.offline;a.dispatch_allowed=!state.manual.global&&!a.paused;a.max_concurrency=a.dispatch_allowed?state.limits.concurrency:0;}
 state.controls={...(state.controls||{}),dispatch_paused:!!state.manual.global,concurrency:state.manual.global?0:state.limits.concurrency,paused_agents:Object.entries(state.agents||{}).filter(([,v])=>v.paused).map(([k])=>k)};
 state.events||=[];state.events.push({id:command.id,type:'controller_'+command.action,actor,reason:command.reason,at:new Date(now).toISOString()});state.events=state.events.slice(-200);state.command_ids.push(command.id);state.command_ids=state.command_ids.slice(-500);return {state,duplicate:taskDuplicate};
}
