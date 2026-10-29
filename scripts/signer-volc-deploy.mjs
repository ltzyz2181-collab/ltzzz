#!/usr/bin/env node
// Read-only access reconciliation; never logs credentials, resource envs or source URLs.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {volcRequest} from './lib/volc-openapi.mjs';
const NAME='ltzzz-signer-volc-attest';
const base={schema:'ltzzz.volc-signer.preflight.v1',task_id:'PLAN-PATCHGATE-ESCROW-20261023',step_id:'SPLIT-SIGNER-INFRA-20261026',region:'cn-beijing',credential_values_logged:false,model_calls:0,production_deployed:false,signer_ready:false,financial_execution:false,paid:false,tx_hash:null};
function requestMetadata(r){return{request_id:typeof r.ResponseMetadata?.RequestId==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(r.ResponseMetadata.RequestId)?r.ResponseMetadata.RequestId:null};}
export async function inspectVolcSigner({command='list',functionId,request=volcRequest}={}){
 if(!['list','get','challenge','detail'].includes(command))throw Error('signer_runtime_incomplete_no_deployment');
 if(command==='list'){
  const r=await request({action:'ListFunctions',body:{PageNumber:1,PageSize:50}});
  if(!Array.isArray(r.Result?.Items)||!Number.isSafeInteger(r.Result.Total)||r.Result.Total<0)throw Error('volc_function_list_schema');
  return {...base,...requestMetadata(r),status:'vefaas_list_permission_verified_only',list_permission_verified:true,listed_count:r.Result.Items.length,total:r.Result.Total,more_pages:r.Result.Total>r.Result.Items.length,target_ids:r.Result.Items.filter(x=>x.Name===NAME&&/^[a-zA-Z0-9_-]{1,120}$/.test(x.Id)).map(x=>x.Id),account_binding_verified:false};
 }
 if(typeof functionId!=='string'||!/^[a-zA-Z0-9_-]{1,120}$/.test(functionId))throw Error('actual_function_id_required');
 const r=await request({action:'GetFunction',body:{Id:functionId}}),f=r.Result;
 if(f.Id!==functionId||f.Name!==NAME)throw Error('volc_function_identity_mismatch');
 const account=typeof f.Owner==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(f.Owner)?f.Owner:null;
 const readOnly={...base,...requestMetadata(r),status:'function_metadata_read_only_not_restart_challenge',function_id:f.Id,function_name:f.Name,cloud_account_id:account,account_binding_verified:account!==null,runtime:typeof f.Runtime==='string'?f.Runtime:null,revision_time:typeof f.LastUpdateTime==='string'?f.LastUpdateTime:null,nas_mount_declared:f.NasStorage?.EnableNas===true,restart_challenge_verified:false,legacy_challenge_command_is_metadata_only:command==='challenge'};
 if(command!=='detail')return readOnly;
 const idOf=(v)=>typeof v==='string'&&/^[a-zA-Z0-9_-]{1,120}$/.test(v)?v:null;
 const rev=await request({action:'ListRevisions',body:{FunctionId:functionId,PageNumber:1,PageSize:50}});
 const trg=await request({action:'ListTriggers',body:{FunctionId:functionId}});
 const revisions=(Array.isArray(rev.Result?.Items)?rev.Result.Items:[]).map(x=>({revision_number:Number.isSafeInteger(x.RevisionNumber)?x.RevisionNumber:null,id:idOf(x.Id)}));
 const urlOf=(v)=>{if(typeof v!=='string')return null;const m=v.match(/https?:\/\/[A-Za-z0-9._~:/?#\[\]@!$&'()*+,;=%\-]{1,300}/);return m?m[0].slice(0,300):null;};
 const triggers=(Array.isArray(trg.Result?.Items)?trg.Result.Items:[]).map(t=>({id:idOf(t.Id),name:typeof t.Name==='string'?t.Name.slice(0,100):null,type:typeof t.Type==='string'?t.Type:null,enabled:typeof t.Enabled==='boolean'?t.Enabled:null,creation_time:typeof t.CreationTime==='string'?t.CreationTime.slice(0,64):null,url:urlOf(t.DetailedConfig)}));
 const spec=typeof f.ResourceSpec==='object'&&f.ResourceSpec!==null?{cpu:typeof f.ResourceSpec.CPU==='number'?f.ResourceSpec.CPU:null,memory_mb:typeof f.ResourceSpec.Mem==='number'?f.ResourceSpec.Mem:(typeof f.ResourceSpec.Memory==='number'?f.ResourceSpec.Memory:null)}:null;
 return {...readOnly,status:'function_detail_read_only_not_restart_challenge',revision_count:revisions.length,revisions,trigger_count:triggers.length,triggers,resource_spec:spec,handler:typeof f.Handler==='string'?f.Handler.slice(0,200):null,timeout_sec:Number.isSafeInteger(f.Timeout)?f.Timeout:null,code_size_bytes:Number.isSafeInteger(f.CodeSize)?f.CodeSize:null};
}
export async function cli({args=process.argv.slice(2),env=process.env,write=console.log}={}){
 const command=args[0]||'list';let receipt;
 const metadata={at_utc:new Date().toISOString(),source_commit:/^[a-f0-9]{40}$/.test(env.GITHUB_SHA||'')?env.GITHUB_SHA:null,run_id:/^\d+$/.test(env.GITHUB_RUN_ID||'')?env.GITHUB_RUN_ID:null,run_attempt:/^\d+$/.test(env.GITHUB_RUN_ATTEMPT||'')?Number(env.GITHUB_RUN_ATTEMPT):null};
 try{receipt={...await inspectVolcSigner({command,functionId:args[1]||env.SIGNER_FUNCTION_ID}),...metadata};}
 catch(e){const error=/^(?:iam_[a-z_]+|volc_[a-z_]+|fixed_vefaas_request_required|actual_function_id_required|signer_runtime_incomplete_no_deployment)$/.test(e.message)?e.message:'volc_preflight_failed';receipt={...base,...metadata,status:'blocked',error,provider_error_code:e.code??null,request_id:e.request_id??null};process.exitCode=1;}
 if(env.GITHUB_ACTIONS==='true'){fs.mkdirSync('results/volc-signer',{recursive:true});fs.writeFileSync('results/volc-signer/preflight.json',JSON.stringify(receipt,null,2)+'\n');}
 write(JSON.stringify(receipt));return receipt;
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===path.resolve(process.argv[1]))await cli();
