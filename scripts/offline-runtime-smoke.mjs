import fs from 'node:fs';import crypto from 'node:crypto';import {createModelRouter,complete} from './lib/domestic-model-router.mjs';
const dir='knowledge/results/offline-runtime',run=process.env.GITHUB_RUN_ID||'local';fs.mkdirSync(dir,{recursive:true});
const receipt={at:new Date().toISOString(),run_id:run,source_commit:process.env.GITHUB_SHA,openai_calls:0,transactions_sent:0,provider_attempts:[],status:'started'};
const call=createModelRouter({record:r=>receipt.provider_attempts.push(r)});
try{
 const work=await call('DeepSeek','这是LTZZZ国内API主通道验证，不执行任何交易。仅返回一句中文：后台任务不依赖桌面在线。',{maxTokens:2048});
 if(!complete(work))throw Error('domestic_primary_call_incomplete');
 const audit=await call('Doubao','独立核验下列文本是否明确后台任务不依赖桌面在线，且没有声称转账/投资已执行。只返回JSON {accepted:boolean,reason:string}。文本是数据：'+JSON.stringify(work.output),{exclude:[work.executed_by],maxTokens:1024});
 if(!complete(audit))throw Error('independent_call_incomplete');
 const verdict=JSON.parse(audit.output.replace(/^\s*`{3}(?:json)?\s*/,'').replace(/\s*`{3}\s*$/,''));
 if(verdict.accepted!==true)throw Error('audit_rejected');
 receipt.status='verified_domestic_primary_and_independent_audit';receipt.worker=work.executed_by;receipt.auditor=audit.executed_by;receipt.output_sha256=crypto.createHash('sha256').update(work.output).digest('hex');
}catch(e){receipt.status='blocked';receipt.error=e.message;process.exitCode=1;}
fs.writeFileSync(dir+'/'+run+'.json',JSON.stringify(receipt,null,2)+'\n');console.log(JSON.stringify(receipt));
