import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const ORIGIN='https://ltzzz-kimi-queue.ltzyz2181.workers.dev';
const REVISION='kimi-readonly-observer-v1';
export async function probeKimiReadonly({token,expectedSourceCommit=null,fetcher=fetch}){
 if(!token)throw Error('existing_service_identity_required');
 const evidence={origin:ORIGIN,expected_source_commit:expectedSourceCommit,checks:[],model_calls:0,reserve_calls:0,release_calls:0,transactions:0,paid:false,tx_hash:null,long_generation_verified:false};
 async function get(route,credential){try{const r=await fetcher(ORIGIN+route,{method:'GET',redirect:'error',headers:credential?{Authorization:'Bearer '+credential}:{},signal:AbortSignal.timeout(20000)});return {http:r.status,body:await r.json()};}catch{return {http:null,body:{error:'transport_or_decode_unverified'}};}}
 const h=await get('/health');evidence.health=h;
 for(const route of ['/auth/check','/leases/count'])for(const [kind,credential,expected] of [['anonymous',null,401],['wrong','invalid-readonly-probe-token',401],['valid',token,200]]){
  const r=await get(route,credential);
  const body=route==='/leases/count'&&kind==='valid'?Object.fromEntries(['ok','observer_revision','source_commit','read_only','at_utc','active','expired','invalid','records_observed','historical_totals_available','reserved_total','released_total','model_calls'].map(k=>[k,r.body?.[k]??null])):Object.fromEntries(['ok','authenticated','observer_revision','source_commit','read_only','model_calls','error'].filter(k=>Object.hasOwn(r.body||{},k)).map(k=>[k,r.body[k]]));
  const pass=r.http===expected&&(kind!=='valid'||body.ok===true&&body.read_only===true&&body.model_calls===0&&body.observer_revision===REVISION&&body.source_commit===h.body?.source_commit);
  evidence.checks.push({route,kind,http:r.http,body,passed:pass});
 }
 const counts=evidence.checks.find(c=>c.route==='/leases/count'&&c.kind==='valid').body;
 evidence.verified=h.http===200&&h.body?.observer_revision===REVISION&&h.body?.model_calls===0&&/^[a-f0-9]{40}$/.test(h.body?.source_commit||'')&&(!expectedSourceCommit||h.body.source_commit===expectedSourceCommit)&&evidence.checks.every(c=>c.passed)&&['active','expired','invalid','records_observed'].every(k=>Number.isSafeInteger(counts[k])&&counts[k]>=0)&&counts.records_observed===counts.active+counts.expired+counts.invalid&&counts.historical_totals_available===false;
 evidence.status=evidence.verified?'readonly_reachability_auth_and_snapshot_verified':'readonly_probe_blocked';return evidence;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const e=process.env;if(e.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||e.GITHUB_REF!=='refs/heads/main'||!['workflow_run','workflow_dispatch'].includes(e.GITHUB_EVENT_NAME)||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('trusted_main_probe_required');
 let expectedSourceCommit=null;
 if(e.GITHUB_EVENT_NAME==='workflow_run'){
  const event=JSON.parse(fs.readFileSync(e.GITHUB_EVENT_PATH)),r=event.workflow_run;
  if(event.action!=='completed'||r?.name!=='Deploy authenticated Kimi leases (provider limits only)'||r.conclusion!=='success'||r.head_repository?.full_name!==e.GITHUB_REPOSITORY||r.head_branch!=='main'||!['push','workflow_dispatch'].includes(r.event)||!/^[a-f0-9]{40}$/.test(r.head_sha||''))throw Error('trusted_queue_deployment_event_required');
  expectedSourceCommit=r.head_sha;
 }
 const result={task_id:'DEEP-SUPERAGENT-20261103',step_id:'KIMI-LEASE-READBACK-20261105',run_id:e.GITHUB_RUN_ID,run_attempt:e.GITHUB_RUN_ATTEMPT,source_commit:e.GITHUB_SHA,at_utc:new Date().toISOString(),...await probeKimiReadonly({token:e.LTZZZ_AGENT_TOKEN,expectedSourceCommit})};
 fs.mkdirSync('knowledge/results/deep-superagent',{recursive:true});const file=`knowledge/results/deep-superagent/kimi-readonly-${e.GITHUB_RUN_ID}-attempt-${e.GITHUB_RUN_ATTEMPT}.json`;fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({status:result.status,receipt:file,model_calls:0}));if(!result.verified)process.exitCode=1;
}
