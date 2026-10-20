import fs from 'node:fs';import {execFileSync} from 'node:child_process';
import {dailyHireId} from '../wep3-procurement-contract.js';
import {dailyHireAssignment,executeDailyHire,digest} from './lib/daily-external-hire.mjs';
import {liveEight,canonicalEight} from './lib/live-wep3-eight.mjs';
import {BASE,runnerToken,wep3Request} from './lib/funded-invest-runtime.mjs';
import {externalAIRelay} from './lib/external-ai-relay.mjs';
import {pulseSnapshot,pulseGate} from './lib/pulse-client.mjs';
import {OWNER_HIRE,assertOwnerPayment} from './lib/owner-external-hire.mjs';
const {id,date}=OWNER_HIRE,dir='knowledge/results/owner-external',file=dir+'/'+id+'.json',phase=process.argv[2];
fs.mkdirSync(dir,{recursive:true});
const save=record=>fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
function split(record){
 const order=record.order||{};
 const payment={task_id:id,external_order_id:order.id||dailyHireId(date),currency:'Base_USDC',payer:order.payer||null,pay_to:order.pay_to||null,amount_raw:order.amount_raw||null,max_amount_raw:'50000',paid:order.paid===true,tx_hash:order.tx_hash||null,payment_proof:order.payment_proof||null,payment_status:order.status||record.status};
 const delivery={task_id:id,external_order_id:order.id||null,provider:order.provider||null,model_reported:order.model_reported||null,model_identity_verification:order.model_identity_verification||'provider_report_only',finish_reason:order.finish_reason||null,usage:order.usage||null,deliverable:order.deliverable||null,deliverable_sha256:order.deliverable_sha256||null,local_hash_matches:typeof order.deliverable==='string'&&digest(order.deliverable)===order.deliverable_sha256,structural_valid:order.structural_valid===true,semantic_valid:order.semantic_valid===true};
 const review={task_id:id,delivery_sha256:order.deliverable_sha256||null,independent_review:order.independent_review||null,delivery_accepted:order.delivery_accepted===true,paid:false,new_payment:false};
 for(const [kind,data] of Object.entries({payment,delivery,review}))fs.writeFileSync(dir+'/'+id+'-'+kind+'.json',JSON.stringify(data,null,2)+'\n');
 fs.mkdirSync('ops/dispatch',{recursive:true});fs.writeFileSync('ops/dispatch/CLAUDE-'+id+'-AUDIT.md',`# Claude 独立审计派单\n\n状态：assigned_waiting_native_Claude_review；不是Claude已审。\n目标：核对1单<=0.05USDC外部采购、实际作者/复核差异、完整8项线上回归及T02地址。\n输入：${file}、${dir}/${id}-payment.json、${dir}/${id}-delivery.json、${dir}/${id}-review.json、${dir}/${id}-acceptance-eight.json。\n结论需区分付款、交付质量、线上规范回归；不能把内部积分或模板转写称作真钱工资/原创设计。\n当前执行状态：${record.status}；paid=${payment.paid}；tx_hash=${payment.tx_hash||'null'}。\n`);
}
if(phase==='prepare'){
 if(!fs.existsSync(file)){
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),paths=['wep3-market.js','wep3-aave.js','wep3-procurement-contract.js','scripts/lib/live-wep3-eight.mjs'];
  const inputs=paths.map(path=>({path,sha256:digest(fs.readFileSync(path))}));
  const context={source_commit:sourceCommit,input_sha256:digest(JSON.stringify(inputs)),ans_status:'one_off_owner_authorized'};
  const record={...dailyHireAssignment({mode:'external',date,sourceCommit,context,runId:process.env.GITHUB_RUN_ID}),task_id:id,external_runtime_order_id:dailyHireId(date),order_id_scope:'external_procurement_book_slot_not_the_internal_daily_task',owner_authorization:'ops/dispatch/'+id+'.json',inputs,at:new Date().toISOString()};save(record);
  fs.writeFileSync(dir+'/'+id+'-canonical-eight.json',JSON.stringify({tests:canonicalEight(),spec_provided_in_prompt:true,correction:'T02 uses registered verified treasury; original Doubao delivery with malformed 39-hex address remains unchanged'},null,2)+'\n');
 }
 console.log(JSON.stringify({task_id:id,status:'dispatch_persisted_before_payment',model_calls:0}));
}else if(phase==='execute'){
 const record=JSON.parse(fs.readFileSync(file));
 try{
  const committed=JSON.parse(execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'}));if(committed.task_id!==id||committed.context.input_sha256!==record.context.input_sha256)throw Error('committed_owner_dispatch_required');
  const auth=JSON.parse(fs.readFileSync(record.owner_authorization));if(auth.owner_authorized!==true||auth.task_id!==id||auth.max_usdc!=='0.05'||auth.orders!==1)throw Error('fixed_owner_authorization_required');
  const token=runnerToken();if(!token)throw Error('runner_identity_missing');
  const acceptance=await liveEight({base:BASE,token});acceptance.run_id=process.env.GITHUB_RUN_ID;acceptance.source_commit=process.env.GITHUB_SHA;acceptance.canonical_contract_sha256=digest(fs.readFileSync(dir+'/'+id+'-canonical-eight.json'));
  fs.writeFileSync(dir+'/'+id+'-acceptance-eight.json',JSON.stringify(acceptance,null,2)+'\n');record.online_eight_passed=acceptance.passed;save(record);
  if(!acceptance.passed)throw Error('live_eight_not_passed_no_purchase');
  const api=(path,body)=>wep3Request(path,{token,...(body?{body}:{})});
  const existing=await api('/market/procurement/daily?date='+date);if(existing.order){record.order=existing.order;record.paid=existing.order.paid===true;record.tx_hash=existing.order.tx_hash||null;assertOwnerPayment(existing.order);}
  if(!record.order&&record.inputs.some(input=>digest(fs.readFileSync(input.path))!==input.sha256))throw Error('dispatch_inputs_changed_no_payment');
  const snapshot=await pulseSnapshot(),gate=pulseGate(snapshot,'doubao');const key=process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY;
  const {callAgent}=await import('./call-doubao.mjs');
  await executeDailyHire(record,{api,relay:()=>externalAIRelay(token,{date,context:record.context,existingOnly:!!record.order}),reviewerConfigured:!!key,pulseReady:snapshot.available&&gate.allowed&&gate.state==='fresh',save,callReviewer:prompt=>callAgent({apiKey:key,prompt,maxTokens:1800,thinking:'disabled'})});
  assertOwnerPayment(record.order);
 }catch(error){record.status='blocked_'+String(error.message).replace(/[^a-zA-Z0-9_]/g,'_').slice(0,120);save(record);}
 split(record);save(record);
 console.log(JSON.stringify({task_id:id,status:record.status,eight_passed:record.online_eight_passed,paid:record.paid,tx_hash:record.tx_hash,new_payments_this_run:record.new_payments_this_run}));
 if(record.status!=='paid_delivery_accepted')process.exitCode=1;
}else throw Error('fixed_prepare_or_execute_phase_required');
