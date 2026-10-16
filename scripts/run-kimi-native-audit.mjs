import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {auditRequest,auditSubject,executeAudit,hash} from './lib/kimi-native-audit.mjs';
import {kimiCall} from './agi-econ/kimi-cn.mjs';
const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
const request=auditRequest(event,{actor:process.env.GITHUB_ACTOR,repository:process.env.GITHUB_REPOSITORY});
const dir='knowledge/results/wep3/kimi-native',file=dir+'/'+request.id+'.json',input=dir+'/'+request.id+'-subject.json';
const save=record=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');};
const phase=process.argv[2];
if(phase==='prepare') {
 if(fs.existsSync(file)){fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute=false\n');console.log('Existing claim retained; no repeated generation.');}
 else {
  const bytes=fs.readFileSync('knowledge/results/wep3/latest.json'),receipt=JSON.parse(bytes);
  if(!/^knowledge\/results\/wep3\/delivery-contract-\d{4}-\d{2}-\d{2}\.json$/.test(receipt.source||''))throw Error('fixed_contract_source_required');
  const deliveryBytes=fs.readFileSync(receipt.source),subject=auditSubject(receipt,bytes,JSON.parse(deliveryBytes),deliveryBytes),subjectBytes=JSON.stringify(subject,null,2)+'\n';
  fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(input,subjectBytes,{flag:'wx'});
  save({schema_version:1,...request,status:'claimed',at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),input:{path:input,sha256:hash(subjectBytes)},scope:subject.scope,model_call_budget:1,model_calls_attempted:0,native_generation_verified:false,artifact_bound_audit_verified:false,automatic_retry_allowed:false,paid:false,api_cost_cny:null,financial_execution:false,tx_hash:null,production_model_configuration_changed:false});
  fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute=true\n');console.log(request.id,'claimed; no generation yet');
 }
} else if(phase==='execute') {
 const record=JSON.parse(fs.readFileSync(file));
 if(record.run_id!==process.env.GITHUB_RUN_ID||record.input.path!==input)throw Error('claim_run_or_input_mismatch');
 const bytes=fs.readFileSync(input);if(hash(bytes)!==record.input.sha256)throw Error('subject_hash_mismatch');
 record.execution_source_commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 await executeAudit(record,{env:process.env,subject:JSON.parse(bytes),call:kimiCall,save});
 fs.writeFileSync(path.join(dir,'latest.json'),JSON.stringify(record,null,2)+'\n');
 console.log(JSON.stringify({id:record.id,status:record.status,selected_model:record.selected_model,actual_model:record.provider?.actual_model,native_generation_verified:record.native_generation_verified,artifact_bound_audit_verified:record.artifact_bound_audit_verified,tokens_used:record.provider?.tokens_used,paid:false,tx_hash:null}));
 if(!record.artifact_bound_audit_verified)process.exitCode=1;
} else if(phase==='comment') {
 const record=JSON.parse(fs.readFileSync(file));
 const body='Kimi原生WEP3独立验收：`'+record.status+'`。\n\n[原始回执](https://github.com/ltzyz2181-collab/ltzzz/blob/main/'+file+') · [审核对象](https://github.com/ltzyz2181-collab/ltzzz/blob/main/'+input+')\n\n实际模型：`'+(record.provider?.actual_model||'未验证')+'`；原生生成：'+record.native_generation_verified+'；哈希绑定审稿：'+record.artifact_bound_audit_verified+'。模型调用上限1，不自动重试；不部署、不更新旧结算、不转账。API费用按提供商计费，paid=false仅指没有真钱工资付款。';
 const r=await fetch('https://api.github.com/repos/ltzyz2181-collab/ltzzz/issues/'+request.issue_number+'/comments',{method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({body}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('receipt_comment_failed_'+r.status);
} else throw Error('prepare_execute_or_comment_required');
