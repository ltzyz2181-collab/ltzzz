// Actions-only explicit one-off learning command; never prints credentials.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {preparePractice,executePractice,practiceIdentity,practicePath,validatePracticeBridgeClaim} from './lib/controller-paid-practice.mjs';
import {hireDate} from '../wep3-procurement-contract.js';
import {runnerToken,wep3Request} from './lib/funded-invest-runtime.mjs';
import {pulseSnapshot,pulseGate} from './lib/pulse-client.mjs';
const phase=process.argv[2],identity=practiceIdentity({command_id:process.env.CONTROLLER_COMMAND_ID,task_id:process.env.CONTROLLER_TASK_ID});
if(process.argv.length!==3||!['prepare','execute'].includes(phase)||identity.task_id!=='PLAN-PATCHGATE-ESCROW-20261023'
 ||process.env.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_EVENT_NAME!=='workflow_dispatch'
 ||!['ltzyz2181-collab','github-actions[bot]'].includes(process.env.GITHUB_ACTOR))throw Error('authenticated_main_one_off_practice_required');
const file=practicePath(identity),dir=path.dirname(file),read=p=>fs.readFileSync(p),save=r=>{fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
if(fs.existsSync(file)&&!fs.lstatSync(file).isFile())throw Error('regular_practice_receipt_required');
let record=fs.existsSync(file)?JSON.parse(read(file)):null;
if(phase==='prepare'){
 record=preparePractice({...identity,date:hireDate(),sourceCommit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runId:process.env.GITHUB_RUN_ID,read,existing:record});save(record);
}else{
 if(!record)throw Error('practice_claim_required');
 const committed=execFileSync('git',['show','HEAD:'+file],{encoding:'utf8'});
 if(committed!==read(file).toString('utf8'))throw Error('exact_committed_practice_claim_required');
 const claimToken=process.env.GITHUB_TOKEN;
 if(!claimToken)throw Error('authenticated_bridge_read_identity_required');
 const root='https://api.github.com/repos/ltzyz2181-collab/ltzzz',headers={Authorization:'Bearer '+claimToken,Accept:'application/vnd.github+json'};
 const fetchJSON=async p=>{const r=await fetch(root+p,{headers,redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('authenticated_bridge_read_failed');return r.json();};
 let claim;
 for(let attempt=0;attempt<3;attempt++){
  try{const f=await fetchJSON('/contents/knowledge/results/controller-commands/'+identity.command_id+'.json?ref='+encodeURIComponent('controller-commands/'+identity.command_id));
   if(f.encoding!=='base64'||typeof f.content!=='string'||f.content.length>16000)throw Error('bounded_bridge_receipt_required');
   claim=JSON.parse(Buffer.from(f.content,'base64').toString('utf8'));break;
  }catch{if(attempt===2)throw Error('bridge_claim_not_readable_no_payment');await new Promise(r=>setTimeout(r,2000));}
 }
 if(!/^\d{1,20}$/.test(claim.run_id||''))throw Error('bridge_run_identity_invalid_no_payment');
 const bridgeRun=await fetchJSON('/actions/runs/'+claim.run_id);validatePracticeBridgeClaim(record,{claim,run:bridgeRun,childSource:process.env.GITHUB_SHA});
 const token=runnerToken();if(!token){record.status='blocked_existing_runner_identity_missing';save(record);}
 else{
  const acceptedInputs=[];
  for(const folder of ['knowledge/results/controller-practice','knowledge/results/owner-external','knowledge/results/claude-team']){
   if(!fs.existsSync(folder))continue;
   for(const name of fs.readdirSync(folder).filter(x=>x.endsWith('.json'))){
    const p=path.join(folder,name);if(p===file||!fs.lstatSync(p).isFile())continue;
    try{const r=JSON.parse(read(p));if((r.delivery_accepted===true||r.order?.delivery_accepted===true)&&r.mode==='external'&&/^[a-f0-9]{64}$/.test(r.context?.input_sha256||''))acceptedInputs.push(r.context.input_sha256);}catch{}
   }
  }
  const snapshot=await pulseSnapshot(),gate=pulseGate(snapshot,'doubao'),key=process.env.DOUBAO_API_KEY||process.env.ARK_API_KEY;
  const {callAgent}=await import('./call-doubao.mjs');
  record=await executePractice(record,{api:(p,b)=>wep3Request(p,{token,...(b?{body:b}:{})}),read,save,acceptedInputs,
   reviewerConfigured:!!key,pulseReady:snapshot.available&&gate.allowed&&gate.state==='fresh',
   callReviewer:prompt=>callAgent({apiKey:key,prompt,maxTokens:2400,thinking:'disabled'})});
  record.latest_run_id=process.env.GITHUB_RUN_ID;record.latest_at_utc=new Date().toISOString();save(record);
 }
}
console.log(JSON.stringify({command_id:identity.command_id,task_id:identity.task_id,path:file,status:record.status,paid:record.paid===true,tx_hash:record.tx_hash||null,delivery_accepted:record.delivery_accepted===true}));
if(phase==='execute'&&record.delivery_accepted!==true&&!['same_input_already_accepted_no_repurchase'].includes(record.status))process.exitCode=1;
