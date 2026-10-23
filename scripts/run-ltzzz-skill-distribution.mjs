import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {pinnedRelease,distributionArtifacts,prepareMetaConsumption,consumeMetaInline,META_SMOKE_QUESTION,metaInlinePrompt,RESULT_DIR,META_RECEIPT,META_ENDPOINT} from './lib/ltzzz-skill-distribution.mjs';
import {metaExecutorToken} from './lib/meta-executor-auth.mjs';
const release=pinnedRelease(),phase=process.argv[2]||'check';
const registry=JSON.parse(fs.readFileSync('identity/seat-registry.json','utf8'));
const artifacts=distributionArtifacts(release,registry);
const save=record=>{fs.mkdirSync(RESULT_DIR,{recursive:true});fs.writeFileSync(META_RECEIPT,JSON.stringify(record,null,2)+'\n');};
if(['build','check'].includes(phase)){
 for(const [file,text] of artifacts){
  if(phase==='check'){if(!fs.existsSync(file)||fs.readFileSync(file,'utf8').replace(/\r\n/g,'\n')!==text)throw Error('distribution_artifact_drift:'+file);}
  else{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,text);}
 }
 console.log(JSON.stringify({status:phase==='check'?'pinned_distribution_matches':'repository_cards_created_not_client_load',source_commit:release.manifest.source_commit,files:release.files.length,seat_cards:artifacts.size-1,model_calls:0}));
}else if(phase==='prepare'){
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 if(process.env.GITHUB_ACTOR!=='ltzyz2181-collab'||event.issue?.user?.login!=='ltzyz2181-collab'||!event.issue.title.startsWith('[LTZZZ技能分发]'))throw Error('owner_distribution_issue_required');
 const prior=fs.existsSync(META_RECEIPT)?JSON.parse(fs.readFileSync(META_RECEIPT,'utf8')):null;
 const prepared=prepareMetaConsumption({release,runId:process.env.GITHUB_RUN_ID,attempt:process.env.GITHUB_RUN_ATTEMPT||'1',issue:event.issue.number,sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),prior});
 if(prepared.execute)save(prepared.record);
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+prepared.execute+'\n');
 console.log(JSON.stringify({execute:prepared.execute,status:prepared.record.status,model_calls:0}));
}else if(phase==='execute'){
 const record=JSON.parse(fs.readFileSync(META_RECEIPT,'utf8'));
 const persisted=JSON.parse(execFileSync('git',['show','HEAD:'+META_RECEIPT],{encoding:'utf8'}));
 if(record.skill_source_commit!==release.manifest.source_commit||record.skill_core_sha256!==release.manifest.core_sha256||record.prompt!==metaInlinePrompt(release,META_SMOKE_QUESTION))throw Error('fixed_release_prompt_required');
 if(record.run_id!==process.env.GITHUB_RUN_ID||record.run_attempt!==(process.env.GITHUB_RUN_ATTEMPT||'1')||JSON.stringify(record)!==JSON.stringify(persisted))throw Error('same_attempt_committed_reservation_required');
 let token;try{token=metaExecutorToken();}catch{record.status='blocked_managed_meta_credential_missing';save(record);process.exitCode=1;}
 if(token){
  console.log('::add-mask::'+token);
  // Fixed authenticated endpoint, no configurable URL, automatic retry, deployment or secret update.
  let auth;try{auth=await fetch(META_ENDPOINT+'/auth-check',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:'{}',signal:AbortSignal.timeout(20000)});}catch{auth={status:null};}
  // A failed auth probe never starts inference; keep uncertainty explicit without retrying.
  if(auth.status!==200){record.status='blocked_meta_auth_no_generation';record.auth_http=auth.status;save(record);process.exitCode=1;}
  else{
   await consumeMetaInline(record,{save,call:async body=>{
    const r=await fetch(META_ENDPOINT+'/task',{method:'POST',redirect:'error',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(120000)});
    const d=await r.json();
    // Never persist an echoed credential, even if upstream returns an error/body containing it.
    return {...d,output:typeof d.output==='string'?d.output.replaceAll(token,'[REDACTED]'):'',ok:r.ok,http:r.status};
   }});
   if(!record.scenarios_verified)process.exitCode=1;
   console.log(JSON.stringify({status:record.status,model_calls:record.model_calls,generation_verified:record.generation_verified,scenarios_verified:record.scenarios_verified}));
  }
 }
}else throw Error('fixed_build_check_prepare_execute_phase_required');
