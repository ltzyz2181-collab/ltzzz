import crypto from 'node:crypto';
export const BASE='https://ltzzz-wep3.ltzyz2181.workers.dev';
export const TREASURY='0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d';
export const SEATS={gpt:'GPT',grok:'Grok',doubao:'Doubao',deepseek:'DeepSeek'};
export function raw(s,d=6){if(typeof s!=='string'||!new RegExp('^\\d{1,12}(?:\\.\\d{1,'+d+'})?$').test(s))throw Error('invalid_decimal');const [a,b='']=s.split('.');return BigInt(a)*10n**BigInt(d)+BigInt(b.padEnd(d,'0'));}
export function decimal(n,d=6){const base=10n**BigInt(d);return (n/base).toString()+((n%base)?'.'+(n%base).toString().padStart(d,'0').replace(/0+$/,''):'');}
export function scoresFrom(snapshot){if(!snapshot?.ok||!Array.isArray(snapshot.reputations))throw Error('live_reputation_unavailable');return Object.entries(SEATS).map(([id,agent])=>{const rows=snapshot.reputations.filter(r=>r.agent===agent);const score=rows[0]?.score;if(rows.length!==1||!Number.isInteger(score)||score<0||score>200)throw Error('invalid_live_reputation');return {id,agent,score};});}
export function allocate(scores,budget){const eligible=scores.filter(r=>r.score>=80),sum=eligible.reduce((s,r)=>s+BigInt(r.score),0n);if(!sum)return scores.map(r=>({...r,amount_raw:'0',amount:'0'}));const shares=scores.map(r=>{const weight=r.score>=80?BigInt(r.score):0n;return {...r,amount:budget*weight/sum,remainder:budget*weight%sum};});let left=budget-shares.reduce((s,r)=>s+r.amount,0n);for(const r of [...shares].filter(r=>r.score>=80).sort((a,b)=>a.remainder>b.remainder?-1:a.remainder<b.remainder?1:a.id.localeCompare(b.id))){if(!left)break;r.amount++;left--;}
 return shares.map(({remainder,...r})=>({...r,amount_raw:r.amount.toString(),amount:decimal(r.amount)}));}
export function buildDispatch(policy,status,snapshot){
 if(policy.owner_authorized!==true||policy.cex.leverage||policy.cex.withdrawals||policy.cex.account_transfers||policy.cex.instrument!=='BTC-USDT')throw Error('owner_policy_invalid');
 if(!status?.ok||status.chain_id!==8453||status.address?.toLowerCase()!==TREASURY.toLowerCase())throw Error('live_treasury_mismatch');
 if(status.paused||status.active_intent||status.storage_status?.ok!==true)throw Error('treasury_paused_or_pending');
 const single=raw(String(status.single_cap_usdc)),exposure=raw(String(status.exposure_cap_usdc)),floor=BigInt(status.cash_floor_raw);
 if(single<=0n||exposure<=0n||floor<5000000n)throw Error('invalid_live_protocol_limits');
 const scores=scoresFrom(snapshot);const cash=BigInt(status.usdc_raw)-floor-raw(policy.external_ai.max_usdc),room=exposure-BigInt(status.ausdc_raw);
 let defiBudget=raw(policy.defi.total_usdc);if(cash<defiBudget)defiBudget=cash;if(room<defiBudget)defiBudget=room;if(defiBudget<0n)defiBudget=0n;
 const cap=single<raw(policy.defi.max_per_agent_usdc)?single:raw(policy.defi.max_per_agent_usdc);
 const web3=allocate(scores,defiBudget).map(r=>({...r,amount_raw:(BigInt(r.amount_raw)>cap?cap:BigInt(r.amount_raw)).toString(),amount:decimal(BigInt(r.amount_raw)>cap?cap:BigInt(r.amount_raw)),custody:'LTZZZ_treasury',independent_wallet_control:false}));
 return {order_id:policy.order_id,source:'live_reputation_and_current_treasury',treasury:status,scores,web3,cex:allocate(scores,raw(policy.cex.total_usdt)),seat_assignment_only:true,native_model_calls:0,created_at:new Date().toISOString()};
}
export function intentId(order,agent){return 'INV-'+crypto.createHash('sha256').update(order+'|'+agent).digest('hex').slice(0,40);}
export function clientOrderId(order,agent){return 'lz'+crypto.createHash('sha256').update(order+'|cex|'+agent).digest('hex').slice(0,28);}
export async function wep3Request(path,{body,token,fetcher=fetch}={}){const response=await fetcher(BASE+path,{method:body?'POST':'GET',headers:{'Content-Type':'application/json','X-Lab-Pin':token||''},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(120000)});let data;try{data=await response.json();}catch{throw Error('wep3_non_json_http_'+response.status);}if(!response.ok||!data.ok)throw Error('wep3_http_'+response.status+'_'+String(data.error||data.status||'failed').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100));return data;}
export function runnerToken(env=process.env){return env.WEP3_RUNNER_TOKEN||(env.CLOUDFLARE_API_TOKEN?crypto.createHmac('sha256',env.CLOUDFLARE_API_TOKEN).update('ltzzz-runner-v2').digest('hex'):'');}
