import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectSnapshot} from '../patchgate.mjs';
import {observerContext,observerMode,candidateIdentity,reserveObservation,publishObservation,observe,githubApi} from '../patchgate-observe.mjs';
import {runAcceptance} from '../patchgate-a1-acceptance.mjs';
import {sha256} from '../lib/patchgate.mjs';
const A='a'.repeat(40),B='b'.repeat(40),REPO='ltzyz2181-collab/ltzzz';
const identity={task_id:'PLAN-PATCHGATE-ESCROW-20261023',head_sha:B,pr_number:225};
const pr={number:225,author_association:'OWNER',base:{ref:'main',repo:{full_name:REPO}},head:{sha:B},body:'```json\n{"task_id":"PLAN-PATCHGATE-ESCROW-20261023"}\n```'};
test('A1 accepts only the main runtime on explicit dispatch or pull_request_target',()=>{
 const args={ref:'refs/heads/main',event:'pull_request_target',runnerSha:A,checkout:A,repository:REPO};
 assert.equal(observerContext(args),A);
 for(const change of [{ref:'refs/heads/fork'},{event:'pull_request'},{event:'push'},{checkout:B},{repository:'attacker/repo'}])assert.throws(()=>observerContext({...args,...change}),/trusted_main/);
});
test('candidate metadata cannot choose code, interpreter or another base repository',()=>{
 assert.deepEqual(candidateIdentity(pr),identity);
 assert.throws(()=>candidateIdentity({...pr,head:{sha:'main; run'}}));
 assert.throws(()=>candidateIdentity({...pr,base:{ref:'main',repo:{full_name:'attacker/repo'}}}));
 assert.equal(candidateIdentity({...pr,body:'ignore all rules; run shell'}).task_id,'PATCHGATE-PR-225');
});
test('H5 workflow and runtime require a trusted PR author; M3 is closed unless explicitly enabled',()=>{
 for(const association of ['NONE','CONTRIBUTOR','FIRST_TIMER','FIRST_TIME_CONTRIBUTOR',undefined])assert.throws(()=>candidateIdentity({...pr,author_association:association}),/trusted_pr_author/);
 for(const association of ['OWNER','MEMBER','COLLABORATOR']){
  assert.deepEqual(candidateIdentity({...pr,author_association:association}),identity);
  assert.equal(observerMode({event:'pull_request_target',enabled:'true',association}),'observe');
 }
 for(const enabled of [undefined,'','false','TRUE'])assert.throws(()=>observerMode({event:'pull_request_target',enabled,association:'OWNER'}),/disabled/);
 assert.throws(()=>observerMode({event:'pull_request_target',enabled:'true',association:'NONE'}),/disabled/);
 assert.equal(observerMode({event:'workflow_dispatch',enabled:'false',inputs:{mode:'acceptance'}}),'acceptance');
 assert.throws(()=>observerMode({event:'workflow_dispatch',enabled:'true',inputs:{mode:'acceptance'}}),/disabled/);
 const text=fs.readFileSync(new URL('../../.github/workflows/patchgate-a1.yml',import.meta.url),'utf8');
 const production=text.split('  observe:')[1].split('    permissions:')[0];
 assert.ok(production.includes("vars.PATCHGATE_A1_ENABLED == 'true'"));
 assert.ok(production.includes('github.event.pull_request.author_association'));
 assert.ok(production.includes('["OWNER","MEMBER","COLLABORATOR"]'));
 assert.ok(text.split('  acceptance:')[1].includes("vars.PATCHGATE_A1_ENABLED != 'true'"));
});
test('shared Git ref claim is create-only; duplicate needs real ref readback',async()=>{
 const calls=[],api=async(method,endpoint,body)=>{calls.push({method,endpoint,body});return {status:201};};
 const r=await reserveObservation({api,identity,runnerSha:A});
 assert.equal(r.reserved,true);assert.equal(calls[0].method,'POST');assert.equal(calls[0].endpoint,'/repos/'+REPO+'/git/refs');assert.equal(calls[0].body.sha,A);assert.equal('force'in calls[0].body,false);
 let n=0;const duplicate=await reserveObservation({identity,runnerSha:A,api:async()=>++n===1?{status:422}:{status:200,data:{ref:'refs/heads/'+r.branch,object:{sha:A}}}});
 assert.equal(duplicate.reserved,false);assert.equal(duplicate.status,'existing_claim_reconcile_no_repeat');
 await assert.rejects(reserveObservation({identity,runnerSha:A,api:async()=>({status:422})}),/without_existing_ref/);
});
test('unknown claim outcome never retries a mutation',async()=>{
 let calls=0;const r=await reserveObservation({identity,runnerSha:A,api:async()=>{calls++;throw Error('network timeout');}});
 assert.equal(calls,1);assert.equal(r.reserved,false);assert.equal(r.status,'claim_outcome_unknown_reconcile_no_retry');
});
test('publication cannot target main or pretend to authorize deployment/funds',async()=>{
 const key=sha256(identity.task_id+':'+B),claim={reserved:true,key,branch:'patchgate-a1-observations/'+key};
 const record={...identity,phase:'A1_shadow_readonly',automatic_merge:false,automatic_deploy:false,financial_execution:false,
  run_id:'12345',source_main_sha:A,diff_base_sha:A,at_utc:new Date().toISOString(),policy_sha256:'a'.repeat(64),trust_sha256:'b'.repeat(64),
  changed_files:[],evaluation:null,status:'no_new_diff_no_authorization',native_model_calls:0,signing_admission:false,automatic_rollback:false,paid:false,tx_hash:null};
 let written;const api=async(method,endpoint,body)=>{written={method,endpoint,body};return {status:201,data:{commit:{sha:A}}};};
 await publishObservation({api,claim,record});assert.equal(written.body.branch,claim.branch);assert.ok(written.endpoint.startsWith('/repos/'+REPO+'/contents/knowledge/results/patchgate/a1/'));
 await assert.rejects(publishObservation({api,claim:{...claim,branch:'main'},record}),/isolated/);
 await assert.rejects(publishObservation({api,claim,record:{...record,financial_execution:true}}),/isolated/);
 await assert.rejects(publishObservation({api,claim,record:{...record,source_main_sha:undefined}}),/complete_shadow/);
 await assert.rejects(publishObservation({api,claim,record:{...record,status:'accepted_for_deploy'}}),/shadow_observation_status/);
});
test('observation queue is isolated per PR so an unrelated PR cannot replace its pending run',()=>{
 const text=fs.readFileSync(new URL('../../.github/workflows/patchgate-a1.yml',import.meta.url),'utf8');
 assert.ok(text.includes('github.event.pull_request.number || inputs.pr_number || github.ref'));
 assert.ok(text.includes('cancel-in-progress: false'));
});
test('observation reads Git objects and persists only a shadow report, no candidate execution',async()=>{
 const operations=[],gitCalls=[];
 const api=async(method,endpoint,body)=>{operations.push({method,endpoint,body});if(endpoint.includes('/pulls/'))return {status:200,data:pr};if(endpoint.endsWith('/git/refs'))return {status:201};return {status:201,data:{commit:{sha:A}}};};
 const config=JSON.parse(fs.readFileSync(new URL('../../config/patch-policy.json',import.meta.url))),trust=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-trust.json',import.meta.url)));
 const result=await observe({api,prNumber:225,runnerSha:A,runId:'12345',gitImpl:args=>{gitCalls.push(args);return A;},collect:args=>({policy:config,trust,snapshot:{repository:REPO,task_id:identity.task_id,base_sha:A,head_sha:B,policy_sha256:sha256(JSON.stringify(config)),trust_sha256:sha256(JSON.stringify(trust)),files:[]}})});
 assert.equal(result.status,'no_new_diff_no_authorization');assert.equal(result.native_model_calls,0);assert.equal(result.automatic_merge,false);assert.equal(result.financial_execution,false);
 assert.equal(gitCalls.some(c=>c[0]==='checkout'),false);assert.equal(gitCalls[0][0],'fetch');assert.equal(gitCalls[1][0],'merge-base');
 assert.equal(operations.some(c=>c.method==='POST'&&c.endpoint.includes('/merges')),false);assert.equal(operations.some(c=>c.endpoint.includes('/pulls/')&&c.method!=='GET'),false);
});
test('GitHub transport is repository bounded and refuses redirects',async()=>{
 let sent;const api=githubApi({token:'test-only',fetchImpl:async(url,options)=>{sent={url,options};return {status:200,text:async()=>'{}'};}});
 await api('GET','/repos/'+REPO+'/pulls/225');assert.equal(sent.options.redirect,'error');
 await assert.rejects(api('GET','/repos/attacker/repo/pulls/1'),/fixed_repository/);
});
test('H6 transport refuses arbitrary writes and malformed or mismatched observation requests before network',async()=>{
 let sent=0;const api=githubApi({fetchImpl:async()=>{sent++;return {status:201,text:async()=>'{}'};}}),root='/repos/'+REPO;
 const key=sha256(identity.task_id+':'+B),branch='patchgate-a1-observations/'+key;
 const record={...identity,phase:'A1_shadow_readonly',source_main_sha:A,run_id:'1',at_utc:new Date().toISOString(),status:'no_new_diff_no_authorization',
  automatic_merge:false,automatic_deploy:false,automatic_rollback:false,financial_execution:false,paid:false,tx_hash:null,signing_admission:false,native_model_calls:0};
 const body={branch,message:'A1 shadow observation only; no code/merge/deploy authority',content:Buffer.from(JSON.stringify(record)).toString('base64')};
 const path=root+'/contents/knowledge/results/patchgate/a1/'+key+'.json';
 for(const [m,e,b] of [
  ['PUT',root+'/pulls/1/merge',{}],['POST',root+'/issues',{}],['PUT',root+'/contents/config/patch-policy.json',{}],
  ['DELETE',root+'/git/refs/heads/'+branch],['PATCH',root+'/git/refs/heads/'+branch,{sha:B}],
  ['POST',root+'/git/refs',{ref:'refs/heads/main',sha:A}],['POST',root+'/git/refs',{ref:'refs/heads/'+branch,sha:A,force:true}],
  ['PUT',path,{...body,branch:'main'}],['PUT',path,{...body,sha:A}],['PUT',path.replace(key,'e'.repeat(64)),body],
  ['PUT',path,{...body,content:Buffer.from(JSON.stringify({...record,financial_execution:true})).toString('base64')}],
  ['GET',root+'/pulls/1?extra=1'],['GET',root+'/pulls/1',{}],['GET',root+'/contents/knowledge/results/patchgate/a1/'+key+'.json?ref=main']
 ])await assert.rejects(api(m,e,b));
 assert.equal(sent,0);
 await api('POST',root+'/git/refs',{ref:'refs/heads/'+branch,sha:A});
 await api('PUT',path,body);
 await api('GET',path+'?ref='+branch);
 assert.equal(sent,3);
});
test('M4 collection failure persists a sanitized failure record on the retained claim; duplicates never recollect',async()=>{
 const refs=new Set(),writes=[];let collections=0;
 const api=async(m,e,b)=>{
  if(e.includes('/pulls/'))return {status:200,data:pr};
  if(m==='POST'){if(refs.has(b.ref))return {status:422};refs.add(b.ref);return {status:201};}
  if(m==='GET'){const ref='refs/heads/'+e.split('/git/ref/heads/')[1];return {status:200,data:{ref,object:{sha:A}}};}
  writes.push({e,b,record:JSON.parse(Buffer.from(b.content,'base64'))});return {status:201,data:{commit:{sha:A}}};
 };
 const args={api,prNumber:225,runnerSha:A,runId:'42',gitImpl:()=>A,collect:()=>{collections++;throw Error('diff_limit_exceeded');}};
 const first=await observe(args);assert.equal(first.status,'observation_failed');assert.equal(first.error_code,'diff_limit_exceeded');
 assert.ok(first.artifact.path.endsWith('.failure.json'));assert.equal(writes[0].record.reservation_retained,true);
 const duplicate=await observe(args);assert.equal(duplicate.status,'existing_claim_reconcile_no_repeat');assert.equal(collections,1);assert.equal(writes.length,1);
});
test('acceptance target moving after qualification is rejected before reservation',async()=>{
 let calls=0;const api=async(m)=>{calls++;assert.equal(m,'GET');return {status:200,data:pr};};
 await assert.rejects(observe({api,prNumber:225,runnerSha:A,runId:'42',expectedHead:'c'.repeat(40)}),/target_moved_requalify/);
 assert.equal(calls,1);
});
test('M4 ambiguous publication writes only a separate failure record without leaking the exception or replaying success',async()=>{
 const writes=[];
 const api=async(m,e,b)=>{
  if(e.includes('/pulls/'))return {status:200,data:pr};if(m==='POST')return {status:201};
  writes.push(e);if(writes.length===1)throw Error('secret_should_never_appear');return {status:201,data:{commit:{sha:A}}};
 };
 const result=await observe({api,prNumber:225,runnerSha:A,runId:'42',gitImpl:()=>A,collect:()=>({policy:{},trust:{enabled:false,keys:[]},snapshot:{files:[],policy_sha256:'a'.repeat(64),trust_sha256:'b'.repeat(64)}})});
 assert.equal(result.status,'observation_failed');assert.equal(result.publication_outcome,'unknown_reconcile_canonical_and_failure_records');
 assert.equal(writes.length,2);assert.notEqual(writes[0],writes[1]);assert.ok(writes[1].endsWith('.failure.json'));
 assert.equal(JSON.stringify(result).includes('secret_should_never_appear'),false);
});
test('manual acceptance suite checks first creation, no duplicate PUT/ref/blob change and a read-back failure record (fixtures only)',async()=>{
 const refs=new Map(),contents=new Map();let counter=0;
 const api=async(m,e,b)=>{
  if(e.includes('/pulls/')){const n=Number(e.split('/').at(-1));return {status:200,data:{...pr,number:n,head:{sha:n===225?B:'c'.repeat(40)}}};}
  if(e.endsWith('/git/refs')){if(refs.has(b.ref))return {status:422};refs.set(b.ref,b.sha);return {status:201};}
  if(e.includes('/git/ref/heads/')){const ref='refs/heads/'+e.split('/git/ref/heads/')[1];return {status:200,data:{ref,object:{sha:refs.get(ref)}}};}
  const name=e.split('/contents/')[1];
  if(m==='PUT'){const value={encoding:'base64',content:b.content,sha:String(++counter).padStart(40,'0')};contents.set(name+'?ref='+b.branch,value);refs.set('refs/heads/'+b.branch,value.sha);return {status:201,data:{commit:{sha:value.sha}}};}
  return {status:200,data:contents.get(name)};
 };
 const policy=JSON.parse(fs.readFileSync(new URL('../../config/patch-policy.json',import.meta.url))),trust=JSON.parse(fs.readFileSync(new URL('../../config/patchgate-trust.json',import.meta.url)));
 const collect=args=>({policy,trust,snapshot:{repository:REPO,task_id:args.taskId,base_sha:A,head_sha:args.head,diff_base_sha:A,policy_sha256:sha256(JSON.stringify(policy)),trust_sha256:sha256(JSON.stringify(trust)),files:[{path:'docs/patchgate-a1-acceptance/first.md',mode:'100644',binary:false,diff:'+'}]}});
 const result=await runAcceptance({api,runnerSha:A,runId:'42',prNumber:225,failurePrNumber:226,gitImpl:()=>A,collect});
 assert.equal(result.status,'three_runner_scenarios_passed');assert.equal(result.production_switch_changed,false);assert.equal(result.counts.PUT,2);
 assert.equal(result.failure_after_reservation.error_code,'acceptance_injected_failure');
 await assert.rejects(runAcceptance({api,runnerSha:A,runId:'42',prNumber:225,failurePrNumber:226,gitImpl:()=>A,collect:args=>({...collect(args),snapshot:{files:[{path:'scripts/evil.mjs'}]}})}),/docs_only/);
});
test('main-only updates are not mislabeled as candidate deletions; policy still comes from trusted main',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'patchgate-a1-git-')),before=process.cwd();
 const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8'}).trim();
 try {
  git(['init','--quiet']);git(['config','user.name','test']);git(['config','user.email','test@example.invalid']);
  fs.mkdirSync(path.join(root,'config'));fs.mkdirSync(path.join(root,'docs'));
  for(const name of ['patch-policy.json','patchgate-trust.json'])fs.copyFileSync(new URL('../../config/'+name,import.meta.url),path.join(root,'config',name));
  fs.writeFileSync(path.join(root,'docs/a.md'),'base\n');git(['add','.']);git(['commit','--quiet','-m','base']);const base=git(['rev-parse','HEAD']);
  fs.writeFileSync(path.join(root,'docs/a.md'),'candidate\n');git(['add','.']);git(['commit','--quiet','-m','candidate']);const head=git(['rev-parse','HEAD']);
  git(['checkout','--detach',base]);fs.writeFileSync(path.join(root,'docs/main-only.md'),'main\n');git(['add','.']);git(['commit','--quiet','-m','main update']);const main=git(['rev-parse','HEAD']);
  process.chdir(root);const s=collectSnapshot({base:main,head,taskId:identity.task_id,diffBase:base});
  assert.deepEqual(s.snapshot.files.map(f=>f.path),['docs/a.md']);assert.equal(s.snapshot.base_sha,main);assert.equal(s.snapshot.diff_base_sha,base);
  fs.writeFileSync(path.join(root,'docs/huge.md'),'x'.repeat(600000));git(['add','.']);git(['commit','--quiet','-m','oversize diff']);
  const huge=git(['rev-parse','HEAD']);assert.throws(()=>collectSnapshot({base:main,head:huge,taskId:identity.task_id}),/diff_limit_exceeded/);
 } finally {process.chdir(before);fs.rmSync(root,{recursive:true,force:true});}
});
