import {pulseSnapshot,pulseGate} from './lib/pulse-client.mjs';
import fs from 'node:fs';import {createModelRouter} from './lib/domestic-model-router.mjs';import {fulfillOne} from './lib/market-fulfillment.mjs';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev';
const report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,model_calls:0,orders:[]};
async function api(path,body){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Lab-Pin':process.env.WEP3_RUNNER_TOKEN},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(30000)});const data=await r.json();if(!r.ok)throw Error(data.error||'market_http_'+r.status);return data;}
const pulse=await pulseSnapshot();report.pulse={ran_at:pulse.ran_at||null,available:pulse.available,controls:pulse.controls||null};
const blocked=['DeepSeek','Doubao','Grok'].filter(agent=>!pulseGate(pulse,agent).allowed);
const router=createModelRouter({record:entry=>{report.model_calls++;(report.providers||=[]).push(entry);}});
const call=(agent,prompt,options={})=>router(agent,prompt,{...options,exclude:[...new Set([...blocked,...(options.exclude||[])])]});
try{
  await api('/market/payments/reconcile',{});
  await api('/market/economy/maintain',{});
  const queue=await api('/market/queue'+(process.env.PROCESS_TEST_ORDERS==='1'?'?test=1':''));
  // One funded order per run, at most two provider calls; no unpaid or simulated orders. No buyers => zero model calls.
  const independentAvailable=[['DeepSeek',process.env.DEEPSEEK_API_KEY],['Doubao',process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY],['Grok',process.env.XAI_API_KEY]].filter(([name,key])=>key&&!blocked.includes(name)).length>=2;
  if(!pulseGate(pulse,'GPT').allowed||!independentAvailable)report.dispatch_blocker='pulse_pause_or_no_independent_available_pair';
  for(const initial of queue.orders.slice(0,report.dispatch_blocker?0:1)){
    const result=await fulfillOne(initial,{api,call});report.orders.push(result);if(result.status==='completion_unknown'||result.status==='claim_failed')process.exitCode=1;
  }
}catch(e){report.error=e.message;process.exitCode=1;}
// Public report excludes customer briefs, private capabilities and deliverable bodies.
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/market-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
