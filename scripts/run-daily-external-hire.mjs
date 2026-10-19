import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {hireDate,dailyHireId} from '../wep3-procurement-contract.js';
import {dailyHireAssignment,executeDailyHire,digest} from './lib/daily-external-hire.mjs';
import {externalAIRelay} from './lib/external-ai-relay.mjs';
import {runnerToken,wep3Request} from './lib/funded-invest-runtime.mjs';
import {pulseSnapshot,pulseGate} from './lib/pulse-client.mjs';
const phase=process.argv[2];
if(!['prepare','execute'].includes(phase)||process.argv.length!==3)throw Error('fixed_prepare_or_execute_required');
const date=hireDate(),id=dailyHireId(date),dir='knowledge/results/claude-team',file=dir+'/real-hire-'+date.replaceAll('-','')+'.json';
const save=record=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');};
if(phase==='prepare'){
 if(!fs.existsSync(file)){
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const latest=fs.readdirSync('knowledge/results/ans-cycle').filter(n=>/^\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().at(-1);
  const ansPath='knowledge/results/ans-cycle/'+latest,ans=JSON.parse(fs.readFileSync(ansPath));
  const inputs=['wep3-market.js','wep3-procurement-contract.js',ansPath].map(path=>({path,sha256:digest(fs.readFileSync(path))}));
  // A new date/ANS prose alone must not trigger a purchase of the same accepted API artifact.
  const context={source_commit:sourceCommit,input_sha256:digest(JSON.stringify(inputs.filter(x=>x.path!==ansPath))),ans_status:ans.status};
  const record={...dailyHireAssignment({date,sourceCommit,context,runId:process.env.GITHUB_RUN_ID||'local'}),at:new Date().toISOString(),inputs};save(record);
  fs.writeFileSync('ops/dispatch/'+id+'.md',`# ${id}\n\n类型：派单（固定规则，非Claude原生定时调用）\n\n目标：ANS现阶段一级任务与AI雇佣AI长期一级任务；依据最新ANS输入，为Aave预览集成交付回归实物。\n输入：${inputs.map(x=>x.path+' @ '+x.sha256).join('\n')}\n输出：${file}\n验收：第三方报告为DeepSeek的交付哈希（模型身份未独立认证）、Base USDC付款证据、语义检查、豆包异提供商hash绑定复核。\n约束：每天最多一单，单笔不超过0.05 USDC；未知付款不重试；不改旧单、不重复购买同输入已验收实物；不用未验证钱包、不新增投资。\n来源：${sourceCommit}；运行：${record.run_id}。\n`);
 }
 console.log(JSON.stringify({task_id:id,status:JSON.parse(fs.readFileSync(file)).status,model_calls:0}));
}else{
 const record=JSON.parse(fs.readFileSync(file));
 // A committed dispatch must exist before either a payment or review generation.
 const persisted=JSON.parse(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}));
 if(persisted.task_id!==id||persisted.context.input_sha256!==record.context.input_sha256)throw Error('persisted_dispatch_required');
 record.latest_run_id=process.env.GITHUB_RUN_ID||'local';record.latest_attempt_at=new Date().toISOString();
 const token=runnerToken();if(!token){record.status='blocked_runner_auth';save(record);process.exitCode=1;}
 else{
  const snapshot=await pulseSnapshot(),gate=pulseGate(snapshot,'doubao');
  const {callAgent}=await import('./call-doubao.mjs');
  const key=process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY;
  const api=(path,body)=>wep3Request(path,{token,...(body?{body}:{})});
  await executeDailyHire(record,{
   relay:(date,context)=>externalAIRelay(token,{date,context}),api,
   reviewerConfigured:!!key,pulseReady:snapshot.available&&gate.allowed&&gate.state==='fresh',save,
   callReviewer:prompt=>callAgent({apiKey:key,prompt,maxTokens:1800,thinking:'disabled'})
  });
  console.log(JSON.stringify({task_id:id,status:record.status,paid:record.paid,tx_hash:record.tx_hash,new_payments_this_run:record.new_payments_this_run}));
  if(record.status.startsWith('blocked_'))process.exitCode=1;
 }
}
