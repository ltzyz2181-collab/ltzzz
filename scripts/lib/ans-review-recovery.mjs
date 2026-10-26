import fs from 'node:fs';
import path from 'node:path';
import {digest} from './ans-cycle.mjs';

const DATE=/^\d{4}-\d{2}-\d{2}$/;
const read=(root,p)=>{const file=path.resolve(root,p);if(!fs.realpathSync(file).startsWith(fs.realpathSync(root)+path.sep)||fs.lstatSync(file).isSymbolicLink())throw Error('recovery_evidence_path_invalid');return fs.readFileSync(file);};
const writeOnce=(root,p,bytes)=>{const file=path.join(root,p);fs.mkdirSync(path.dirname(file),{recursive:true});if(fs.existsSync(file)){if(!read(root,p).equals(Buffer.from(bytes)))throw Error('immutable_recovery_evidence_changed');}else fs.writeFileSync(file,bytes,{flag:'wx'});};
const parsed=text=>JSON.parse(String(text).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));

// A supplementary review consumes an existing author artifact. It never replays
// an uncertain provider request or attributes Qwen output to native Doubao.
export function materializeAnsReview({root='.',date,receiptPath,now=new Date().toISOString()}){
 if(!DATE.test(date)||!/^knowledge\/results\/qwen-dispatch\/[A-Z0-9_-]+\.json$/.test(receiptPath||''))throw Error('invalid_recovery_subject');
 const file=`knowledge/results/ans-cycle/${date}.json`,record=JSON.parse(read(root,file)),receiptBytes=read(root,receiptPath),receipt=JSON.parse(receiptBytes);
 if(record.review_recovery)throw Error('recovery_already_materialized');
 if(record.date!==date||record.status!=='blocked_provider_or_incomplete'||record.audit||record.artifacts?.length!==1||record.artifacts[0].role!=='worker')throw Error('existing_worker_without_review_required');
 if(receipt.native_qwen_call!==true||receipt.model_source!=='provider_response'||!/^qwen/.test(receipt.model||'')||receipt.finish_reason!=='stop'||receipt.status!=='draft_delivered_pending_independent_review'||digest(receipt.output)!==receipt.output_sha256||!/^\d+$/.test(receipt.run_id||''))throw Error('native_review_receipt_required');
 const worker=record.artifacts[0],workerId=`ANS-${date}-deepseek`,reviewerId=`ANS-${date}-doubao`;
 if(worker.task_id!==workerId||worker.path!==`knowledge/results/ans-cycle/${date}-worker.json`||digest(read(root,worker.path))!==worker.sha256||worker.executed_by!=='DeepSeek'||record.tasks?.[1]?.id!==reviewerId)throw Error('worker_binding_invalid');
 const verdicts=parsed(receipt.output).reviews,matching=Array.isArray(verdicts)?verdicts.filter(v=>v.task_id===workerId):[];
 const verdict=matching[0];
 if(matching.length!==1||verdict.reviewer_task_id!==reviewerId||verdict.artifact_sha256!==worker.sha256||typeof verdict.accepted!=='boolean'||!Array.isArray(verdict.reasons)||!verdict.reasons.length||verdict.reasons.some(s=>typeof s!=='string'||!s.trim())||!Array.isArray(verdict.unverified))throw Error('review_binding_invalid');
 const original=read(root,file),archive=`knowledge/results/ans-cycle/${date}-before-qwen-review-recovery.json`;
 writeOnce(root,archive,original);
 const audit={...verdict,executed_by:'Qianwen',model:receipt.model,scope:'engineering_draft_only',logical_reviewer_seat:'doubao',actual_provider:'aliyun_dashscope',source_receipt:receiptPath,source_receipt_sha256:digest(receiptBytes)};
 const bytes=JSON.stringify(audit,null,2)+'\n',reviewPath=`knowledge/results/ans-cycle/${date}-reviewer.json`;
 writeOnce(root,reviewPath,bytes);
 record.artifacts.push({role:'reviewer',task_id:reviewerId,executed_by:'Qianwen',model:receipt.model,path:reviewPath,sha256:digest(bytes)});
 record.calls.push({requested_agent:'Doubao',executed_by:'Qianwen',model:receipt.model,status:'success',finish_reason:receipt.finish_reason,tokens_used:receipt.tokens_used,at:receipt.at,source_run_id:receipt.run_id,shared_request_id:receipt.request_id,usage_scope:'shared_two_subject_review_request_not_additive_across_dates',source_receipt:receiptPath});
 record.audit=audit;record.status=verdict.accepted?'draft_independently_reviewed':'draft_rejected';record.deployed=false;
 record.review_recovery={original:{path:archive,sha256:digest(original)},receipt:{path:receiptPath,sha256:digest(receiptBytes)},source_run_id:receipt.run_id,at_utc:now,actual_provider:'aliyun_dashscope',model:receipt.model,logical_reviewer_seat:'doubao',original_uncertain_attempt_preserved:true,author_model_replays:0};
 record.follow_up_receipt={artifact_sha256:worker.sha256,reviewer_provider:'Qianwen',reviewer_model:receipt.model,accepted:verdict.accepted,scope:'independent_engineering_draft_review_not_production_execution'};
 record.completed_at=now;record.remote_review_status=null;record.board_verification=null;
 fs.writeFileSync(path.join(root,file),JSON.stringify(record,null,2)+'\n');return record;
}

