import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {createHash,createHmac} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const REPO='ltzyz2181-collab/ltzzz';
const WEP3='https://ltzzz-wep3.ltzyz2181.workers.dev';
const TREASURY='https://ltzzz-treasury-v11.ltzyz2181.workers.dev';
const sha=value=>createHash('sha256').update(value).digest('hex');
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const routes=[
 ['book_before',WEP3,'/market/runtime-state',true],
 ['wep3_health',WEP3,'/health',false],
 ['market_treasury',WEP3,'/market/treasury',false],
 ['aave_status',WEP3,'/market/aave/status',false],
 ['treasury_health',TREASURY,'/health',false],
 ['treasury_dashboard',TREASURY,'/dashboard',false],
 ['book_after',WEP3,'/market/runtime-state',true]
];

// Fixed GET routes only. The managed runner identity is never sent to Treasury.
// No model, signer, payment, preview or state-changing endpoint is callable here.
export async function observeServiceContinuity({runnerToken,fetcher=fetch,clock=()=>new Date().toISOString()}){
 if(!runnerToken)throw Error('managed_readonly_identity_required');
 const observations=[];
 for(const [id,origin,route,authenticated] of routes){
  const row={id,origin,path:route,observed_at_utc:clock(),http:null,json_object:false,summary:{}};
  try{
   const response=await fetcher(origin+route,{method:'GET',redirect:'error',headers:authenticated?{'X-Lab-Pin':runnerToken}:{},signal:AbortSignal.timeout(20000)});
   row.http=response.status;
   const text=await response.text();row.response_sha256=sha(text);
   if(Buffer.byteLength(text)>128000)throw Error('bounded_response_required');
   const body=JSON.parse(text);row.json_object=object(body);
   if(row.json_object){
    for(const key of ['ok','controlled','atomic_ledger_ready','legacy_writes_enabled'])if(typeof body[key]==='boolean')row.summary[key]=body[key];
    if(Number.isSafeInteger(body.chain_id))row.summary.chain_id=body.chain_id;
    if(/^[a-f0-9]{40}$/.test(body.source_commit||''))row.summary.source_commit=body.source_commit;
    if(authenticated&&/^[a-f0-9]{64}$/.test(body.book_sha256||''))row.summary.book_sha256=body.book_sha256;
    if(id==='treasury_dashboard'){row.summary.counts_container_valid=object(body.counts);row.summary.agents_container_valid=object(body.agents);}
   }
  }catch{row.error='transport_or_decode_unverified';}
  row.readable=row.http===200&&row.json_object&&row.summary.ok===true;
  observations.push(row);
 }
 const before=observations[0].summary.book_sha256,after=observations.at(-1).summary.book_sha256;
 const financial_book_unchanged=Boolean(before&&after&&before===after);
 const verified=observations.every(row=>row.readable)&&financial_book_unchanged;
 return {schema:'ltzzz.service-continuity.observation.v1',task_id:'DEEP-SUPERAGENT-20261103',step_id:'SERVICE-REACHABILITY-READONLY-20261106',goal_id:'GOAL-LTZZZ-AUTONOMY-20261105',status:verified?'read_only_service_observation_verified':before&&after&&before!==after?'book_change_requires_reconciliation':'service_observation_blocked',observations,financial_book_unchanged,verified,scope:'HTTP/JSON observations and book comparison only; controlled=false is not proof of key loss. No model generation, settlement, mailbox, subscription entitlement or full unattended acceptance is inferred.',membership_dependency:'No ChatGPT/OpenAI/Anthropic account or API credential used by this observer; GitHub runner, service identity and target availability remain dependencies.',model_api_calls:0,transactions:0,signing_attempts:0,paid:false,tx_hash:null,ChatGPT_subscription_verified:false,full_unattended_goal_verified:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const e=process.env;
 if(e.GITHUB_REPOSITORY!==REPO||e.GITHUB_REF!=='refs/heads/main'||!['push','workflow_dispatch','workflow_run'].includes(e.GITHUB_EVENT_NAME)||!/^[a-f0-9]{40}$/.test(e.GITHUB_SHA||'')||!/^\d+$/.test(e.GITHUB_RUN_ID||'')||!/^\d+$/.test(e.GITHUB_RUN_ATTEMPT||'')||execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()!==e.GITHUB_SHA)throw Error('trusted_main_continuity_probe_required');
 if(e.GITHUB_EVENT_NAME==='workflow_run'){
  const event=JSON.parse(fs.readFileSync(e.GITHUB_EVENT_PATH)),r=event.workflow_run;
  if(event.action!=='completed'||r?.name!=='Key Liveness Probe (AI seats)'||r.conclusion!=='success'||r.head_repository?.full_name!==REPO||r.head_branch!=='main'||['pull_request','pull_request_target'].includes(r.event))throw Error('trusted_liveness_event_required');
 }
 let result;
 try{
  if(!e.CLOUDFLARE_API_TOKEN)throw Error('managed_readonly_identity_required');
  const runnerToken=createHmac('sha256',e.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex');
  result=await observeServiceContinuity({runnerToken});
 }catch{result={schema:'ltzzz.service-continuity.observation.v1',task_id:'DEEP-SUPERAGENT-20261103',goal_id:'GOAL-LTZZZ-AUTONOMY-20261105',status:'service_observation_blocked',error:'managed_observation_not_verified',verified:false,model_api_calls:0,transactions:0,signing_attempts:0,paid:false,tx_hash:null};}
 Object.assign(result,{run_id:e.GITHUB_RUN_ID,run_attempt:e.GITHUB_RUN_ATTEMPT,source_commit:e.GITHUB_SHA,at_utc:new Date().toISOString()});
 const file=`knowledge/results/deep-superagent/service-continuity-${e.GITHUB_RUN_ID}-attempt-${e.GITHUB_RUN_ATTEMPT}.json`;
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(result,null,2)+'\n');
 console.log(JSON.stringify({status:result.status,receipt:file,model_api_calls:0,transactions:0}));
 if(!result.verified)process.exitCode=1;
}
