// Agent-side machine-native payment. Explicit single intent; no seed phrases or secrets in reports.
import fs from 'node:fs';import {x402Client} from '@x402/core/client';import {ExactEvmScheme} from '@x402/evm/exact/client';import {privateKeyToAccount} from 'viem/accounts';import {decodePaymentRequiredHeader,encodePaymentSignatureHeader} from '@x402/core/http';
const intent=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
const url=new URL(intent.url);
if(url.origin!=='https://ltzzz-wep3.ltzyz2181.workers.dev'||!url.pathname.startsWith('/market/skill/')||!/^0x[a-fA-F0-9]{40}$/.test(intent.receiver||'')||!Number.isInteger(intent.max_cents)||intent.max_cents<1||intent.max_cents>200)throw Error('intent_not_allowed');
if(!process.env.AGENT_PAYMENT_KEY)throw Error('AGENT_PAYMENT_KEY_missing');
const id=intent.execution_id;if(!/^[a-zA-Z0-9_-]{16,100}$/.test(id||''))throw Error('unique_execution_id_required');
const headers={'Content-Type':'application/json','Idempotency-Key':id},body=JSON.stringify({brief:intent.brief});
let r=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(30000)});
if(r.status!==402)throw Error('payment_challenge_unavailable');
const required=decodePaymentRequiredHeader(r.headers.get('PAYMENT-REQUIRED'));
if(required.x402Version!==2||required.resource?.url!==url.toString()||Object.keys(required.extensions||{}).length)throw Error('unsupported_payment_challenge');
const c=new x402Client((v,offers)=>{const offer=offers.find(o=>o.scheme==='exact'&&o.network==='eip155:8453'&&o.asset?.toLowerCase()==='0x833589fcd6edb6e08f4c7c32d4f71b54bda02913'&&o.payTo?.toLowerCase()===intent.receiver.toLowerCase()&&/^[0-9]+$/.test(o.amount)&&BigInt(o.amount)>0n&&BigInt(o.amount)<=BigInt(intent.max_cents)*10000n&&o.extra?.name==='USD Coin'&&o.extra?.version==='2'&&(!o.extra?.assetTransferMethod||o.extra.assetTransferMethod==='eip3009'));if(!offer)throw Error('offer_over_budget_or_wrong_asset');return offer;}).register('eip155:8453',new ExactEvmScheme(privateKeyToAccount(process.env.AGENT_PAYMENT_KEY)));
const payload=await c.createPaymentPayload(required);headers['PAYMENT-SIGNATURE']=encodePaymentSignatureHeader(payload);
const report={execution_id:id,at:new Date().toISOString(),max_cents:intent.max_cents,network:'eip155:8453',settlement_mode:'x402_v2',tx_hash:null};
for(let attempt=0;attempt<4;attempt++){r=await fetch(url,{method:'POST',headers,body,signal:AbortSignal.timeout(60000)});const result=await r.json();report.status=result.status||result.error;report.order_id=result.order_id;if(result.access_token){report.status='funded_order_queued';break;}if(!result.retry_same_request)break;await new Promise(resolve=>setTimeout(resolve,5000));}
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/agent-pay-'+id+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
