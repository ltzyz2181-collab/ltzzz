import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {callAgent} from './call-qwen.mjs';
const id=process.env.QWEN_PROBE_ID||'QWEN-KEY-ACCEPTANCE-20261018';
if(!/^[A-Z0-9_-]{8,80}$/.test(id))throw Error('invalid_probe_id');
const file=`knowledge/results/providers/probes/${id}.json`,run=process.env.GITHUB_RUN_ID||'local';
const save=r=>{fs.mkdirSync('knowledge/results/providers/probes',{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
if(process.argv[2]==='prepare'){
 const execute=!fs.existsSync(file);
 if(execute)save({id,run_id:run,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),at:new Date().toISOString(),status:'reserved_before_provider_call',model_calls:0,generation_verified:false,max_output_tokens:128,paid:false,tx_hash:null});
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,`execute=${execute}\n`);
 console.log(JSON.stringify({id,execute,model_calls:0}));
}else if(process.argv[2]==='execute'){
 const bytes=fs.readFileSync(file),r=JSON.parse(bytes);
 if(r.run_id!==run||r.status!=='reserved_before_provider_call'||r.model_calls!==0)throw Error('fresh_matching_reservation_required');
 const remote=await fetch('https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/'+file,{cache:'no-store',signal:AbortSignal.timeout(15000)});
 const hash=b=>createHash('sha256').update(b).digest('hex');
 if(!remote.ok||hash(Buffer.from(await remote.arrayBuffer()))!==hash(bytes))throw Error('reservation_not_committed');
 r.status='generation_started_outcome_unknown';r.model_calls=1;save(r);
 const result=await callAgent({prompt:'这是一次限额的连接验收。只回复：千问API验收通过【交付结束】。不要工具调用或其他内容。',maxTokens:128});
 r.result=result;r.model_calls=['not_configured','configuration_error'].includes(result.status)?0:1;r.model_calls_definition='generation_requests_attempted_not_billing_proof';r.generation_verified=result.ok===true&&result.output?.includes('【交付结束】');
 r.status=r.generation_verified?'native_qwen_generation_verified_not_daily_delivery':result.status;
 r.finished_at=new Date().toISOString();r.api_charge='provider_billing_not_independently_measured';save(r);console.log(JSON.stringify(r));
 if(!r.generation_verified)process.exitCode=1;
}else throw Error('prepare_or_execute_required');
