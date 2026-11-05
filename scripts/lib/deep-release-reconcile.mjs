const COMMIT=/^[a-f0-9]{40}$/;
const SHA=/^[a-f0-9]{64}$/;
export const AUDIT_WORKFLOW='Key Liveness Probe (AI seats)';
export function trustedAuditCompletion(event){
 const run=event?.workflow_run;
 return event?.action==='completed'&&event.repository?.full_name==='ltzyz2181-collab/ltzzz'&&run?.name===AUDIT_WORKFLOW&&run.conclusion==='success'&&run.head_branch==='main'&&run.head_repository?.full_name==='ltzyz2181-collab/ltzzz'&&['schedule','push','workflow_dispatch','workflow_run'].includes(run.event)&&Number.isSafeInteger(run.id)&&run.id>0;
}
export function planReconciliation(observed,expected){
 if(!SHA.test(expected||''))throw Error('invalid_expected_source_closure');
 const h=observed?.data;
 if(observed?.http!==200||h?.service!=='ltzzz-deep-superagent'||h.revision!=='ltzzz.deep-superagent.v1'||!COMMIT.test(h.source_commit||''))throw Error('live_release_unknown_reconcile_before_deploy');
 if(h.source_readset_sha256!==undefined&&h.source_readset_sha256!==null&&!SHA.test(h.source_readset_sha256))throw Error('live_release_digest_malformed');
 return {action:h.source_readset_sha256===expected?'verify_unchanged':'deploy_tested_source',expected_source_readset_sha256:expected,previous_release:{source_commit:h.source_commit,source_readset_sha256:h.source_readset_sha256??null},reason:h.source_readset_sha256===expected?'same_dependency_closure':'changed_or_pre_digest_release'};
}
export function continuityAnchor(job){
 if(!job||typeof job.execution_id!=='string'||!job.execution_id||!SHA.test(job.input_sha256||'')||!Number.isSafeInteger(job.model_calls)||!Array.isArray(job.receipts)||!job.terminal)throw Error('durable_continuity_anchor_unavailable');
 return JSON.stringify({execution_id:job.execution_id,input_sha256:job.input_sha256,model_calls:job.model_calls,receipts:job.receipts});
}
