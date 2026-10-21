import {createHash} from 'node:crypto';
import {evaluateContract,negativeControls,CONTRACT_PREDICATE_REVISION} from './provided-contract.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const reads=new Set(['/health','/market/treasury','/market/aave/status','/market/runner/readiness']);
export function validateReadonlyTests(tests){
 if(!Array.isArray(tests)||tests.length!==8)throw Error('eight_existing_tests_required');
 const ids=new Set();
 for(const t of tests){
  if(typeof t.id!=='string'||!t.id||ids.has(t.id)||!['public','wrong','valid'].includes(t.auth)||!Number.isInteger(t.expected_http)||!t.expected_json||!Object.keys(t.expected_json).length)throw Error('invalid_readonly_contract');ids.add(t.id);
  if(t.method==='GET'&&reads.has(t.path)&&t.body==null)continue;
  const body=t.body;
  if(t.method!=='POST'||t.path!=='/market/aave/preview'||body?.action!=='supply'||body?.amount_usdc!=='1'||typeof body.intent_id!=='string'||Object.keys(body).some(k=>!['intent_id','action','amount_usdc','to'].includes(k))||('to' in body&&body.to!=='0x0000000000000000000000000000000000000000'))throw Error('not_readonly_contract');
 }
 return tests;
}
export async function runReadonlyContract({tests,token,fetcher=fetch}){
 validateReadonlyTests(tests);if(!token)throw Error('runner_auth_required');
 const checks=[];
 for(const t of tests){
  const headers={'Content-Type':'application/json'};
  if(t.auth==='wrong')headers['X-Lab-Pin']='incorrect-contract-pin';
  if(t.auth==='valid')headers['X-Lab-Pin']=token;
  const r=await fetcher('https://ltzzz-wep3.ltzyz2181.workers.dev'+t.path,{method:t.method,headers,body:t.method==='POST'?JSON.stringify(t.body):undefined,signal:AbortSignal.timeout(60000)});
  const raw=await r.text(),json=JSON.parse(raw),comparison=evaluateContract(t,r.status,json);
  checks.push({id:t.id,path:t.path,method:t.method,auth_kind:t.auth,observed_at:new Date().toISOString(),http:r.status,expected_http:t.expected_http,comparison,passed:comparison.passed,response_sha256:sha(raw)});
 }
 const negative_controls=negativeControls();
 return {predicate_revision:CONTRACT_PREDICATE_REVISION,checks,negative_controls,status:checks.every(c=>c.passed)&&negative_controls.passed?'readonly_contract_verified':'readonly_contract_failed',model_calls:0,settlement_performed:false,paid:false,tx_hash:null};
}
