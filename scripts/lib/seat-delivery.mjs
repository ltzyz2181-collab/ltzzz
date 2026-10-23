import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export const DELIVERY_INDEX='knowledge/results/dispatch/external-deliveries/index.json';
const hash=b=>createHash('sha256').update(b).digest('hex');
const read=(root,file)=>{try{return JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));}catch{return null;}};
const provider=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'').replace(/^ark$/,'doubao');
export function deliveryPolicy(root,seat){
 const registry=read(root,'identity/seat-registry.json'),r=registry?.seats?.[seat]||registry?.external_collaborators?.[seat];
 const removed=['disabled','disabled_by_owner','removed','temporarily_removed'].includes(r?.work_status);
 const channel=removed?'disabled':r?.delivery_channel||'native_receipt';
 return {channel,work_status:r?.work_status||'not_registered',native_api_status:r?.native_api_status||null,expected_native_daily:r?.expected_native_daily!==false,source:'identity/seat-registry.json'};
}
export function externalDeliveryRequired(root,id){return (read(root,DELIVERY_INDEX)?.required_tasks||[]).includes(id);}
export function verifiedFile(root,ref){
 if(!/^(knowledge|results|ops)\/[A-Za-z0-9_./\u4e00-\u9fff-]+\.(json|md)$/.test(ref?.path||'')||ref.path.split('/').includes('..')||!/^[a-f0-9]{64}$/.test(ref.sha256||''))return null;
 try{const full=path.join(root,ref.path);if(!fs.realpathSync(full).startsWith(fs.realpathSync(root)+path.sep))return null;const bytes=fs.readFileSync(full);return hash(bytes)===ref.sha256?bytes:null;}catch{return null;}
}
// A PR by the shared GitHub account proves submission, not a native model identity.
// Cross-seat substitution requires an exact original task ID and executor evidence.
export function externalTaskDelivery(root,id,seat){
 const rows=read(root,DELIVERY_INDEX)?.deliveries||[],matching=rows.filter(r=>r.task_id===id);
 if(!matching.length)return {status:'not_linked',evidence:[]};
 if(matching.length!==1)return {status:'invalid',evidence:[DELIVERY_INDEX]};
 const entry=matching[0],raw=verifiedFile(root,entry.receipt);let r;try{r=JSON.parse(raw);}catch{return {status:'invalid',evidence:[DELIVERY_INDEX]};}
 const artifact=verifiedFile(root,r?.artifact);
 const bound=artifact&&(()=>{try{return JSON.parse(artifact).task_id===id;}catch{return artifact.toString().split('\n').some(line=>line.match(/^(?:- )?(?:Task ID|task_id|任务ID)[:：]\s*`?([A-Za-z0-9_-]+)`?\s*$/)?.[1]===id);}})();
 const evidence=[DELIVERY_INDEX,entry.receipt.path,r?.artifact?.path].filter(Boolean);
 if(r?.task_id!==id||r.logical_seat!==seat||!bound||!/^[a-f0-9]{40}$/.test(r.source_commit||''))return {status:'invalid',evidence};
 if(r.kind==='delegated_artifact'){
  let execution;try{execution=JSON.parse(verifiedFile(root,r.execution));}catch{}
  if(execution?.task_id!==id||execution.logical_seat!==seat||!provider(r.actual_provider)||provider(r.actual_provider)==='anthropic'||provider(execution.actual_provider)!==provider(r.actual_provider)||execution.artifact_sha256!==r.artifact.sha256||execution.source_commit!==r.source_commit||execution.generation_verified!==true||!['stop','end_turn'].includes(execution.finish_reason)||typeof execution.model!=='string'||!execution.model)return {status:'invalid',evidence};
  return {status:'delegated_delivery_pending_review',delegated:true,actual_provider:execution.actual_provider,model:execution.model,metadata_source:'hash_bound_executor_receipt',native_generation_verified:false,claim_verified:false,submission_verified:true,independent_review_verified:false,evidence:[...evidence,r.execution.path]};
 }
 if(r.kind==='repo_pr'){
  let pr;try{pr=JSON.parse(verifiedFile(root,r.pr_snapshot));}catch{}
  if(pr?.repository!=='ltzyz2181-collab/ltzzz'||!Number.isSafeInteger(pr.number)||pr.number<1||pr.head_sha!==r.source_commit||!pr.files?.some(f=>f.path===r.artifact.path&&f.sha256===r.artifact.sha256)||!['open','closed'].includes(pr.state)||typeof pr.merged!=='boolean'||pr.merged&&pr.state!=='closed')return {status:'invalid',evidence};
  return {status:pr.merged?'repo_pr_delivery_recorded':'repo_pr_unreviewed',delegated:false,actual_provider:null,reported_author_provider:r.reported_author_provider||null,model:null,metadata_source:'GitHub_PR_snapshot_not_native_model_attestation',pr_url:`https://github.com/ltzyz2181-collab/ltzzz/pull/${pr.number}`,native_generation_verified:false,claim_verified:false,submission_verified:true,independent_review_verified:false,evidence:[...evidence,r.pr_snapshot.path]};
 }
 return {status:'invalid',evidence};
}
