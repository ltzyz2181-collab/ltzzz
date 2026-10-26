// Trusted-main fixture harness. Invoked only in the no-Secrets candidate job.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const COLLECTOR_PROBE_CASES=Object.freeze(['collector_baseline','collector_old_event','collector_forged_marker','collector_workflow_id','collector_cross_run_job','collector_attempt_swap','collector_app_suite','collector_stale_clock','collector_changed_checker','collector_unregistered','collector_duplicate_check','collector_base_drift','collector_forged_checks_digest','collector_observation_no_admission']);
export async function runCollectorProbes({candidateRoot}){
  const target=await import(pathToFileURL(path.join(candidateRoot,'scripts/lib/patchgate-a2-collector.mjs')).href);
  const {collectTrustedChecks,collectA2Readiness,signCollectedChecks,validateCollectorEndpoint,BASE_CHECK_WORKFLOW}=target;
  const A='a'.repeat(40),B='b'.repeat(40),C='c'.repeat(40),REPO='ltzyz2181-collab/ltzzz',ROOT='/repos/'+REPO,now=Date.now();
  const bytes=fs.readFileSync(path.join(candidateRoot,BASE_CHECK_WORKFLOW)),sha=x=>createHash('sha256').update(x).digest('hex');
  const content=data=>({status:200,data:{path:BASE_CHECK_WORKFLOW,type:'file',size:data.length,encoding:'base64',content:data.toString('base64'),sha:createHash('sha1').update(Buffer.from('blob '+data.length+'\0')).update(data).digest('hex')}});
  const request={schema:'ltzzz.patchgate.a2-collection-request.v1',task_id:'PLAN-PATCHGATE-ESCROW-20261023',candidate_pr:250,candidate_head:B,audit_pr:247,audit_path:'knowledge/results/patchgate/probe.md'};
  const authority={workflow_path:BASE_CHECK_WORKFLOW,workflow_id:100,app_id:15368,job_name:'patchgate-a2-base-checks',workflow_sha256:sha(bytes)};
  function fixture(){
    const state={requests:[],pr:{number:250,state:'open',merged:false,head:{sha:B,repo:{full_name:REPO}},base:{ref:'main',sha:A,repo:{full_name:REPO}},author_association:'OWNER'},main:A,
      check:{id:11,name:authority.job_name,head_sha:B,status:'completed',conclusion:'success',completed_at:new Date(now).toISOString(),app:{id:15368},details_url:'https://github.com/'+REPO+'/actions/runs/10/job/11',check_suite:{id:22}},
      run:{id:10,workflow_id:100,path:BASE_CHECK_WORKFLOW,event:'pull_request_target',repository:{full_name:REPO},head_repository:{full_name:REPO},head_sha:B,check_suite_id:22,status:'completed',conclusion:'success',run_attempt:1,pull_requests:[{number:250,head:{sha:B},base:{sha:A}}]},
      job:{id:11,run_id:10,run_attempt:1,head_sha:B,name:authority.job_name,status:'completed',conclusion:'success',steps:[{name:'EVENT=pull_request_target BASE='+A+' HEAD='+B+' PR=250',status:'completed',conclusion:'success'}]}};
    const api=async endpoint=>{
      validateCollectorEndpoint(endpoint);state.requests.push(endpoint);
      if(endpoint===ROOT+'/pulls/250')return {status:200,data:structuredClone(state.pr)};
      if(endpoint===ROOT+'/pulls/247')return {status:404,data:null};
      if(endpoint===ROOT+'/branches/main/protection')return {status:403,data:null};
      if(endpoint===ROOT+'/commits/'+B+'/check-runs?filter=latest&per_page=100&page=1')return {status:200,data:{check_runs:state.duplicate?[state.check,structuredClone(state.check)]:[structuredClone(state.check)]}};
      if(endpoint===ROOT+'/actions/runs/10')return {status:200,data:structuredClone(state.run)};
      if(endpoint===ROOT+'/actions/jobs/11')return {status:200,data:structuredClone(state.job)};
      if(endpoint===ROOT+'/git/ref/heads/main')return {status:200,data:{ref:'refs/heads/main',object:{sha:state.main}}};
      if(endpoint===ROOT+'/contents/'+BASE_CHECK_WORKFLOW+'?ref='+A)return content(bytes);
      if(endpoint===ROOT+'/contents/'+BASE_CHECK_WORKFLOW+'?ref='+B)return content(state.changedChecker?Buffer.concat([bytes,Buffer.from('\n# changed by candidate\n')]):bytes);
      throw Error('collector_probe_unexpected_GET');
    };
    return {state,api,args:{api,request,baseSha:A,authority,now}};
  }
  const cases=[];
  const run=async(name,fn)=>{try{await fn();cases.push({name,passed:true});}catch{cases.push({name,passed:false,error:'collector_probe_assertion_failed'});}};
  await run('collector_baseline',async()=>{const f=fixture(),r=await collectTrustedChecks(f.args);assert.equal(r.passed,true);assert.equal(r.diagnostic_only,true);assert.equal(r.status,'trusted_base_check_observed_unsigned');});
  for(const [name,mutate] of [
    ['collector_old_event',s=>s.run.event='pull_request'],
    ['collector_forged_marker',s=>s.job.steps[0].name='EVENT=pull_request_target BASE='+C+' HEAD='+B+' PR=250'],
    ['collector_workflow_id',s=>s.run.workflow_id++],
    ['collector_cross_run_job',s=>s.job.run_id++],
    ['collector_attempt_swap',s=>s.job.run_attempt++],
    ['collector_app_suite',s=>s.run.check_suite_id++],
    ['collector_stale_clock',s=>s.check.completed_at=new Date(now-172800000).toISOString()],
    ['collector_changed_checker',s=>s.changedChecker=true],
    ['collector_base_drift',s=>s.main=C]
  ])await run(name,async()=>{const f=fixture();mutate(f.state);await assert.rejects(collectTrustedChecks(f.args));});
  await run('collector_unregistered',async()=>{const f=fixture(),r=await collectTrustedChecks({...f.args,authority:null});assert.equal(r.passed,false);assert.equal(f.state.requests.some(x=>x.includes('/check-runs')),false);});
  await run('collector_duplicate_check',async()=>{const f=fixture();f.state.duplicate=true;assert.equal((await collectTrustedChecks(f.args)).passed,false);});
  await run('collector_forged_checks_digest',async()=>{assert.throws(()=>signCollectedChecks({collection:{passed:true,checker_base_sha:A,checks_sha256:'0'.repeat(64),check_runs:[]},subject:{base_sha:A,head_sha:B}}));});
  await run('collector_observation_no_admission',async()=>{const f=fixture(),r=await collectA2Readiness({...f.args,authority:null});assert.equal(r.status,'observation_only_not_A2_admission');assert.equal(r.signed,false);assert.equal(r.automatic_merge,false);assert.equal(r.financial_execution,false);assert.equal(r.native_model_calls,0);});
  assert.deepEqual(cases.map(c=>c.name).sort(),[...COLLECTOR_PROBE_CASES].sort());
  return cases;
}
