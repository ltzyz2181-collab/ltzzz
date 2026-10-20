import {TREASURY} from './funded-invest-runtime.mjs';
import {PROVIDER} from './external-procurement-preflight.mjs';
export const OWNER_HIRE={id:'OWNER-EXT-AI-20261020-01',date:'2026-10-20',max_raw:'50000'};
export function assertOwnerPayment(order){
 if(!order?.paid)return;
 if(order.payer?.toLowerCase()!==TREASURY.toLowerCase()||order.pay_to?.toLowerCase()!==PROVIDER.payTo||!/^[1-9]\d*$/.test(order.amount_raw||'')||BigInt(order.amount_raw)>50000n||!/^0x[0-9a-fA-F]{64}$/.test(order.tx_hash||'')||order.payment_proof?.verified!==true||order.payment_proof.tx_hash!==order.tx_hash)throw Error('payment_identity_amount_or_chain_proof_unverified');
}
