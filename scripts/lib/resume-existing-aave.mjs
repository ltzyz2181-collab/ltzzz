import {TREASURY,confirmedAaveAllocation} from './funded-invest-runtime.mjs';
import {OWNER_CHILD} from '../../wep3-owner-child-allocation.js';
export const EXISTING_AAVE={id:'AAVE-AUTO-bounded_supply-2026-10-18',amount:'32.490856',amount_raw:'32490856',approval:'0xb8b5fd765f308c27ff8dd0a38470f6970f0763d7322833ceec4269485f2e5e3f'};
// Resume only the exact already reserved intent observed in inspection39099828928.
// No new ID, budget, policy, replacement signature or raw-envelope logging.
export async function resumeExistingAave({api,relay,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
 const C=EXISTING_AAVE,state=await api('/market/runtime-state');
 if(!state.active_intent)return {status:'already_clear',new_order:false,model_calls:0};
 if(state.active_intent===OWNER_CHILD.intent_id)return {status:'original_child_already_active',new_order:false,model_calls:0};
 if(state.active_intent!==C.id)throw Error('different_active_intent_requires_review');
 const prior=await api('/market/aave/intent?id='+C.id),approval=prior.steps?.find(s=>s.kind==='approve');
 if(prior.intent_id!==C.id||prior.action!=='supply'||prior.amount_usdc!==C.amount||prior.chain_id!==8453||prior.treasury?.toLowerCase()!==TREASURY.toLowerCase()||prior.position_owner?.toLowerCase()!==TREASURY.toLowerCase()||approval?.tx_hash!==C.approval||approval.status!=='confirmed'||approval.receipt_status!==1||prior.steps?.map(s=>s.kind).join(',')!=='approve,supply'||!['prepared','pending','pending_confirmations'].includes(prior.status))throw Error('existing_Aave_prerequisite_identity_mismatch');
 const input={intent_id:C.id,action:'supply',amount_usdc:C.amount};let current=prior;
 for(let attempt=0;attempt<6;attempt++){
  try{current=await api('/market/aave/execute',input);}catch{current=await api('/market/aave/intent?id='+C.id);}
  if(confirmedAaveAllocation(current,{amount_raw:C.amount_raw},C.id))return {status:'confirmed_existing_reserved_intent',intent_id:C.id,amount_usdc:C.amount,tx_hash:current.steps.find(s=>s.kind==='supply').tx_hash,new_order:false,model_calls:0};
  if(!['prepared','pending','pending_confirmations'].includes(current.status))throw Error('existing_Aave_prerequisite_not_confirmed');
  await relay({kind:'aave',intent_id:C.id,amount_raw:C.amount_raw});await pause(3000);
 }
 throw Error('existing_Aave_prerequisite_pending_same_intent_preserved');
}
