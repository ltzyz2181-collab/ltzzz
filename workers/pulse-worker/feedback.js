// Reflex evidence comes from independent HTTP/RPC observations and actual controls.
// It is neither an LLM approval nor a chain freeze/payment receipt.
export function updateFeedback(state,observations,config,now){
 const at=new Date(now).toISOString(),cases=structuredClone(state.autonomic_feedback?.cases||[]);
 for(const h of observations.heartbeats){
  const agent=state.agents[h.name];
  if(agent?.observation!=='independent_http')continue;
  let item=cases.find(c=>c.agent===h.name&&c.status!=='resolved');
  if(agent.offline&&!item){
   item={id:'ANS-REFLEX-'+h.name+'-'+now,agent:h.name,status:'open',
    observation:{at,http:h.http,consecutive_failures:agent.failures,evidence:'independent_http_health_not_generation'},
    action_taken:{type:'pause_agent_dispatch',at,dispatch_allowed:agent.dispatch_allowed,max_concurrency:agent.max_concurrency},
    follow_up_receipt:null,paid:false,tx_hash:null};cases.push(item);
  }
  if(item&&item.observation.at!==at){
   item.follow_up_receipt={at,http:h.http,ok:h.ok,consecutive_successes:agent.successes,offline:agent.offline,dispatch_allowed:agent.dispatch_allowed,evidence:'subsequent_independent_http_and_actual_dispatch_controls'};
   if(!agent.offline&&agent.dispatch_allowed&&agent.successes>=config.recovery_threshold){item.status='resolved';item.resolution='health_recovered_and_dispatch_restored';item.resolved_at=at;}
   else if(!agent.offline&&!agent.dispatch_allowed)item.status='open_controller_pause_retained';
  }
 }
 state.autonomic_feedback={version:1,observed_at:at,cases:cases.slice(-100),
  open_cases:cases.filter(c=>c.status!=='resolved').length,
  action_taken:{type:'apply_health_dispatch_controls',paused_agents:state.controls.paused_agents,dispatch_paused:state.controls.dispatch_paused},
  follow_up_receipt:state.ran_at?{previous_observation_at:state.ran_at,current_observation_at:at,next_probe_due_at:new Date(now+config.interval_seconds*1000).toISOString()}:null,
  scope:'actual_health_dispatch_reflexes_not_arbitrary_patch_deployment',
  financial_execution:false,model_generation_proven:false,real_money_penalty:false};
 return state;
}
