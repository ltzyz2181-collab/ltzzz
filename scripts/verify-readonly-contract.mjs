import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {createHash,createHmac} from 'node:crypto';
import {runReadonlyContract} from './lib/readonly-contract-check.mjs';
const sha=x=>createHash('sha256').update(x).digest('hex'),run=process.env.GITHUB_RUN_ID||'local';
const source='knowledge/results/wep3/delivery-contract-2026-10-20.json';
const report={at:new Date().toISOString(),execution_id:run,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_delivery:source,model_calls:0,transactions:0,paid:false,tx_hash:null,historical_verdict_unchanged:true,scope:'fresh_readonly_HTTP_regression_not_original_design_audit_or_settlement'};
const file=`knowledge/results/wep3/readonly-contract-${run}.json`;
try{
 if(!process.env.CLOUDFLARE_API_TOKEN)throw Error('existing_executor_credentials_required');
 const token=createHmac('sha256',process.env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex');
 const state=async()=>{const r=await fetch('https://ltzzz-wep3.ltzyz2181.workers.dev/market/runtime-state',{headers:{'X-Lab-Pin':token},signal:AbortSignal.timeout(20000)}),d=await r.json();if(!r.ok||!d.ok||!d.book_sha256)throw Error('financial_book_unverified');return d.book_sha256;};
 const bytes=fs.readFileSync(source);report.source_delivery_sha256=sha(bytes);report.predicate_source_sha256=sha(fs.readFileSync('scripts/lib/provided-contract.mjs'));
 report.before_book_sha256=await state();Object.assign(report,await runReadonlyContract({tests:JSON.parse(bytes).artifact.tests,token}));
 report.after_book_sha256=await state();report.financial_book_unchanged=report.before_book_sha256===report.after_book_sha256;
 if(!report.financial_book_unchanged)report.status='concurrent_financial_book_change_requires_reconciliation';
}catch{report.status='readonly_verification_blocked';report.error='read_only_verification_failed_no_generation_or_payment_retry';}
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
if(report.status!=='readonly_contract_verified')process.exitCode=1;