export function cycleClosure(record,{root='.'}={}){
 try{
  if(!DATE.test(record.date)||!['draft_independently_reviewed','draft_rejected'].includes(record.status)||typeof record.audit?.accepted!=='boolean')return false;
  const worker=record.artifacts?.find(a=>a.role==='worker'),reviewer=record.artifacts?.find(a=>a.role==='reviewer');
  if(record.artifacts.length!==2||!worker||!reviewer||worker.task_id!==`ANS-${record.date}-deepseek`||reviewer.task_id!==`ANS-${record.date}-doubao`||!worker.executed_by||!reviewer.executed_by||worker.executed_by.toLowerCase()===reviewer.executed_by.toLowerCase())return false;
  for(const a of [worker,reviewer])if(a.path!==`knowledge/results/ans-cycle/${record.date}-${a.role}.json`||digest(read(root,a.path))!==a.sha256)return false;
  const verdict=JSON.parse(read(root,reviewer.path));
  if(verdict.accepted!==record.audit.accepted||verdict.artifact_sha256!==worker.sha256||record.audit.artifact_sha256!==worker.sha256||record.audit.executed_by!==reviewer.executed_by)return false;
  const expected=record.audit.accepted?'completed_draft_review':'rejected_draft_review';
  return record.status===(record.audit.accepted?'draft_independently_reviewed':'draft_rejected')&&record.remote_review_status===expected&&record.sync_status==='hashed_artifacts_submitted'&&record.board_verification?.verified===true&&record.board_verification.worker_status===expected;
 }catch{return false;}
}

export function pendingAnsReviewSync(root='.'){
 const dir=path.join(root,'knowledge/results/ans-cycle');if(!fs.existsSync(dir))return [];
 return fs.readdirSync(dir).filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().flatMap(n=>{
  try{
   const r=JSON.parse(read(root,'knowledge/results/ans-cycle/'+n)),recovery=r.review_recovery;
   if(!recovery||n!==r.date+'.json'||cycleClosure(r,{root}))return [];
   if(recovery.original?.path!==`knowledge/results/ans-cycle/${r.date}-before-qwen-review-recovery.json`||digest(read(root,recovery.original.path))!==recovery.original.sha256||!/^knowledge\/results\/qwen-dispatch\/[A-Z0-9_-]+\.json$/.test(recovery.receipt?.path||'')||digest(read(root,recovery.receipt.path))!==recovery.receipt.sha256)throw Error();
   return [r.date];
  }catch{throw Error('invalid_pending_review_recovery');}
 });
}
