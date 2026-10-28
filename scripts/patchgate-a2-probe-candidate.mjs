// Runs only in the separate no-Secrets candidate job. Never a production checker.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {generateKeyPairSync,createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {runCollectorProbes} from './patchgate-a2-collector-probe-candidate.mjs';

export async function runCandidateProbes({candidateRoot,control}){
 const actual=execFileSync('git',['rev-parse','HEAD'],{cwd:candidateRoot,encoding:'utf8'}).trim();
 if(actual!==control.card.candidate_head)throw Error('probe_checkout_head_mismatch');
 if(execFileSync('git',['status','--porcelain','--untracked-files=no'],{cwd:candidateRoot,encoding:'utf8'}).trim())throw Error('probe_clean_exact_candidate_required');
 const shared=await import(pathToFileURL(path.join(candidateRoot,'scripts/lib/patchgate.mjs')).href);
 const target=await import(pathToFileURL(path.join(candidateRoot,'scripts/lib/patchgate-a2.mjs')).href);
 const {canonical,sha256,subjectFor,TASK}=shared,{mergeDocsOnce,signExecutorAttestation,validateA2Request,a2GithubApi}=target;
 const defaults=JSON.parse(fs.readFileSync(path.join(candidateRoot,'config/patchgate-a2.json'))),policy=JSON.parse(fs.readFileSync(path.join(candidateRoot,'config/patch-policy.json')));
 const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),H='1'.repeat(64),REPO='ltzyz2181-collab/ltzzz',ROOT='/repos/'+REPO;
 const now=Date.now(),providers=['openai',...defaults.required_stage_auditors,'github_actions'];
 if(providers.length!==4||new Set(providers).size!==4)throw Error('probe_requires_two_distinct_non_author_signers');
 // Fresh process-local fixture keys only, never persisted or enrolled.
 const pairs=providers.map((provider,i)=>({...generateKeyPairSync('ed25519'),provider,id:'probe-key-'+i,executor:'probe-executor-'+i}));
 function fixture(){
  const trust={schema_version:1,enabled:true,source_binding_required:true,keys:pairs.map(p=>({id:p.id,executor:p.executor,provider:p.provider,enabled:true,source_deployment_verified:true,allowed_signer_source_sha256:[H],cloud_account_binding:'fixture-cloud',deployment_evidence_sha256:'e'.repeat(64),roles:p.provider==='github_actions'?['checks','external_audit_readback']:['author','review','stage_review'],public_key_pem:p.publicKey.export({format:'pem',type:'spki'}),not_before:new Date(now-3600000).toISOString(),not_after:new Date(now+3600000).toISOString()}))};
  const registry={schema_version:1,repository:REPO,executors:trust.keys.map(k=>({id:k.executor,provider:k.provider,signing_key_ids:[k.id],roles:k.roles,signing_enabled:true,source_deployment_verified:true,allowed_signer_source_sha256:k.allowed_signer_source_sha256,cloud_account_binding:k.cloud_account_binding,deployment_evidence_sha256:k.deployment_evidence_sha256}))};
  const sign=(i,payload)=>signExecutorAttestation({registry,trust,executorId:pairs[i].executor,keyId:pairs[i].id,privateKey:pairs[i].privateKey.export({format:'pem',type:'pkcs8'}),payload:{at_utc:new Date(now).toISOString(),signer_source_sha256:H,signer_cloud_account_binding:'fixture-cloud',signer_deployment_evidence_sha256:'e'.repeat(64),...(payload.role==='stage_review'?{review_scope:'A2_L0_docs_only'}:{}),...payload}});
  const snapshot={repository:REPO,task_id:TASK,base_sha:A,head_sha:B,policy_sha256:sha256(canonical(policy)),trust_sha256:sha256(canonical(trust)),files:[{path:'docs/probe-only.md',mode:'100644',old_mode:null,diff:'@@ -0,0 +1 @@\n+probe fixture only\n',binary:false}]};
  const subject=subjectFor(snapshot),checkRuns=[{name:defaults.required_check_names[0],head_sha:B,status:'completed',conclusion:'success'}];
  const author=sign(0,{subject,role:'author'}),checks=sign(3,{subject,role:'checks',passed:true,checker_base_sha:A,checks_sha256:sha256(canonical(checkRuns))});
  const review=i=>sign(i,{subject,role:'review',verdict:'approve',generation_verified:true,metadata_source:'provider_response',model:'probe-model-'+i,finish_reason:'stop',output_sha256:H});
  const rolloutSubject={task_id:TASK,phase:'A2',runtime_bundle_sha256:H};
  const config={...defaults,enabled:true,base_compare_and_swap_verified:true,production_signing_keys_provisioned:true,runtime_bundle_sha256:H,stage_audits:[1,2].map(i=>sign(i,{subject:rolloutSubject,role:'stage_review',verdict:'approve',artifact_sha256:H,reviewed_source_commit:A}))};
  const auditMetadata={schema:'ltzzz.external-stage-audit.v1',task_id:TASK,phase:'A2',seat:'claude',verdict:'approve',reviewed_source_commit:A,runtime_bundle_sha256:H};
  const auditBytes=Buffer.from('```json\n'+JSON.stringify(auditMetadata)+'\n```\nFixture PR readback only, not native Claude proof.\n');
  const readback={schema:'ltzzz.external-audit-pr-readback.v1',source:'github_rest_immutable_pr_file',repository:REPO,pr_http_status:200,file_http_status:200,pr_number:244,pr_head_sha:C,pr_url:'https://github.com/'+REPO+'/pull/244',submitter_login:'fixture-audit-submitter',submitter_id:'42',artifact:{path:'knowledge/results/patchgate/a2-probe-fixture-audit.md',blob_sha:createHash('sha1').update(Buffer.from('blob '+auditBytes.length+'\0')).update(auditBytes).digest('hex'),sha256:sha256(auditBytes)},body_base64:auditBytes.toString('base64'),fetched_at_utc:new Date(now).toISOString(),reviewed_source_commit:A,reviewed_bundle_sha256:H,reviewed_bundle_verification:'trusted_base_fixed_manifest',native_authorship_verified:false};
  config.external_stage_audits=[sign(3,{subject:rolloutSubject,role:'external_audit_readback',seat:'claude',channel:'repository_pr_readback',verdict:'approve',reviewed_source_commit:A,artifact_sha256:readback.artifact.sha256,audit_pr_number:244,audit_pr_head_sha:C,readback_sha256:sha256(canonical(readback)),native_authorship_verified:false,counts_toward_model_quorum:false})];
  const T='1'.repeat(40),U='2'.repeat(40),V='3'.repeat(40),D='d'.repeat(40);
  const state={refs:new Map(),merges:0,receipts:[],main:A,pr:{number:250,state:'open',draft:false,merged:false,base:{ref:'main',sha:A,repo:{full_name:REPO}},head:{sha:B,repo:{full_name:REPO}},author_association:'OWNER',mergeable:true,mergeable_state:'clean'},
   commits:{[A]:{sha:A,tree:{sha:T},parents:[]},[B]:{sha:B,tree:{sha:U},parents:[{sha:A}]},[C]:{sha:C,tree:{sha:V},parents:[{sha:A},{sha:B}]}},
   trees:{[T]:[],[U]:[{path:'docs/probe-only.md',mode:'100644',type:'blob',sha:D}],[V]:[{path:'docs/probe-only.md',mode:'100644',type:'blob',sha:D}]}};
  const api=async(method,url,body)=>{
   validateA2Request(method,url,body);
   if(method==='GET'&&url===ROOT+'/pulls/250')return {status:200,data:structuredClone(state.pr)};
   if(method==='GET'&&url===ROOT+'/git/ref/heads/main')return {status:200,data:{ref:'refs/heads/main',object:{sha:state.main}}};
   if(method==='GET'&&url.startsWith(ROOT+'/git/commits/'))return {status:200,data:structuredClone(state.commits[url.split('/').at(-1)])};
   if(method==='GET'&&url.startsWith(ROOT+'/git/trees/')){const sha=url.split('/').at(-1).split('?')[0];return {status:200,data:{sha,truncated:false,tree:structuredClone(state.trees[sha])}};}
   if(method==='GET'&&url.startsWith(ROOT+'/compare/'))return {status:200,data:{base_commit:{sha:A},merge_base_commit:{sha:A},status:'ahead'}};
   if(method==='GET'&&url===ROOT+'/git/ref/heads/patchgate-a2-stop'){const ref='refs/heads/patchgate-a2-stop';return state.refs.has(ref)?{status:200,data:{ref,object:{sha:state.refs.get(ref)}}}:{status:404};}
   if(method==='DELETE'&&url===ROOT+'/git/refs/heads/patchgate-a2-stop'){state.refs.delete('refs/heads/patchgate-a2-stop');return {status:204};}
   if(method==='POST'&&url===ROOT+'/git/refs'){if(state.refs.has(body.ref))return {status:422};state.refs.set(body.ref,body.sha);return {status:201,data:{ref:body.ref,object:{sha:body.sha}}};}
   if(method==='GET'&&url.startsWith(ROOT+'/git/ref/heads/patchgate-a2-actions/')){const ref='refs/heads/'+url.split('/git/ref/heads/')[1];return state.refs.has(ref)?{status:200,data:{ref,object:{sha:state.refs.get(ref)}}}:{status:404};}
   if(method==='PUT'&&url===ROOT+'/pulls/250/merge'){state.merges++;if(body.sha!==state.pr.head.sha)return {status:409};Object.assign(state.pr,{merged:true,state:'closed',merge_commit_sha:C});state.main=C;return {status:200,data:{merged:true,sha:C}};}
   if(method==='PUT'&&url.includes('/contents/knowledge/results/patchgate/a2/')){state.receipts.push(JSON.parse(Buffer.from(body.content,'base64').toString()));return {status:201};}
   throw Error('probe_fixture_unhandled');
  };
  return {state,args:{api,config,registry,policy,trust,snapshot,attestations:[author,checks,review(1),review(2)],checkRuns,runnerSha:A,runtimeBundleSha256:H,externalAuditReadbacks:[readback],prNumber:250,runId:'12345',now}};
 }
 const cases=[];
 const run=async(name,probe)=>{try{await probe();cases.push({name,passed:true});}catch{cases.push({name,passed:false,error:'probe_assertion_failed_no_sensitive_exception'});}};
 await run('valid_policy_baseline',async()=>{const f=fixture();const r=await mergeDocsOnce(f.args);assert.equal(r.status,'merged_readback_verified');assert.equal(f.state.merges,1);});
 await run('forged_head',async()=>{const f=fixture(),base=f.args.api,api=async(m,u,b)=>{const r=await base(m,u,b);if(m==='POST')f.state.pr.head.sha=C;return r;};const r=await mergeDocsOnce({...f.args,api});assert.equal(r.status,'merge_failed');assert.equal(f.state.merges,0);});
 await run('same_key_concurrency',async()=>{const f=fixture(),r=await Promise.all([mergeDocsOnce(f.args),mergeDocsOnce(f.args)]);assert.equal(f.state.merges,1);assert.equal(r.filter(x=>x.status==='merged_readback_verified').length,1);assert.equal(r.filter(x=>['existing_claim_reconcile_no_repeat','A2_execution_stopped_reconcile_required'].includes(x.status)).length,1);});
 await run('receipt_injection',async()=>{const f=fixture();await mergeDocsOnce(f.args);assert.equal(f.state.receipts.length,1);const record={...f.state.receipts[0],financial_execution:true,paid:true,tx_hash:'injected'};let calls=0;const api=a2GithubApi({token:'fixture-not-real',fetchImpl:async()=>{calls++;throw Error('no request');}}),key=sha256(TASK+':'+B+':merge');await assert.rejects(api('PUT',ROOT+'/contents/knowledge/results/patchgate/a2/'+key+'.json',{branch:'patchgate-a2-actions/'+key,message:'A2 action outcome; reconcile before retry',content:Buffer.from(JSON.stringify(record)).toString('base64')}));assert.equal(calls,0);});
 await run('422_without_ref',async()=>{const f=fixture(),base=f.args.api,api=async(m,u,b)=>m==='POST'?{status:422}:base(m,u,b);await assert.rejects(mergeDocsOnce({...f.args,api}),/422_without_existing_ref/);assert.equal(f.state.merges,0);});
 cases.push(...await runCollectorProbes({candidateRoot}));
 return {schema:'ltzzz.patchgate.candidate-probes.v1',task_id:TASK,candidate_head:actual,source_main_sha:control.source_commit,run_id:control.run_id,at_utc:new Date().toISOString(),shell_execution_provider:process.env.GITHUB_ACTIONS==='true'?'github_actions':'local_fixture',
  harness_source:'trusted_main_artifact',scope:'unprivileged_adversarial_fixtures_not_production_signed_checks',cases,coverage:Object.fromEntries(cases.map(x=>[x.name,x.passed])),tests_passed:cases.filter(x=>x.passed).length,tests_failed:cases.filter(x=>!x.passed).length,passed:cases.every(x=>x.passed),automatic_merge:false,financial_execution:false,paid:false,tx_hash:null};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const control=JSON.parse(fs.readFileSync(process.env.A2_PROBE_CONTROL)),root=process.cwd(),out=process.env.A2_PROBE_OUTPUT;
 let result;try{result=await runCandidateProbes({candidateRoot:root,control});}catch{result={schema:'ltzzz.patchgate.candidate-probes.v1',task_id:'PLAN-PATCHGATE-ESCROW-20261023',candidate_head:control.card.candidate_head,source_main_sha:control.source_commit,run_id:control.run_id,at_utc:new Date().toISOString(),shell_execution_provider:'github_actions',scope:'probe_setup_failed',cases:[],coverage:{},tests_passed:0,tests_failed:1,passed:false,automatic_merge:false,financial_execution:false,paid:false,tx_hash:null,error:'candidate_probe_setup_failed_no_sensitive_exception'};}
 fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({candidate_head:result.candidate_head,passed:result.passed,tests_passed:result.tests_passed,tests_failed:result.tests_failed}));
}
