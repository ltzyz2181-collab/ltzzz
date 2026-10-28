// Read immutable public source as a local baseline; code samples remain strings.
// No wallet, credentials, network, production deployment or platform submission.
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as candidate from './pr278/financial-exit-inventory.mjs';
const base=process.argv[2];
if(!/^[a-f0-9]{40}$/.test(base||''))throw Error('full_baseline_commit_required');
const sha=x=>createHash('sha256').update(x).digest('hex');
const original=execFileSync('git',['show',base+':scripts/lib/financial-exit-inventory.mjs'],{encoding:'utf8'});
const baseline=await import('data:text/javascript;base64,'+Buffer.from(original).toString('base64'));
const samples=[['direct','await w.sendTransaction(tx);'],['computed','await w["sendTransaction"](tx);'],['constant_join',"await token['trans'+'fer'](recipient, amount);"],['alias','const send = w.sendTransaction; await send(tx);'],['backtick','await token[`transfer`](recipient, amount);'],['mixed_quotes',`await token['trans'+"fer"](recipient, amount);`],['computed_alias',`const send = w['send'+'Transaction']; await send(tx);`],['viem_alias','const write = client.writeContract; await write(args);']];
const check=(api,source)=>api.checkFinancialInventory({sources:[{path:'scripts/isolated-fixture.mjs',sha256:sha(source),matches:api.scanFinancialSource(source)}],inventory:{schema:'ltzzz.financial-exits.v1',exits:[]},read:()=>''});
const findings=samples.map(([id,source])=>({id,source,source_sha256:sha(source),baseline:check(baseline,source),candidate:check(candidate,source),sample_executed:false,network_calls:0}));
const result={schema:'ltzzz.m1.sandbox-challenges.v1',task_id:'PLAN-EXTERNAL-MARKETS-20261024',step_id:'M1-PR278-SANDBOX-01',baseline_commit:base,baseline_module_sha256:sha(original),candidate_module_sha256:sha(fs.readFileSync(new URL('./pr278/financial-exit-inventory.mjs',import.meta.url))),at_utc:new Date().toISOString(),node:process.version,findings,baseline_missed_samples:findings.filter(f=>f.baseline.passed).length,candidate_missed_samples:findings.filter(f=>f.candidate.passed).length,scope:'local_static_inventory_predicate_not_runtime_payment_or_production_exploit',limitations:['Lexical matching is not a complete JavaScript/Python semantic analyzer. Unknown dynamically computed names may still evade static matching.','Original source and ledger bytes are not altered; baseline verdicts remain visible.','No real external platform task or delivery, cryptographic signer enrollment or business acceptance.'],model_calls:0,paid:false,tx_hash:null,income:0,production_deployed:false};
process.stdout.write(JSON.stringify(result,null,2)+'\n');
if(result.candidate_missed_samples!==0)process.exitCode=1;
