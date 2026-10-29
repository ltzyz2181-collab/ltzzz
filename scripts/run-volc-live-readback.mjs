import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const REQUEST_PATH='ops/dispatch/runtime-requests/volc-signer-readback.json';
const TASK='PLAN-PATCHGATE-ESCROW-20261023',ACCOUNT='2131926778',FUNCTION='jt247vfx';
const APPROVED='ad1333216f2f0bc4f6c96430137a737d05369e4e';
const PINS={
 'scripts/signer-volc-deploy.mjs':'a7fd3e4f99a6f624cfad7b55a5d741210bb29375c1c035378b4661dfe57db885',
 'scripts/lib/volc-openapi.mjs':'2e123b497dfd5f0ba3ca374142b9572d6c7adc794641d53522fb574427700933'
};
export function validateReadbackRequest(r,now=Date.now()){
 if(r?.task_id!==TASK||r.step_id!=='SPLIT-SIGNER-INFRA-20261026'||r.operation!=='read_only_snapshot'||r.function_id!==FUNCTION||r.cloud_account_id!==ACCOUNT||r.approved_probe_commit!==APPROVED||r.state!=='pending')throw Error('readback_request_scope_invalid');
 if(!/^VOLC-READBACK-20261029-[0-9]{2}$/.test(r.request_id||''))throw Error('readback_request_id_invalid');
 const created=Date.parse(r.created_at_utc),expires=Date.parse(r.expires_at_utc);
 if(!Number.isFinite(created)||!Number.isFinite(expires)||created>now||expires<=now||expires-created>3600000)throw Error('readback_request_expired_or_invalid');
 return r;
}
export function verifyApprovedProbe(root='.'){
 for(const [file,expected] of Object.entries(PINS)){
  if(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex')!==expected)throw Error('readback_probe_source_changed');
 }
 return {...PINS};
}
export function publicReadbackProjection(r){
 return {status:r.status,function_id:r.function_id,function_name:r.function_name,cloud_account_id:r.cloud_account_id,region:'cn-beijing',
  request_id:r.request_id,account_binding_verified:r.cloud_account_id===ACCOUNT,nas_mount_declared:r.nas_mount_declared===true,
  runtime:/^[A-Za-z0-9_./-]{1,50}$/.test(r.runtime||'')?r.runtime:null,
  revision_time:/^[0-9T: +.ZUTC-]{1,64}$/.test(r.revision_time||'')?r.revision_time:null,
  revisions:r.revisions,revision_count:r.revision_count,code_size_bytes:r.code_size_bytes,
  triggers:(r.triggers||[]).map(t=>{
   let url=null,path_shape='unapproved_or_missing';
   try{if(t.url){
    const u=new URL(t.url);
    if(/^https?:$/.test(u.protocol)&&/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+apigateway-cn-beijing\.volceapi\.com$/.test(u.hostname)&&!u.port){
     const known=['/','/health','/challenge','/attest'].includes(u.pathname);
     url=u.protocol+'//'+u.hostname+(known?u.pathname:'/');path_shape=known?'known_route':'nonstandard_path_omitted';
    }
   }}catch{}
   return {id:t.id,enabled:t.enabled,type:['apig','apigateway','http'].includes(t.type)?t.type:null,url,path_shape};
  }),trigger_count:r.trigger_count};
}
export async function runReadback({request,now=Date.now(),root='.',inspect,sourceCommit=null,runId=null,runAttempt=null}={}){
 validateReadbackRequest(request,now);const probe_sources=verifyApprovedProbe(root);
 // Verify bytes BEFORE importing code or allowing any credential-bearing request.
 if(!inspect)({inspectVolcSigner:inspect}=await import(pathToFileURL(path.resolve(root,'scripts/signer-volc-deploy.mjs')).href));
 const live=await inspect({command:'detail',functionId:FUNCTION});
 if(live.cloud_account_id!==ACCOUNT||live.function_id!==FUNCTION)throw Error('readback_cloud_identity_mismatch');
 return {schema:'ltzzz.volc-signer.live-readback.v1',task_id:TASK,step_id:'SPLIT-SIGNER-INFRA-20261026',request_id:request.request_id,
  at_utc:new Date(now).toISOString(),source_commit:sourceCommit,approved_probe_commit:APPROVED,probe_sources,run_id:runId,run_attempt:runAttempt,
  observation:publicReadbackProjection(live),private_keys_read:false,cloud_writes:0,model_calls:0,production_deployed:false,public_key_registered:false,
  reader_inventory_verified:false,actual_source_bytes_verified:false,restart_same_key_verified:false,native_doubao_signature_verified:false,
  financial_execution:false,paid:false,tx_hash:null};
}
async function cli(){
 const request=JSON.parse(fs.readFileSync(REQUEST_PATH)),mode=process.argv[2];
 validateReadbackRequest(request);verifyApprovedProbe();
 if(mode==='validate'){console.log('readback_request_and_approved_source_valid');return;}
 if(mode!=='run')throw Error('readback_command_invalid');
 const meta={sourceCommit:process.env.GITHUB_SHA||null,runId:process.env.GITHUB_RUN_ID||null,runAttempt:Number(process.env.GITHUB_RUN_ATTEMPT||1)};
 let report;
 try{report=await runReadback({request,...meta});}
 catch(e){report={task_id:TASK,step_id:'SPLIT-SIGNER-INFRA-20261026',request_id:request.request_id,at_utc:new Date().toISOString(),source_commit:meta.sourceCommit,run_id:meta.runId,run_attempt:meta.runAttempt,status:'blocked',error:/^[a-z_]+$/.test(e.message)?e.message:'readback_provider_or_transport_failure',private_keys_read:false,cloud_writes:0,model_calls:0,production_deployed:false,public_key_registered:false,paid:false,tx_hash:null};process.exitCode=1;}
 fs.mkdirSync('results/volc-signer',{recursive:true});fs.writeFileSync('results/volc-signer/live-readback.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)await cli();
