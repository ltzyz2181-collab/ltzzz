import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {readSignerStatusWithPropagation} from './lib/signer-status-readback.mjs';
import {verifyMessage} from 'ethers';
import {OPERATING_TREASURY,SIGNER_PROOF_REVISION} from '../wep3-signer-proof.js';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev';
const phase=process.argv[2],run=process.env.GITHUB_RUN_ID,sha=process.env.GITHUB_SHA;
if(!['before','after'].includes(phase)||process.env.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||process.env.GITHUB_REF!=='refs/heads/main'||!/^[0-9]+$/.test(run||'')||!/^[a-f0-9]{40}$/.test(sha||''))throw Error('trusted_main_maintenance_context_required');
if(!process.env.CLOUDFLARE_API_TOKEN)throw Error('existing_cloudflare_identity_unavailable');
const statusOnlyRelease=execFileSync('git',['show','-s','--format=%B',sha],{encoding:'utf8'}).includes('[signer-status-readback]');
const signerProducerFiles=['wep3-worker.js','wep3-market.js','wep3-signer-status.js','wep3-aave.js','lib/financial-exit-guard.js','wrangler.wep3.toml'];
function signerProducerSourceMatches(observed){
  if(observed===sha)return true;
  if(!/^[a-f0-9]{40}$/.test(observed||''))return false;
  try{execFileSync('git',['merge-base','--is-ancestor',observed,sha],{stdio:'ignore'});execFileSync('git',['diff','--quiet',observed,sha,'--',...signerProducerFiles],{stdio:'ignore'});return true;}catch{return false;}
}
const token=crypto.createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex');
const dir='knowledge/results/wep3',path=dir+'/atomic-maintenance-'+run+'.json';
fs.mkdirSync(dir,{recursive:true});
async function json(path,options={}){const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(20000)});let body;try{body=await r.json();}catch{body={error:'non_json_response'};}return{http:r.status,body};}
async function snapshot(){const r=await json('/market/runtime-state',{headers:{'X-Lab-Pin':token}});if(r.http!==200||!r.body.ok||!/^[a-f0-9]{64}$/.test(r.body.book_sha256||''))throw Error('existing_financial_book_readback_unavailable');return Object.fromEntries(['ok','market_runtime_revision','aave_runtime_revision','procurement_runtime_revision','daily_hire_revision','book_sha256','order_count','ledger_count','live_revenue_cents','aave_intent_count','first_supply_confirmed','exit_test_confirmed','active_intent'].map(k=>[k,r.body[k]]));}
if(phase==='before'){
  const report={task_id:'WEP3-SWARM-TREE-2026-10-27',execution_id:run,source_commit:sha,at_utc:new Date().toISOString(),status:'maintenance_reserved_before_deploy',before:await snapshot(),model_calls:0,transactions_sent:0,paid:false,tx_hash:null};
  if(statusOnlyRelease){report.task_id='PLAN-PATCHGATE-ESCROW-20261023';report.release_kind='signer_status_readonly';}
  fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');
}else{
  const report=JSON.parse(fs.readFileSync(path,'utf8'));
  let health;
  for(let attempt=0;attempt<12;attempt++){health=await json('/health');if(health.http===200&&health.body.runtime_revision==='wep3-atomic-repair-v1'&&health.body.source_commit===sha)break;if(attempt<11)await new Promise(r=>setTimeout(r,2500));}
  report.health=health;report.after=await snapshot();report.financial_book_unchanged=report.before.book_sha256===report.after.book_sha256;
  if(statusOnlyRelease){
    report.signer_status=await readSignerStatusWithPropagation({base,token,sourceCommit:sha,sourceCommitMatcher:signerProducerSourceMatches});
    report.signer_status.producer_source={expected_worker_commit:sha,files_compared:signerProducerFiles,observed_commits:[...new Set(report.signer_status.rows.map(row=>row.observed.source_commit).filter(Boolean))],equivalent:report.signer_status.rows.every(row=>row.source_commit_match==='exact'||row.source_commit_match==='producer_code_equivalent')};
    report.after=await snapshot();report.financial_book_unchanged=report.before.book_sha256===report.after.book_sha256;
    report.ok=health.http===200&&health.body.source_commit===sha&&health.body.signer_status_revision==='wep3-signer-status-v1'&&health.body.atomic_ledger_ready===false&&health.body.legacy_writes_enabled===false&&report.financial_book_unchanged&&report.signer_status.ok;
    report.new_signatures=0;report.status=report.ok?'signer_status_producer_deployed_readback_verified':'signer_status_readback_failed';report.completed_at_utc=new Date().toISOString();
    fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');
    console.log(JSON.stringify({status:report.status,source_commit:sha,book_unchanged:report.financial_book_unchanged,model_calls:0,transactions:0,paid:false,tx_hash:null}));
    if(!report.ok)process.exitCode=1;
  }else{
  const nonce=crypto.randomBytes(32).toString('hex');
  const anonymous=await json('/treasury/signer-proof?nonce='+nonce);
  const signer=await json('/treasury/signer-proof?nonce='+nonce,{headers:{'X-Lab-Pin':token}});
  let recovered=null;try{recovered=verifyMessage(signer.body.message,signer.body.signature);}catch{}
  const expectedMessage=['LTZZZ operating treasury identity proof only','Not login, payment, permit, transaction or five-signature wallet authorization','origin='+base,'chain_id=8453','address='+OPERATING_TREASURY,'nonce='+nonce,'issued_at='+signer.body.issued_at].join('\n');
  report.signer_proof={anonymous_http:anonymous.http,http:signer.http,body:signer.body,recovered_address:recovered,verified:anonymous.http===401&&signer.http===200&&signer.body.ok===true&&signer.body.revision===SIGNER_PROOF_REVISION&&signer.body.source_commit===sha&&signer.body.nonce===nonce&&signer.body.message===expectedMessage&&recovered?.toLowerCase()===OPERATING_TREASURY.toLowerCase()&&signer.body.chain_id===8453&&signer.body.transaction_adapter_ready===false&&signer.body.transactions===0};
  const checks=[];
  // The release must be read-only until the separate legacy freeze/drain and migration is evidenced.
  const guarded=health.http===200&&health.body.runtime_revision==='wep3-atomic-repair-v1'&&health.body.source_commit===sha&&health.body.atomic_ledger_ready===false&&health.body.legacy_writes_enabled===false;
  if(guarded){
    for(const route of ['/swarm/spawn','/swarm/tree']){
      const headers={'Content-Type':'application/json','Idempotency-Key':'maintenance-'+run};if(process.env.LAB_PIN)headers['X-Lab-Pin']=process.env.LAB_PIN;
      const r=await json(route,{method:'POST',headers,body:JSON.stringify({parent_intent_id:'maintenance-nonexistent-'+run,poster:'Grok',skill:'copy',max_usd:'0.000001',plan:[{skill:'copy',max_usd:'0.000001'}]})});
      checks.push({route,http:r.http,error:r.body.error,authenticated:Boolean(process.env.LAB_PIN),passed:process.env.LAB_PIN?r.http===503&&r.body.error==='legacy_cutover_not_confirmed':r.http===401});
    }
  }
  report.guarded_routes=checks;report.authenticated_guard_probe_verified=Boolean(process.env.LAB_PIN)&&checks.length===2&&checks.every(x=>x.passed);
  report.code_deployed=guarded;report.swarm_live_writes_enabled=false;report.legacy_cutover_completed=false;report.completed_at_utc=new Date().toISOString();
  report.ok=guarded&&report.financial_book_unchanged&&checks.length===2&&checks.every(x=>x.passed)&&report.signer_proof.verified;
  report.status=report.ok?'guarded_repair_deployed_cutover_pending':'maintenance_verification_failed';
  fs.writeFileSync(path,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,source_commit:sha,book_unchanged:report.financial_book_unchanged,authenticated_guard_probe_verified:report.authenticated_guard_probe_verified,paid:false,tx_hash:null}));
  if(!report.ok)process.exitCode=1;
  }
}
