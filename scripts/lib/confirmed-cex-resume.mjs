export function confirmedCexResume(round,capital,claims){
 if(round?.order_id!=='OWNER-FUNDED-20261017-01'||capital?.id!=='OKX-FUND-20261017-001'||capital.status!=='confirmed'||capital.amount_raw!=='20000000'||capital.destination!=='0x217ba12313a5555b3bd6d4cf64893f74e8fba117'||capital.chain_id!==8453||!/^0x[0-9a-fA-F]{64}$/.test(capital.tx_hash||''))return {eligible:false,reason:'existing_confirmed_fixed_capital_required'};
 if(!Array.isArray(round.cex)||round.cex.length!==4||new Set(round.cex.map(x=>x.id)).size!==4||round.cex.some(x=>!['gpt','grok','doubao','deepseek'].includes(x.id)||!/^\d+$/.test(x.amount_raw))||round.cex.reduce((s,x)=>s+BigInt(x.amount_raw),0n)>20000000n)return {eligible:false,reason:'frozen_cex_budget_invalid'};
 if(round.cex.every(x=>claims[x.id]&&['filled','partially_filled','canceled_unfilled'].includes(claims[x.id].state)))return {eligible:false,reason:'fixed_round_already_terminal'};
 return {eligible:true,reason:'resume_original_confirmed_capital_only',new_funding_authorizations:0,new_model_requests:0};
}
