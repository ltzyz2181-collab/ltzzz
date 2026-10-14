// USDC custody obligations are distinct from nonredeemable internal model credits.
// This is an order-level liability record, not a claim that a reserve was reconciled.
export function recordBuyerFunding(order, proof) {
  const raw = String(proof.amount_raw);
  if (!/^\d+$/.test(raw) || BigInt(raw) !== BigInt(order.amount_cents) * 10000n) throw Error('funding_amount_mismatch');
  order.usdc_contract = {
    version: 1, asset: proof.asset, chain_id: 8453, source: 'buyer_payment',
    received_raw: raw, obligation_raw: raw, state: 'fulfillment_reserved',
    funding_tx: proof.tx_hash, wages_paid: false, wages_tx_hash: null,
    internal_credit_redeemable: false, external_payout_enabled: false,
  };
}
const digest=async s=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function sealDelivery(book, order) {
  const children=[];
  for(const id of [...(order.children||[])].sort()) {
    const child=book.orders[id];
    if(!child || child.status!=='delivered' || child.parent_id!==order.id || !child.receipt)throw Error('invalid_receipt_dependency');
    children.push({order_id:id,root:child.receipt.seal?.root||await digest(JSON.stringify(child.receipt))});
  }
  const data={version:'LTZZZ-causal-seal-v1',order_id:order.id,children,
    delivery_sha256:order.receipt.deliverable_sha256,reasoning_hash:order.receipt.reasoning_hash,
    worker:order.worker,auditor:order.receipt.auditor,
    audit_authority:'authenticated_internal_runner',policy:'external-incoming-v1',
    funding:order.payment_evidence?{chain_id:8453,asset:order.payment_evidence.asset,tx_hash:order.payment_evidence.tx_hash,amount_raw:order.payment_evidence.amount_raw}:null,
    paid:false,wages_tx_hash:null};
  return {data,root:await digest(JSON.stringify(data))};
}
