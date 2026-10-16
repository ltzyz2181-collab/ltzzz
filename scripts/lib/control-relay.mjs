import {createHash} from 'node:crypto';

export const REPOSITORY='ltzyz2181-collab/ltzzz';
export const PREFIX='[LTZZZ接力]';
export const ACTIONS={inspect:'查看总控状态（零模型）',qianwen_inspect:'总控派单给千问：只读核验（零模型）',dispatch:'总控派单给千问：等待外部接单'};
export const sha256=text=>createHash('sha256').update(text).digest('hex');
export function relayBody(action,task){
 if(!Object.hasOwn(ACTIONS,action))throw Error('unsupported_relay_action');
 if(typeof task!=='string'||!task.trim()||task.length>2500)throw Error('task_length');
 // These headers delimit the form. Embedded headers cannot change the action.
 if(/^### (?:接力动作|任务内容)\s*$/m.test(task))throw Error('reserved_form_heading');
 return '### 接力动作\n\n'+ACTIONS[action]+'\n\n### 任务内容\n\n'+task.trim();
}
export function relayRequest(event,{actor,repository}={}){
 const issue=event.issue;
 if(repository!==REPOSITORY||event.repository?.full_name!==REPOSITORY||actor!=='ltzyz2181-collab'||issue?.user?.login!==actor||event.action!=='opened'||!Number.isSafeInteger(issue?.number)||issue.number<1||!String(issue.title).startsWith(PREFIX))throw Error('owner_opened_issue_required');
 const body=String(issue.body||'');if(body.length>3200)throw Error('body_length');
 const match=body.match(/^### 接力动作\r?\n+([^\r\n]+)\r?\n+### 任务内容\r?\n+([\s\S]+)$/);
 const action=Object.keys(ACTIONS).find(a=>ACTIONS[a]===match?.[1]?.trim());
 if(!action)throw Error('explicit_relay_action_required');
 const task=match[2].trim();relayBody(action,task);
 return {id:'issue-'+issue.number,issue_number:issue.number,action,task,author:actor,source:'https://github.com/'+REPOSITORY+'/issues/'+issue.number};
}
export async function executeRelay(record,{readStatus,control,evidence,save=async()=>{}}){
 if(record.status!=='claimed_before_remote_access'||record.operations?.length)throw Error('fresh_durable_claim_required');
 record.operations||=[];
 async function command(role,body){
  // Persist intent before a potentially uncertain request. No automatic retry.
  const op={role,id:body.id,action:body.action,status:'request_started'};record.operations.push(op);await save(record);
  const result=await control(role,body);
  if(result?.ok!==true||result.actor!==role)throw Error('remote_role_not_verified');
  op.status='acknowledged';op.duplicate=result.duplicate===true;op.authenticated_actor=result.actor;await save(record);
 }
 try{
  const initial=await readStatus();
  const observedAt=Date.parse(initial?.ran_at);
  if(!Number.isFinite(observedAt)||initial.stale!==false||Date.now()-observedAt>900000||observedAt>Date.now()+60000)throw Error('fresh_pulse_required');
  record.observed={ran_at:initial.ran_at,active_controller:initial.active_controller,controls:initial.controls};
  if(record.action==='inspect'){record.status='completed_readonly';await save(record);return record;}
  if(initial.controls?.dispatch_paused||initial.agents?.qianwen?.dispatch_allowed===false)throw Error('dispatch_paused');
  const id='desktop-relay-'+record.id;
  await command('gpt',{id,action:'dispatch',target:'qianwen',instruction:record.task,reason:'Owner desktop/domestic assistant relay; logical coordinator, zero native GPT calls'});
  if(record.action==='dispatch'){record.status='assigned_waiting_external_acceptance';await save(record);return record;}
  // Fixed read-only executor. Free text is evidence/context, never shell or policy.
  record.evidence=evidence;record.evidence_sha256=sha256(JSON.stringify(evidence));
  record.execution_kind='qianwen_authorized_rules_executor_not_native_model';await save(record);
  await command('qianwen',{id:id+'-ack',action:'ack_dispatch',ids:[id],reason:'Deputy completed fixed read-only receipt inspection; artifact hash '+record.evidence_sha256});
  const after=await readStatus(),found=after.dispatches?.find(d=>d.id===id);
  if(found?.actor!=='gpt'||found.agent!=='qianwen'||found.status!=='consumed_by_existing_executor')throw Error('board_handover_not_verified');
  record.board_verification={verified:true,dispatch_id:id,issuer:found.actor,assigned_to:found.agent,status:found.status};
  record.status='completed_readonly_pending_review';
 }catch(e){record.status='blocked_or_remote_uncertain';record.error=e.message;record.automatic_retry_allowed=false;}
 await save(record);return record;
}
