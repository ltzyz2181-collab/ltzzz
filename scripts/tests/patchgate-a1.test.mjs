import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {collectSnapshot} from '../patchgate.mjs';
import {observerContext,candidateIdentity,reserveObservation,publishObservation,observe,githubApi} from '../patchgate-observe.mjs';
import {sha256} from '../lib/patchgate.mjs';
const A='a'.repeat(40),B='b'.repeat(40),REPO='ltzyz2181-collab/ltzzz';
const identity={task_id:'PLAN-PATCHGATE-ESCROW-20261023',head_sha:B,pr_number:225};
const pr={number:225,base:{ref:'main',repo:{full_name:REPO}},head:{sha:B},body:'```json\n{"task_id":"PLAN-PATCHGATE-ESCROW-20261023"}\n```'};
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
 } finally {process.chdir(before);fs.rmSync(root,{recursive:true,force:true});}
});
