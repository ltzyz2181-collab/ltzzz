// Reconcile only a completed trusted run; never signs, merges or retries an order.
import {createHash} from 'node:crypto';
import {canonical,sha256,subjectFor,TASK} from './patchgate.mjs';
import {validateA2Request} from './patchgate-a2.mjs';
import {A2_STOP_REF,prepareDocsReadback,verifyDocsMerge} from './patchgate-a2-readback.mjs';
const REPO='ltzyz2181-collab/ltzzz',ROOT='/repos/'+REPO,SHA=/^[a-f0-9]{40}$/;
const STOP=ROOT+'/git/ref/heads/'+A2_STOP_REF;
export function validateReconcileEndpoint(method,url,body){
  if(method==='GET'&&body===undefined&&typeof url==='string'&&url.startsWith(ROOT+'/')){
    const p=url.slice(ROOT.length);
    if(p==='/git/ref/heads/'+A2_STOP_REF||/^\/git\/ref\/heads\/patchgate-a2-actions\/[a-f0-9]{64}$/.test(p)||/^\/contents\/knowledge\/results\/patchgate\/a2\/[a-f0-9]{64}\.json\?ref=[a-f0-9]{40}$/.test(p)
      ||/^\/actions\/runs\/[1-9]\d{0,19}$/.test(p)||/^\/pulls\/[1-9]\d{0,8}$/.test(p)||/^\/git\/commits\/[a-f0-9]{40}$/.test(p)||/^\/git\/trees\/[a-f0-9]{40}\?recursive=1$/.test(p)||/^\/compare\/[a-f0-9]{40}\.\.\.[a-f0-9]{40}$/.test(p))return;
  }
  if(method==='DELETE'&&url===ROOT+'/git/refs/heads/'+A2_STOP_REF&&body===undefined)return;
  throw Error('reconcile_API_not_allowed');
}
export function reconcileGithubApi({token,fetchImpl=fetch}){
  return async(method,url,body)=>{
    validateReconcileEndpoint(method,url,body);
    const r=await fetchImpl('https://api.github.com'+url,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'},redirect:'error',signal:AbortSignal.timeout(20000)});
    const text=await r.text();if(Buffer.byteLength(text)>2000000)throw Error('reconcile_response_too_large');let data;try{data=JSON.parse(text)}catch{data=null}return {status:r.status,data};
  };
}
function originalRecord(response,path,key){
  const f=response.data;
  if(response.status!==200||f?.path!==path||f.type!=='file'||f.encoding!=='base64'||typeof f.content!=='string'||f.content.length>200000||!SHA.test(f.sha||''))throw Error('authoritative_original_receipt_missing');
  const b64=f.content.replace(/[\r\n]/g,''),bytes=Buffer.from(b64,'base64');
  if(bytes.length!==f.size||bytes.toString('base64')!==b64||createHash('sha1').update(Buffer.from('blob '+bytes.length+'\0')).update(bytes).digest('hex')!==f.sha)throw Error('original_receipt_integrity_failed');
  const record=JSON.parse(bytes.toString('utf8'));
  validateA2Request('PUT',ROOT+'/contents/'+path,{branch:'patchgate-a2-actions/'+key,message:'A2 action outcome; reconcile before retry',content:b64});
  if(record.task_id!==TASK)throw Error('original_task_required');
  return {record,blob_sha:f.sha,sha256:sha256(bytes)};
}
function trustedCompletedRun(response,record,authority){
  const r=response.data;
  if(!authority||authority.workflow_path!=='.github/workflows/patchgate-a2-execute.yml'||!Number.isSafeInteger(authority.workflow_id)||authority.workflow_id<1)throw Error('trusted_execution_workflow_not_registered');
  if(response.status!==200||String(r?.id)!==record.run_id||r.repository?.full_name!==REPO||r.head_repository?.full_name!==REPO||r.head_branch!=='main'||r.head_sha!==record.source_main_sha
    ||r.workflow_id!==authority.workflow_id||r.path!==authority.workflow_path||!['workflow_dispatch','push','workflow_run'].includes(r.event)||r.status!=='completed'||!r.conclusion)throw Error('original_execution_running_or_untrusted');
}
export async function reconcileStop({api,readSource,authority=null,persistIntent,apply=false,now=Date.now()}){
  const out={schema:'ltzzz.patchgate.a2-reconciliation.v1',task_id:TASK,at_utc:new Date(now).toISOString(),apply_requested:apply,status:'observing',released:false,merge_requests:0,model_calls:0,financial_execution:false,paid:false,tx_hash:null};
  try{
    const stop=await api('GET',STOP);
    if(stop.status===404)return {...out,status:'no_stop_latch'};
    if(stop.status!==200||stop.data?.ref!=='refs/heads/'+A2_STOP_REF||!SHA.test(stop.data.object?.sha||''))throw Error('stop_identity_unreadable');
    const head=stop.data.object.sha,key=sha256(TASK+':'+head+':merge'),claimURL=ROOT+'/git/ref/heads/patchgate-a2-actions/'+key;
    out.head_sha=head;out.action_key=key;
    const claim=await api('GET',claimURL);
    if(claim.status!==200||claim.data?.ref!=='refs/heads/patchgate-a2-actions/'+key||!SHA.test(claim.data.object?.sha||''))throw Error('original_claim_unknown_keep_stop');
    const receiptRef=claim.data.object.sha,path='knowledge/results/patchgate/a2/'+key+'.json';
    const original=originalRecord(await api('GET',ROOT+'/contents/'+path+'?ref='+receiptRef),path,key),r=original.record;
    if(r.head_sha!==head)throw Error('stop_receipt_head_mismatch');
    out.original_receipt={path,ref:receiptRef,blob_sha:original.blob_sha,sha256:original.sha256,status:r.status,run_id:r.run_id};
    const runURL=ROOT+'/actions/runs/'+r.run_id;
    trustedCompletedRun(await api('GET',runURL),r,authority);
    const prURL=ROOT+'/pulls/'+r.pr_number,pr=(await api('GET',prURL));
    const validPR=p=>p.status===200&&p.data?.number===r.pr_number&&p.data.base?.ref==='main'&&p.data.base.repo?.full_name===REPO&&p.data.head?.repo?.full_name===REPO;
    if(!validPR(pr))throw Error('original_PR_unreadable');
    const source=await readSource({base:r.source_main_sha,head});
    if(source.snapshot.base_sha!==r.source_main_sha||source.snapshot.head_sha!==head||sha256(canonical(subjectFor(source.snapshot)))!==r.subject_sha256)throw Error('original_signed_subject_mismatch');
    if(['merged_readback_verified','post_merge_validation_failed_stopped','outcome_unknown_reconcile_no_retry'].includes(r.status)){
      const mergedSha=pr.data.merge_commit_sha;
      if(pr.data.merged!==true||pr.data.head.sha!==head||!SHA.test(mergedSha||'')||(r.merge_operation_confirmed&&mergedSha!==r.merge_commit_sha))throw Error('original_merge_identity_unconfirmed');
      const approved=await prepareDocsReadback({api,snapshot:source.snapshot,policy:source.policy}),proof=await verifyDocsMerge({api,approved,policy:source.policy,mergeSha:mergedSha});
      if(r.status==='merged_readback_verified'&&canonical(proof)!==canonical(r.postmerge_verification))throw Error('fresh_readback_differs_keep_stop');
      out.release_basis=r.status==='merged_readback_verified'?'fresh_tree_verification_of_persisted_success':'freshly_confirmed_original_merge_no_reexecution';out.postmerge_verification=proof;
    }else if(r.status==='merge_failed'&&r.merge_operation_confirmed===false&&pr.data.merged===false){
      // This status is emitted only before the original merge request is made.
      await prepareDocsReadback({api,snapshot:source.snapshot,policy:source.policy});
      out.release_basis='completed_premerge_abort_original_head_claim_retained';
    }else throw Error('unknown_or_invalid_merge_outcome_keep_stop');
    const again=await api('GET',STOP),againClaim=await api('GET',claimURL),againPR=await api('GET',prURL);
    trustedCompletedRun(await api('GET',runURL),r,authority);
    if(again.status!==200||again.data?.object?.sha!==head||againClaim.status!==200||againClaim.data?.object?.sha!==receiptRef||!validPR(againPR)
      ||againPR.data.merged!==pr.data.merged||againPR.data.merge_commit_sha!==pr.data.merge_commit_sha||againPR.data.head.sha!==pr.data.head.sha)throw Error('reconciliation_identity_changed_keep_stop');
    out.status='release_verified_dry_run';
    if(!apply)return out;
    if(typeof persistIntent!=='function')throw Error('durable_reconciliation_intent_required');
    out.intent=await persistIntent({...out,status:'release_intent_not_release',released:false});
    if(out.intent?.verified!==true||!SHA.test(out.intent.commit_sha||''))throw Error('reconciliation_intent_not_durable_keep_stop');
    const finalStop=await api('GET',STOP);trustedCompletedRun(await api('GET',runURL),r,authority);
    if(finalStop.status!==200||finalStop.data?.object?.sha!==head)throw Error('stop_changed_after_intent_keep_current_owner');
    // No replay if DELETE times out. A later invocation must re-read everything.
    const deleted=await api('DELETE',ROOT+'/git/refs/heads/'+A2_STOP_REF),after=await api('GET',STOP);
    if(deleted.status===204&&(after.status===404||(after.status===200&&SHA.test(after.data?.object?.sha||'')&&after.data.object.sha!==head))){out.status='released_after_full_reconciliation';out.released=true;}
    else out.status='delete_unconfirmed_reconcile_no_retry';
  }catch(e){out.status='held_for_reconciliation';out.reason=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'reconciliation_failed_keep_stop';}
  return out;
}
