import {Interface} from 'ethers';

// Owner's explicit child-wallet correction applies only to the unspent original
// DeepSeek allocation. Neither recipient nor amount is a request parameter.
export const OWNER_CHILD={round:'OWNER-FUNDED-20261017-01',intent_id:'INV-fe28aa6c968aaa540cba74b1b4f158e4f436d9e3',amount_raw:'4496788',treasury:'0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d',beneficiary:'0xbc24b9a2d0c61705602257565d8c0064effe253e',pool:'0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',usdc:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',ausdc:'0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB'};
const supply=new Interface(['function supply(address,uint256,address,uint16)','event Supply(address indexed reserve,address user,address indexed onBehalfOf,uint256 amount,uint16 indexed referralCode)']);
const token=new Interface(['event Transfer(address indexed from,address indexed to,uint256 value)']);
const prior=[['INV-985360f41d83e919d157092a4a38d9d5b4651bda','4539615'],['INV-0b819cd71966b197273bcb0e5c80f0064936475c','4882227'],['INV-51bbfff39eb96a28ce40aabb2b7f1548818dbecb','6081370']];
const same=(a,b)=>typeof a==='string'&&a.toLowerCase()===b.toLowerCase();
export const isOwnerChildId=id=>id===OWNER_CHILD.intent_id;
export function ownerChildRecipient(i){
 if(!isOwnerChildId(i.id))return i.treasury;
 if(i.action!=='supply'||i.amount_raw!==OWNER_CHILD.amount_raw||!same(i.treasury,OWNER_CHILD.treasury)||i.beneficiary!==OWNER_CHILD.beneficiary||i.round!==OWNER_CHILD.round)throw Error('fixed_owner_child_allocation_mismatch');
 return OWNER_CHILD.beneficiary;
}
export function verifyOwnerChildBasis(book){
 for(const [id,amount] of prior){const i=book.aave?.intents?.[id],step=i?.steps?.find(s=>s.kind==='supply');
  if(i?.id!==id||i.action!=='supply'||i.amount_raw!==amount||!same(i.treasury,OWNER_CHILD.treasury)||i.status!=='confirmed'||step?.status!=='confirmed'||step.receipt_status!==1||!/^0x[0-9a-fA-F]{64}$/.test(step.tx_hash||'')||!same(step.to,OWNER_CHILD.pool)||step.data!==supply.encodeFunctionData('supply',[OWNER_CHILD.usdc,BigInt(amount),OWNER_CHILD.treasury,0]))throw Error('original_three_confirmed_allocations_required');
 }
 if(prior.reduce((n,[,a])=>n+BigInt(a),0n)+BigInt(OWNER_CHILD.amount_raw)!==20000000n)throw Error('original_round_budget_mismatch');
}
export function ownerChildSupplyProof(receipt){
 if(![1,'0x1'].includes(receipt?.status))return null;
 let supplied=false,minted=null;
 for(const log of receipt?.logs||[]){
  try{if(same(log.address,OWNER_CHILD.pool)){const p=supply.parseLog(log);if(p?.name==='Supply'&&same(p.args.reserve,OWNER_CHILD.usdc)&&same(p.args.user,OWNER_CHILD.treasury)&&same(p.args.onBehalfOf,OWNER_CHILD.beneficiary)&&p.args.amount===BigInt(OWNER_CHILD.amount_raw)&&p.args.referralCode===0n)supplied=true;}
   if(same(log.address,OWNER_CHILD.ausdc)){const p=token.parseLog(log);if(p?.name==='Transfer'&&same(p.args.from,'0x0000000000000000000000000000000000000000')&&same(p.args.to,OWNER_CHILD.beneficiary)&&p.args.value>0n)minted=p.args.value.toString();}
  }catch{}
 }
 return supplied&&minted?{verified:true,position_owner:OWNER_CHILD.beneficiary,funding_treasury:OWNER_CHILD.treasury,amount_raw:OWNER_CHILD.amount_raw,mint_event_value_raw:minted}:null;
}
export function recordOwnerChildPosition(state,i){
 if(!isOwnerChildId(i.id))throw Error('fixed_owner_child_allocation_required');ownerChildRecipient(i);const step=i.steps.find(s=>s.kind==='supply'),proof=step?.child_supply_proof;if(step?.status!=='confirmed'||step.receipt_status!==1||proof?.verified!==true||proof.position_owner!==OWNER_CHILD.beneficiary||proof.funding_treasury!==OWNER_CHILD.treasury||proof.amount_raw!==OWNER_CHILD.amount_raw||!/^\d+$/.test(proof.mint_event_value_raw)||BigInt(proof.mint_event_value_raw)<=0n)throw Error('verified_child_supply_required');
 state.beneficiary_positions||={};const p=state.beneficiary_positions[OWNER_CHILD.beneficiary]||={principal_raw:'0',allocations:{},treasury_can_withdraw:false};
 const existing=p.allocations[i.id];if(existing){if(existing.amount_raw!==i.amount_raw||existing.tx_hash!==step.tx_hash)throw Error('child_allocation_accounting_conflict');return false;}
 p.allocations[i.id]={round:OWNER_CHILD.round,amount_raw:i.amount_raw,tx_hash:step.tx_hash,funding_treasury:i.treasury,position_owner:OWNER_CHILD.beneficiary,gas_payer:i.treasury};p.principal_raw=(BigInt(p.principal_raw)+BigInt(i.amount_raw)).toString();return true;
}
