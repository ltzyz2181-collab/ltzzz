import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {relayRequest,executeRelay,sha256,REPOSITORY} from './lib/control-relay.mjs';
import {PULSE_URL} from './lib/pulse-client.mjs';import {pulseToken} from './pulse-credentials.mjs';
const request=relayRequest(JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),{actor:process.env.GITHUB_ACTOR,repository:process.env.GITHUB_REPOSITORY});
const file='knowledge/results/control-relay/'+request.id+'.json',artifact=file.replace(/\.json$/,'.md');
const save=r=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
const phase=process.argv[2];
if(phase==='prepare'){
 const exists=fs.existsSync(file);
 if(!exists)save({...request,at:new Date().toISOString(),source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),run_id:process.env.GITHUB_RUN_ID,status:'claimed_before_remote_access',input_sha256:sha256(request.task),model_calls:0,native_qianwen_calls:0,native_openai_calls:0,native_anthropic_calls:0,financial_execution:false,paid:false,tx_hash:null,operations:[]});
 fs.appendFileSync(process.env.GITHUB_OUTPUT,'execute='+!exists+'\n');
}else if(phase==='execute'){
 const r=JSON.parse(fs.readFileSync(file));if(r.run_id!==process.env.GITHUB_RUN_ID)throw Error('claim_run_mismatch');
 const evidence={sources:[],missing:[]};
 for(const filename of ['knowledge/results/ans-cycle/'+new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())+'.json','knowledge/results/wep3/latest.json','knowledge/results/recovery/claude-external-delivery-2026-10-16.json','config/autonomy-authority.json']){
  try{const raw=fs.readFileSync(filename,'utf8'),data=JSON.parse(raw);evidence.sources.push({path:filename,sha256:sha256(raw),status:data.status||data.mode||null,at:data.at||data.completed_at||null,paid:data.paid??null,tx_hash:data.tx_hash??null});}catch(e){if(e.code!=='ENOENT')throw e;evidence.missing.push(filename);}
 }
 const readStatus=async()=>{const response=await fetch(PULSE_URL+'/status',{signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('pulse_read_http_'+response.status);return response.json();};
 const control=async(role,body)=>{const token=pulseToken(role);console.log('::add-mask::'+token);const response=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('pulse_control_http_'+response.status);return response.json();};
 await executeRelay(r,{readStatus,control,evidence,save});
 fs.writeFileSync(artifact,'# 桌面 / 国内 AI 接力 · '+r.id+'\n\n状态：'+r.status+'。\n\n执行器：'+(r.execution_kind||'cloud_rules')+'；模型调用 0；没有付款、投资、发布或任意命令执行。\n\n任务原文仅作数据：\n\n'+r.task+'\n\n## 核验材料\n\n```json\n'+JSON.stringify(r.evidence||r.observed,null,2)+'\n```\n\n任务指向云端 LTZZZ 执行席，不会唤醒已离线的 ChatGPT 对话。只读交付待独立审核；派单成功不代表千问原生模型接单。\n');
 console.log(JSON.stringify({status:r.status,model_calls:0,financial_execution:false}));if(r.status.startsWith('blocked'))process.exitCode=1;
}else if(phase==='comment'){
 const r=JSON.parse(fs.readFileSync(file)),body='LTZZZ 接力：`'+r.status+'`。\n\n[结构化回执](https://github.com/'+REPOSITORY+'/blob/main/'+file+') · [检查交付](https://github.com/'+REPOSITORY+'/blob/main/'+artifact+')\n\n模型调用 0；千问权限执行器不是千问原生生成。派单/只读交付与审核、部署、真钱付款分开记录。';
 const response=await fetch('https://api.github.com/repos/'+REPOSITORY+'/issues/'+request.issue_number+'/comments',{method:'POST',headers:{Authorization:'Bearer '+process.env.GITHUB_TOKEN,'Content-Type':'application/json',Accept:'application/vnd.github+json'},body:JSON.stringify({body}),signal:AbortSignal.timeout(20000)});if(!response.ok)throw Error('github_comment_failed_'+response.status);
}else throw Error('unsupported_phase');
