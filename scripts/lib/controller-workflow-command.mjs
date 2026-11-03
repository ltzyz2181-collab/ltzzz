// Fixed repository workflow dispatch; public commands never contain credentials.
import {createHash} from 'node:crypto';
export const REPO='ltzyz2181-collab/ltzzz';
const HASH=/^[a-f0-9]{40}$/,ID=/^CTRL-[A-Z0-9][A-Z0-9_-]{5,79}$/,TASK='PLAN-PATCHGATE-ESCROW-20261023';
const exact=(x,keys)=>x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===keys.sort().join(',');
export function commandIdentity(command){return createHash('sha256').update(JSON.stringify(command)).digest('hex');}
export function validateCommand(c){
 if(!exact(c,['schema','task_id','command_id','workflow','inputs'])||c.schema!=='ltzzz.controller-workflow-command.v1'||c.task_id!==TASK||!ID.test(c.command_id||''))throw Error('invalid_controller_command');
 if(c.workflow==='patchgate-a2-execute.yml'){
  if(!exact(c.inputs,['request'])||typeof c.inputs.request!=='string'||c.inputs.request.length>1024)throw Error('invalid_A2_command');
  let r;try{r=JSON.parse(c.inputs.request);}catch{throw Error('invalid_A2_command');}
  if(!exact(r,['schema','task_id','candidate_pr','candidate_head'])||r.schema!=='ltzzz.patchgate.a2-controller-request.v1'||r.task_id!==TASK||!Number.isSafeInteger(r.candidate_pr)||r.candidate_pr<1||r.candidate_pr>999999999||!HASH.test(r.candidate_head||''))throw Error('invalid_A2_command');
 }else if(c.workflow==='controller-paid-practice.yml'){
  if(!exact(c.inputs,['command_id','task_id'])||c.inputs.command_id!==c.command_id||c.inputs.task_id!==c.task_id)throw Error('invalid_practice_command');
 }else throw Error('workflow_not_allowlisted');
 return structuredClone(c);
}
export async function dispatchCommand({command,api,context,clock=Date.now}={}){
 const c=validateCommand(command),root='/repos/'+REPO;
 if(context?.repository!==REPO||context.ref!=='refs/heads/main'||!['push','issue_comment'].includes(context.event)||!HASH.test(context.source||'')||!/^\d{1,20}$/.test(context.run_id||''))throw Error('trusted_main_command_required');
 const outcome={schema:'ltzzz.controller-workflow-dispatch.v1',task_id:c.task_id,command_id:c.command_id,workflow:c.workflow,source_commit:context.source,run_id:context.run_id,command_sha256:commandIdentity(c),at_utc:new Date(clock()).toISOString(),status:'not_dispatched',dispatched:false,automatic_retry:false,paid:false,tx_hash:null};
 const main=await api('GET',root+'/git/ref/heads/main');
 if(main.status!==200||main.data?.object?.sha!==context.source)return {...outcome,status:'stale_main_command_not_dispatched'};
 const run=await api('GET',root+'/actions/runs/'+context.run_id),r=run.data;
 if(run.status!==200||String(r?.id)!==context.run_id||r.head_sha!==context.source||r.event!==context.event||r.head_branch!=='main'||r.path!=='.github/workflows/controller-workflow-command.yml'||r.repository?.full_name!==REPO||r.head_repository?.full_name!==REPO||r.status!=='in_progress'||r.actor?.id!==261544579)throw Error('actual_controller_command_run_required');
 const branch='controller-commands/'+c.command_id,ref='refs/heads/'+branch;
 const claim=await api('POST',root+'/git/refs',{ref,sha:context.source});
 if(claim.status!==201)return {...outcome,status:'claim_exists_or_unknown_reconcile_no_dispatch'};
 outcome.claim_ref=ref;
 // Reserve BEFORE the single POST. Lost dispatch responses never cause retry.
 try{const dispatch=await api('POST',root+'/actions/workflows/'+c.workflow+'/dispatches',{ref:'main',inputs:c.inputs});outcome.dispatched=dispatch.status===204;outcome.status=dispatch.status===204?'dispatch_accepted_child_result_pending':dispatch.status>=400&&dispatch.status<500?'dispatch_rejected_no_retry':'dispatch_outcome_unknown_reconcile_only';outcome.dispatch_http=dispatch.status;}
 catch{outcome.status='dispatch_outcome_unknown_reconcile_only';}
 const content=JSON.stringify(outcome,null,2)+'\n';
 try{const saved=await api('PUT',root+'/contents/knowledge/results/controller-commands/'+c.command_id+'.json',{branch,message:'Controller workflow dispatch receipt; reconcile before retry',content:Buffer.from(content).toString('base64')});outcome.receipt_persisted=saved.status===201;}catch{outcome.receipt_persisted=false;}
 return outcome;
}
