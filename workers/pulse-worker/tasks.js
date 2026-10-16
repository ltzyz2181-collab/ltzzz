export const cstDate=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function baselineDispatches(date){return [
 {id:'ANS-'+date+'-deepseek',agent:'deepseek',instruction:'ANS/Pulse首要任务：读取最新真实监控与奖惩回执，区分代理健康、原生生成和交付验收；定位一个真实阻塞并交代码补丁或可运行断言，附来源，不执行资金。',status:'queued_for_next_daily_economy',source:'coordinator_rules_zero_model_baseline'},
 {id:'ANS-'+date+'-doubao',agent:'doubao',instruction:'ANS/Pulse首要任务：独立复核DeepSeek的监控/奖惩修复；交一个包含正常、失败、恢复、幂等的验收清单或测试实物，禁止把未通过写成功。',status:'queued_for_next_daily_economy',source:'coordinator_rules_zero_model_baseline'}
 ];}
export function dailyBaselineDispatches(date){return baselineDispatches(date).map(task=>({...task,id:'DAILY-'+date+'-'+task.agent,execution_chain:'daily'}));}
export function seedTasks(previous={},now=Date.now()){
 const state=structuredClone(previous),date=cstDate(now);state.task_board||=[];
 const candidates=[...baselineDispatches(date).map(t=>({...t,status:'assigned',assigned_to:t.agent,execution_chain:'ans'})),
 ...dailyBaselineDispatches(date).map(t=>({...t,status:'assigned',assigned_to:t.agent})),
 {id:'AUTO-'+date+'-health',instruction:'自主检查最新Pulse心跳与实际生成回执是否混淆，交可核验证据或修复，不能凭健康200宣布模型已生成。',skill:'audit'},
 {id:'AUTO-'+date+'-incentives',instruction:'自主复算一条行动奖惩的交付哈希与独立审计依据，找重复结算/不当处罚，交证据；不改真钱账本。',skill:'audit'},
 {id:'AUTO-'+date+'-continuity',instruction:'自主检查每日派单、认领和执行回执是否连续；找一个卡住的交接并修补，不重复购买未知请求。',skill:'engineering'}];
 for(const task of candidates)if(!state.task_board.some(t=>t.id===task.id))state.task_board.push({...task,date,created_at:new Date(now).toISOString(),status:task.status||'available',origin:'logical_gpt_coordinator_rules_not_native_gpt_call',paid:false,tx_hash:null});
 state.task_board=state.task_board.filter(t=>t.date===date||['claimed','submitted_pending_review'].includes(t.status)||Date.parse(t.created_at)>now-7*86400000).slice(-250);state.daily_dispatch_date=date;state.task_board_schema_version=2;return state;
}
export function taskCommand(previous,command,actor,allowedAgents,now=Date.now()){
 const state=seedTasks(previous,now),t=state.task_board.find(t=>t.id===command.task_id);if(!t)throw Error('task_missing');
 if(!allowedAgents.includes(command.agent))throw Error('agent_invalid');
 if(command.action==='claim_task'){
  if(t.status==='claimed'&&t.claimed_by===command.agent)return {state,duplicate:true};
  if(!['available','assigned'].includes(t.status)||t.assigned_to&&t.assigned_to!==command.agent)throw Error('task_not_available');
  t.status='claimed';t.claimed_by=command.agent;t.claim_actor=actor;t.claimed_at=new Date(now).toISOString();t.claim_kind='authenticated_executor_declaration_not_native_model_proof';
 }else if(command.action==='submit_task'){
  if(t.claimed_by!==command.agent)throw Error('not_claimed_worker');
  if(!/^(knowledge|results|ops)\/[A-Za-z0-9_./\u4e00-\u9fff-]+$/.test(command.evidence_path||'')||command.evidence_path.split('/').includes('..')||!/^[a-f0-9]{64}$/i.test(command.evidence_sha256||''))throw Error('artifact_evidence_required');
  if(t.status==='submitted_pending_review'&&t.evidence_path===command.evidence_path&&t.evidence_sha256===command.evidence_sha256)return {state,duplicate:true};
  if(t.status!=='claimed')throw Error('task_not_claimed');
  t.status='submitted_pending_review';t.evidence_path=command.evidence_path;t.evidence_sha256=command.evidence_sha256;t.submitted_at=new Date(now).toISOString();t.model_execution_verified=false;t.paid=false;t.tx_hash=null;
 }else if(command.action==='review_task'){
  if(!['submitted_pending_review','completed_draft_review','rejected_draft_review'].includes(t.status))throw Error('task_not_submitted');
  if(typeof command.accepted!=='boolean'||command.reviewed_sha256!==t.evidence_sha256||command.scope!=='engineering_draft_only')throw Error('bound_review_required');
  if(!allowedAgents.includes(command.worker_actual_provider)||!allowedAgents.includes(command.reviewer_actual_provider)||command.worker_actual_provider===command.reviewer_actual_provider)throw Error('independent_actual_provider_required');
  if(!/^(knowledge|results|ops)\/[A-Za-z0-9_./\u4e00-\u9fff-]+$/.test(command.review_evidence_path||'')||command.review_evidence_path.split('/').includes('..')||!/^[a-f0-9]{64}$/i.test(command.review_evidence_sha256||''))throw Error('review_evidence_required');
  const next=command.accepted?'completed_draft_review':'rejected_draft_review';
  if(t.status===next&&t.review?.evidence_sha256===command.review_evidence_sha256)return {state,duplicate:true};
  if(t.status!=='submitted_pending_review')throw Error('review_already_final');
  t.status=next;t.review={scope:command.scope,accepted:command.accepted,worker_actual_provider:command.worker_actual_provider,reviewer_actual_provider:command.reviewer_actual_provider,evidence_path:command.review_evidence_path,evidence_sha256:command.review_evidence_sha256,reviewed_sha256:command.reviewed_sha256,at:new Date(now).toISOString(),provenance:'authenticated_executor_attestation'};t.paid=false;t.tx_hash=null;t.deployed=false;
 }else throw Error('task_action_invalid');
 return {state,duplicate:false};
}
