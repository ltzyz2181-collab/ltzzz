import {TREASURY} from './funded-invest-runtime.mjs';
import {matchesContract,negativeControls} from './provided-contract.mjs';
export function canonicalEight(){
 const preview={intent_id:'CONTRACT_TEST_INTENT_OWNER_20261020',action:'supply',amount_usdc:'1'};
 const rows=[
  ['GET','/health','public',null,200,{ok:true}],
  ['GET','/market/treasury','public',null,200,{ok:true,controlled:true,address:TREASURY}],
  ['GET','/market/aave/status','public',null,200,{ok:true,chain_id:8453}],
  ['GET','/market/runner/readiness','public',null,200,{authenticated:false}],
  ['GET','/market/runner/readiness','valid',null,200,{authenticated:true}],
  ['POST','/market/aave/preview','public',preview,401,{error:'pin_required'}],
  ['POST','/market/aave/preview','wrong',preview,401,{error:'pin_required'}],
  ['POST','/market/aave/preview','valid',{...preview,to:'0x0000000000000000000000000000000000000000'},422,{error:'arbitrary_transaction_parameters_forbidden'}]
 ];
 return rows.map((r,i)=>({id:'T0'+(i+1),method:r[0],path:r[1],auth:r[2],body:r[3],expected_http:r[4],expected_json:r[5]}));
}
export async function liveEight({base,token,fetcher=fetch}){
 if(!token)throw Error('runner_identity_missing');const checks=[];
 for(const test of canonicalEight()){
  const headers={'Content-Type':'application/json'};
  if(test.auth==='valid')headers['X-Lab-Pin']=token;
  if(test.auth==='wrong')headers['X-Lab-Pin']='wrong-contract-pin';
  const check={id:test.id,method:test.method,path:test.path,authentication_case:test.auth,expected_http:test.expected_http,expected_json:test.expected_json};
  try{
   const response=await fetcher(base+test.path,{method:test.method,headers,...(test.body?{body:JSON.stringify(test.body)}:{}),redirect:'error',signal:AbortSignal.timeout(30000)});
   check.http=response.status;const data=await response.json();
   check.actual=Object.fromEntries(Object.keys(test.expected_json).map(k=>[k,data?.[k]??null]));
   check.passed=!!data&&matchesContract(test,response.status,data);
  }catch{check.passed=false;check.error='network_or_invalid_JSON';}
  checks.push(check);
 }
 const negative_controls=negativeControls();return {at:new Date().toISOString(),kind:'provided_spec_live_HTTP_regression_not_original_design',transactions:0,model_calls:0,checks,passed:checks.length===8&&checks.every(t=>t.passed)&&negative_controls.passed,negative_controls};
}
