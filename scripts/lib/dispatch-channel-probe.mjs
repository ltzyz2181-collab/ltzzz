import {createHash} from 'node:crypto';

export const CHANNEL_TARGETS=['gpt','doubao','deepseek','kimi','grok','qianwen','claude','meta','workbuddy','manus','kimi_global'];
export const channelDigest=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
export function planPrompt(record){return `派单通讯测试，按输入复述路由清单，不设计新业务。只输出 JSON：{"nonce":"${record.nonce}","targets":${JSON.stringify(CHANNEL_TARGETS)}}。全部任务仅核对文件与返回编号，不执行部署、模型采购、付款、投资或发布。`;} 
export function verifyPlan(result,record){
 if(!result?.ok||result.native_qwen_call!==true||result.model_source!=='provider_response'||!['stop','end_turn'].includes(result.finish_reason))return false;
 try{const data=JSON.parse(result.output.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));return data.nonce===record.nonce&&Array.isArray(data.targets)&&data.targets.length===CHANNEL_TARGETS.length&&new Set(data.targets).size===CHANNEL_TARGETS.length&&data.targets.every(t=>CHANNEL_TARGETS.includes(t));}catch{return false;}
}
function fresh(status,now){const at=Date.parse(status?.ran_at);return status?.stale===false&&Number.isFinite(at)&&now-at>=-60000&&now-at<900000;}

// Pure orchestration: all network/credentials live in the fixed Actions runner.
// A probe has a separate queue state and never enters normal paid daily work.
export async function probeDispatchChannels(record,{schema,status,control,save,callQwen,runMeta,inspectClaude,workbuddyInspect,now=()=>Date.now()}){
 if(record.status!=='reserved_before_remote_access'||record.operations?.length)throw Error('fresh_committed_reservation_required');
 record.operations=[];record.channels=[];
 const persist=async()=>save(record);
 try{
  const shape=await schema(),before=await status();
  if(!fresh(before,now())||!shape.controllers?.includes('qianwen'))throw Error('fresh_qianwen_controller_required');
  record.schema={dispatch_targets:shape.dispatch_targets||[],health_targets:shape.health_targets||[],at:new Date(now()).toISOString()};
  if(callQwen){
   record.native_plan={status:'request_started',model_calls:1};await persist();
   let result;try{result=await callQwen(planPrompt(record));}catch{result={ok:false,status:'provider_incomplete_or_uncertain'};}
   record.native_plan={status:result.status||'unverified',model_calls:['not_configured','configuration_error'].includes(result.status)?0:1,verified:verifyPlan(result,record),provider:result.provider||null,actual_model:result.model_source==='provider_response'?result.model:null,model_source:result.model_source||null,finish_reason:result.finish_reason||null,request_id:result.request_id||null,tokens_used:result.tokens_used||0,output:result.ok?result.output:null,output_sha256:result.ok?channelDigest(result.output):null,spec_provided_in_prompt:true,scope:'native_Qwen_route_plan_echo_not_autonomous_business_design'};await persist();
  }
  async function send(body){
   const op={id:body.id,action:body.action,target:body.target||body.consumer_agent||null,status:'request_started'};record.operations.push(op);await persist();
   const response=await control(body);op.http=response.http;op.authenticated_actor=response.data?.actor||null;op.status=response.http===200&&response.data?.ok===true&&response.data.actor==='qianwen'?'acknowledged':'rejected_or_uncertain';await persist();return response;
  }
  for(const target of CHANNEL_TARGETS){
   const id=`${record.task_id}-${target}`,instruction=`派单通道只读验收 ${id} / nonce ${record.nonce}。返回原编号与核查回执；这是 probe_only，不执行常规日课、付费模型、部署、采购、投资、付款或发布。`;
   const row={target,dispatch_id:id,dispatcher_role:'qianwen',native_qwen_plan_verified:record.native_plan?.verified===true,status:'not_attempted',dispatch_verified:false,consumer_verified:false,native_client_verified:false};record.channels.push(row);await persist();
   if(!shape.dispatch_targets?.includes(target)){row.status='blocked_target_not_registered';await persist();continue;}
   try{
    const body={id,action:'dispatch',target,instruction,probe_only:true,reason:'Owner requested live dispatch acceptance; deputy Qianwen role, no financial or ordinary generation execution'};
    const response=await send(body),after=await status(),matches=after.dispatches?.filter(d=>d.id===id)||[];
    row.dispatch_verified=response.http===200&&response.data?.actor==='qianwen'&&matches.length===1&&matches[0].actor==='qianwen'&&matches[0].agent===target&&matches[0].instruction===instruction&&matches[0].probe_only===true&&matches[0].status==='probe_waiting_consumer';
    row.dispatch_http=response.http;row.readback=matches.length===1?{id:matches[0].id,actor:matches[0].actor,target:matches[0].agent,status:matches[0].status,instruction_sha256:channelDigest(matches[0].instruction)}:null;
    if(!row.dispatch_verified){row.status='blocked_dispatch_or_readback';await persist();continue;}
    row.status='dispatched_waiting_actual_consumer';
    if(['claude','meta','workbuddy'].includes(target)){
     const duplicate=await send(body),again=await status();row.idempotency_verified=duplicate.data?.duplicate===true&&again.dispatches?.filter(d=>d.id===id).length===1;
    }
    let consumed;
    if(target==='claude'&&inspectClaude)row.consumer=await inspectClaude();
    if(target==='meta'&&runMeta){const result=await runMeta({taskId:id,nonce:record.nonce});row.consumer=result;if(result.generation_verified===true)consumed={kind:'meta_hosted',evidence_sha256:channelDigest(result)};}
    if(target==='workbuddy'&&workbuddyInspect){const result=await workbuddyInspect({taskId:id,nonce:record.nonce});row.consumer=result;if(result.inspection_verified===true)consumed={kind:'workbuddy_rules',evidence_sha256:channelDigest(result)};}
    if(consumed){
     const ack=await send({id:id+'-ack',action:'ack_dispatch',ids:[id],probe_only:true,consumer_agent:target,consumer_kind:consumed.kind,evidence_sha256:consumed.evidence_sha256,reason:'Fixed authorized executor completed this exact nonce-bound probe; not a native external client acknowledgment'});
     const observed=(await status()).dispatches?.find(d=>d.id===id);
     row.consumer_verified=ack.http===200&&observed?.status==='probe_consumed_by_verified_executor'&&observed.consumption?.agent===target&&observed.consumption.kind===consumed.kind&&observed.consumption.evidence_sha256===consumed.evidence_sha256;
     row.status=row.consumer_verified?'executor_consumed_probe_not_native_client':'blocked_consumer_readback';
    }
   }catch{row.status='blocked_transport_or_uncertain_no_retry';}
   await persist();
  }
  record.status=record.channels.every(c=>c.dispatch_verified)?'dispatch_verified_external_client_acceptance_pending':'partial_dispatch_blocked';
 }catch(e){record.status='blocked_before_dispatch_or_uncertain';record.error_code=['fresh_qianwen_controller_required'].includes(e.message)?e.message:'probe_dependency_unavailable';}
 record.model_calls=(record.native_plan?.model_calls||0)+record.channels.filter(c=>c.target==='meta').reduce((s,c)=>s+(c.consumer?.model_calls||0),0);
 record.native_anthropic_calls=0;record.native_openai_calls=0;record.native_workbuddy_calls=0;record.financial_execution=false;record.paid=false;record.tx_hash=null;record.model_api_cost_is_separate_from_USDC=true;record.finished_at=new Date(now()).toISOString();await persist();return record;
}
