// One owner-requested repair test of public input. No retry of the old 524 job.
import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';import {createHash} from 'node:crypto';import {fileURLToPath} from 'node:url';
import {DeepQueueLatchStore,redactKnownSecrets} from './run-deep-superagent-queue.mjs';
import {KIMI_PROFILE} from '../lib/kimi-profile.js';
const REPO='ltzyz2181-collab/ltzzz',ORIGIN='https://api-kimi.ltzzz.com',MARKER='KIMI_POSTFIX_20261104_OK';
const hash=v=>createHash('sha256').update(v).digest('hex');
export const probeSucceeded=r=>r.status==='native_generation_and_marker_verified'||r.status==='existing_probe_result_reused'&&r.previous_result?.status==='native_generation_and_marker_verified';
export function normalizeProbe(c){
 const keys=['task_id','package_id','probe_id','repair_source_commit'];
 if(!c||Object.keys(c).some(k=>!keys.includes(k))||c.task_id!=='DEEP-SUPERAGENT-20261103-DEPLOY-E2E-20261104'||c.package_id!=='DEPLOY-CANARY-CAPABILITIES-01'||c.probe_id!=='KIMI-POSTFIX-20261104-01'||!/^[a-f0-9]{40}$/.test(c.repair_source_commit||''))throw Error('invalid_fixed_Kimi_repair_probe');
 return Object.fromEntries(keys.map(k=>[k,c[k]]));
}
export async function runProbe({card,token,store,fetcher=fetch,clock=Date.now,run_id='test',source_commit}){
 card=normalizeProbe(card);if(!token)throw Error('existing_service_token_required');
 const body=JSON.stringify({task_id:card.task_id,model:'auto',messages:[{role:'user',content:'仅输出一行：'+MARKER+'。不要解释，不调用工具。此为自有公开输入的连通性测试，不代表任何部署、业务接受或付款。'}],max_tokens:KIMI_PROFILE.default_output_tokens});
 const key=hash(JSON.stringify(['kimi_postfix_probe',card.task_id,card.package_id,card.probe_id])),payload=hash(JSON.stringify([card,body]));
 const report={schema:'ltzzz.kimi.postfix-probe.v1',...card,source_commit,run_id,at_utc:new Date(clock()).toISOString(),status:'preflight',request_sha256:hash(body),attempt_key:key,new_model_calls:0,old_524_request_repeated:false,accepted:false,financial_execution:false,transactions:0,paid:false,tx_hash:null,api_bill_verified:false};
 const previous=await store.read(key);
 if(previous){if(previous.state.payload_sha256!==payload)throw Error('probe_reservation_payload_conflict');return {...report,status:previous.state.result?'existing_probe_result_reused':'existing_probe_reserved_reconcile_only',previous_result:previous.state.result||null};}
 const get=async(route,credential)=>{const r=await fetcher(ORIGIN+route,{headers:credential?{Authorization:'Bearer '+credential}:{},redirect:'error',signal:AbortSignal.timeout(25000)});return {http:r.status,data:await r.json()};};
 try{
  const health=await get('/health');const h=health.data;
  report.health={http:health.http,configured_model:h.configured_model??null,model_override_configured:h.model_override_configured??null,source_commit:h.source_commit??null,kimi_model_resolution_revision:h.kimi_model_resolution_revision??null,generation_verified:h.generation_verified??null};
  if(health.http!==200||h.source_commit!==card.repair_source_commit||h.kimi_model_resolution_revision!=='kimi-model-override-v1'||h.configured_model!=='kimi-k3'||h.model_override_configured!==true||h.generation_verified!==false||h.auth_required!==true||h.auth_configured!==true)throw Error('fixed_runtime_configuration_not_verified');
  report.auth_checks=[];
  for(const [kind,credential] of [['anonymous',null],['wrong','deliberately-invalid-probe-token'],['valid',token]]){
   const a=await get('/auth/check',credential);report.auth_checks.push({kind,http:a.http,authenticated:a.data.authenticated===true,model_calls:a.data.model_calls??null});
   if(a.http!==(kind==='valid'?200:401)||a.data.model_calls!==0||kind==='valid'&&a.data.authenticated!==true)throw Error('existing_auth_gate_not_verified');
  }
  const c=await get('/catalogue',token);report.catalogue={http:c.http,selected_model:c.data.selected_model??null,model_calls:c.data.model_calls??null};
  if(c.http!==200||c.data.ok!==true||c.data.selected_model!==h.configured_model||c.data.model_calls!==0)throw Error('authenticated_runtime_catalogue_not_verified');
 }catch(e){report.status='preflight_blocked_zero_generation';report.error=/^[a-z_]{1,100}$/.test(e.message||'')?e.message:'preflight_transport_or_decode_failed';return report;}
 if(!await store.compareAndSwap(key,null,{status:'reserved_no_provider_retry',task_id:card.task_id,package_id:card.package_id,probe_id:card.probe_id,payload_sha256:payload,run_id}))return {...report,status:'concurrent_probe_reservation_reconcile_only'};
 const reserved=await store.read(key);if(!reserved||reserved.state.payload_sha256!==payload)throw Error('probe_reservation_readback_required');
 report.new_model_calls=1;report.requested_model='auto_uses_verified_fixed_variable';report.max_tokens=KIMI_PROFILE.default_output_tokens;
 const started=clock();
 try{
  const r=await fetcher(ORIGIN+'/',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body,redirect:'error',signal:AbortSignal.timeout(180000)}),raw=await r.text();
  report.elapsed_ms=clock()-started;report.http=r.status;report.response_sha256=hash(raw);
  const d=JSON.parse(raw),m=d.ltzzz_receipt,output=d.choices?.[0]?.message?.content;
  if(m)report.native_receipt=Object.fromEntries(['schema_version','receipt_source','executed_by','requested_model','actual_model','model_source','task_id','request_id','provider_response_id','upstream_request_id','upstream_request_id_source','started_at','completed_at','upstream_http','generation_verified','finish_reason','tokens_used','reasoning_tokens','completion_tokens'].map(k=>[k,m[k]??null]));
  if(!r.ok||m?.executed_by!=='kimi'||m.task_id!==card.task_id||m.requested_model!=='kimi-k3'||m.actual_model!=='kimi-k3'||m.model_source!=='provider_response'||m.generation_verified!==true||!m.request_id||!(m.provider_response_id||m.upstream_request_id)||m.finish_reason!=='stop'||typeof output!=='string'||!output.trim())throw Error('native_Kimi_generation_not_verified');
  report.actual_provider='moonshot';report.actual_model=m.actual_model;report.output=output;report.output_sha256=hash(output);report.marker_verified=output.trim()===MARKER;
  report.status=report.marker_verified?'native_generation_and_marker_verified':'native_generation_verified_marker_rejected';
 }catch(e){report.elapsed_ms=clock()-started;report.status='generation_failed_or_uncertain_no_retry';report.error=/^[a-zA-Z_]{1,100}$/.test(e.message||'')?e.message:'provider_transport_or_decode_unknown';}
 const safe=redactKnownSecrets(report,[token]);
 try{report.result_latch_written=await store.compareAndSwap(key,reserved,{...reserved.state,status:safe.status,result:safe});}catch{report.result_latch_written=false;}
 return redactKnownSecrets(report,[token]);
}
export async function main(env=process.env){
 if(env.GITHUB_REPOSITORY!==REPO||env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_EVENT_NAME!=='push'||!/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')||!env.GITHUB_TOKEN||!env.LTZZZ_AGENT_TOKEN)throw Error('trusted_main_probe_required');
 const git=args=>execFileSync('git',args,{encoding:'utf8',maxBuffer:2000000}).trim();
 const before=JSON.parse(fs.readFileSync(env.GITHUB_EVENT_PATH)).before;if(!/^[a-f0-9]{40}$/.test(before||'')||/^0+$/.test(before))throw Error('bounded_diff_required');
 const rows=git(['diff','--name-status',before,env.GITHUB_SHA,'--','ops/deep-superagent/probes/']).split('\n').filter(Boolean);
 if(rows.length!==1||rows[0]!=='A\tops/deep-superagent/probes/KIMI-POSTFIX-20261104-01.json')throw Error('one_append_only_fixed_probe_card_required');
 const card=normalizeProbe(JSON.parse(git(['show',env.GITHUB_SHA+':ops/deep-superagent/probes/KIMI-POSTFIX-20261104-01.json'])));
 const store=new DeepQueueLatchStore({repository:REPO,token:env.GITHUB_TOKEN,baseCommit:env.GITHUB_SHA,baseTree:git(['rev-parse',env.GITHUB_SHA+'^{tree}'])});
 const report=await runProbe({card,token:env.LTZZZ_AGENT_TOKEN,store,run_id:env.GITHUB_RUN_ID,source_commit:env.GITHUB_SHA});
 const file='knowledge/results/deep-superagent/kimi-postfix-'+env.GITHUB_RUN_ID+'-attempt-'+env.GITHUB_RUN_ATTEMPT+'.json';
 fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(redactKnownSecrets(report,[env.GITHUB_TOKEN,env.LTZZZ_AGENT_TOKEN]),null,2)+'\n');
 console.log(JSON.stringify({receipt:file,status:report.status,new_model_calls:report.new_model_calls}));if(!probeSucceeded(report))process.exitCode=1;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await main();
