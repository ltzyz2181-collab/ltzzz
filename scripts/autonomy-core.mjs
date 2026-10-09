import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const dateCST=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export const sha=s=>crypto.createHash('sha256').update(s).digest('hex');
export const save=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});fs.writeFileSync(f,JSON.stringify(v,null,2)+'\n');};
export function memory(){return ['魄','识神','梦境数据库','文明研究','项目历史','重要事件','装备论','README'].map(n=>{const file=`ltzzz-memory/${n}.md`;const text=fs.readFileSync(file,'utf8');if(!text.trim())throw Error('memory_empty');return {file,text,sha256:sha(text)};});}
export function jsonOutput(s){const text=String(s).trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,'');return JSON.parse(text);}
export async function invoke(agent,prompt,maxTokens){
 const providers=JSON.parse(fs.readFileSync('config/ai-providers.json')).providers;const p=providers[agent];
 try{
  let res;
  if(agent==='qianwen_proxy'){
   const r=await fetch('https://api-qianwen.ltzzz.com/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:prompt}],max_tokens:maxTokens}),signal:AbortSignal.timeout(120000)});
   if(!r.ok)return {status:'api_error',output:null};const d=await r.json();res={ok:true,output:d.choices?.[0]?.message?.content,finish_reason:d.choices?.[0]?.finish_reason,tokens_used:d.usage?.total_tokens,model:d.model};
  }else{
   if(!p?.module||!process.env[p.secret])return {status:'not_configured',output:null};
   res=await (await import(path.resolve(p.module))).callAgent({apiKey:process.env[p.secret],prompt,maxTokens});
  }
  const output=res.ok?String(res.output||'').trim():'';
  return {status:res.finish_reason==='length'?'truncated_output':res.ok&&output?'submitted':res.status||'empty_output',output:output||null,tokens_used:res.tokens_used||0,model:res.model||null};
 }catch{return {status:'exception',output:null};}
}
export function evaluateExperiment(kind){
 if(kind==='receipt_hash_benchmark'){
  const original={task_id:'AGI-TRIAL',executor:'test-agent',time:'fixture',status:'completed',evidence:{artifact:'fixture',paid:false}};
  const changed={...original,status:'failed'};const a=sha(JSON.stringify(original)),b=sha(JSON.stringify(changed));
  return {kind,status:a!==b?'passed':'failed',measurement:{hash_changes_after_status_change:a!==b,hash_original:a,hash_changed:b},claim:'实际运行本地数据实验；不证明支付或服务真实交付',tx_hash:null};
 }
 if(kind==='intent_schema_trial'){
  const validate=v=>typeof v?.deliverable==='string'&&v.deliverable.length>0&&typeof v?.acceptance==='string'&&v.acceptance.length>0&&Number.isFinite(v?.budget_usdc)&&v.budget_usdc>=0;
  const samples=[{deliverable:'draft',acceptance:'artifact exists',budget_usdc:0},{deliverable:'draft',budget_usdc:1},{deliverable:'draft',acceptance:'check',budget_usdc:-1}];
  const out=samples.map(validate);return {kind,status:out[0]&&!out[1]&&!out[2]?'passed':'failed',measurement:{valid_intent_accepted:out[0],missing_acceptance_rejected:!out[1],negative_budget_rejected:!out[2]},claim:'实际执行固定schema样本测试；不表示接受真实支付',tx_hash:null};
 }
 if(kind==='hire_acceptance_trial'){
  const jobs=[{artifact:'draft.md',submitted:true,verified:false},{artifact:'result.md',submitted:true,verified:true}];const settled=jobs.filter(j=>j.submitted&&j.verified);
  return {kind,status:settled.length===1?'passed':'failed',measurement:{submitted_jobs:2,eligible_after_verification:settled.length,unverified_excluded:true},claim:'实际执行模拟验收状态试验；没有实际结算',tx_hash:null};
 }
 throw Error('unsupported_experiment');
}
