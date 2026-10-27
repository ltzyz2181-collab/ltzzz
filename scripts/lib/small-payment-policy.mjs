// Deterministic USDC policy only: no IO, signatures, balances, models or transfers.
import {createHash} from 'node:crypto';
import {PAYMENT_REVIEW_PROVIDERS,paymentActivationMatches,paymentStagePercent} from './small-payment-authorization.mjs';
export const SINGLE_EXCLUSIVE_RAW=20_000_000n;
const MAX_RAW=(1n<<256n)-1n,DAY=86_400_000,OFFSET=8*3_600_000;
const ID=/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/,GROUP=/^[a-z0-9][a-z0-9._-]{0,79}$/,HASH=/^[a-f0-9]{64}$/;
const validId=v=>typeof v==='string'&&ID.test(v)&&!['__proto__','prototype','constructor'].includes(v);
const ACTIVE=new Set(['reserved','submitted','unknown','paid']),PENDING=new Set(['reserved','submitted','unknown']),CLOSED=new Set(['cancelled','rejected','failed']);
const PROVIDERS=new Set(['anthropic','aliyun_dashscope','volcengine_ark','deepseek','xai','openai','moonshot']);
const raw=v=>{if(typeof v!=='string'||!/^(?:0|[1-9]\d{0,77})$/.test(v))throw Error('noncanonical_raw_amount');const n=BigInt(v);if(n>MAX_RAW)throw Error('raw_amount_overflow');return n;};
const exact=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const unique=list=>Array.isArray(list)&&new Set(list).size===list.length;
const at=t=>{if(typeof t!=='string'||!/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(t))throw Error('UTC_time_required');const n=Date.parse(t);if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,19)!==t.slice(0,19))throw Error('invalid_UTC_time');return n;};
const hash=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
const amountFields=prefix=>['single','daily','weekly'].map(d=>prefix+d+'_raw');
export function parseUsdc6(value){
 if(typeof value!=='string'||!/^(?:0|[1-9]\d{0,70})(?:\.\d{1,6})?$/.test(value))throw Error('USDC_decimal_string_required');
 const [whole,fraction='']=value.split('.'),n=BigInt(whole)*1_000_000n+BigInt((fraction+'000000').slice(0,6));if(n>MAX_RAW)throw Error('raw_amount_overflow');return n.toString();
}
export function formatUsdc6(value){const n=typeof value==='bigint'?value:raw(value);if(n<0n||n>MAX_RAW)throw Error('raw_amount_overflow');return (n/1_000_000n).toString()+'.'+(n%1_000_000n).toString().padStart(6,'0');}
export function normalizeRecipientKey({rail,address}={}){
 if(typeof rail!=='string'||!/^[a-z0-9][a-z0-9_-]{0,39}$/.test(rail)||typeof address!=='string'||!/^0x[0-9a-fA-F]{40}$/.test(address)||/^0x0{40}$/i.test(address))throw Error('verified_EVM_recipient_required');
 return rail+':'+address.toLowerCase();
}
function historyRecipient(key){const m=/^([a-z0-9][a-z0-9_-]{0,39}):(0x[0-9a-fA-F]{40})$/.exec(key||'');if(!m)throw Error('invalid_history_recipient');return normalizeRecipientKey({rail:m[1],address:m[2]});}
function windows(now){const dayStart=Math.floor((now+OFFSET)/DAY)*DAY-OFFSET,weekday=(new Date(dayStart+OFFSET).getUTCDay()+6)%7;return {day_start_ms:dayStart,week_start_ms:dayStart-weekday*DAY,rolling_start_ms:now-DAY};}
// context is supplied by the authenticated runtime/store. Caller request contains
// no proof, review, limit, address, settlement or paid flag. Returned allow is not
// a signature, transfer or activation decision.
export function evaluateSmallPayment({request,policy,context}={}){
 const reasons=[],add=r=>{if(!reasons.includes(r))reasons.push(r);};
 const out={schema:'ltzzz.small-payment.decision.v1',decision:'blocked',allow:false,reasons,computed_caps:null,aggregation_key:null,recipient_key:null,purpose_group:null,normalized_request:null,totals:null,windows:null,financial_execution:false};
 try{
  if(policy?.schema!=='ltzzz.small-payment.policy.v1'||policy.currency!=='USDC'||policy.decimals!==6||policy.timezone!=='Asia/Shanghai')add('fixed_USDC_policy_required');
  if(policy?.enabled!==true)add('policy_disabled');
  const now=typeof context?.now==='number'&&Number.isSafeInteger(context.now)&&context.now>=0?context.now:at(context?.now);
  const required=policy?.independent_reviews?.required_providers;
  if(!unique(required)||required.length!==2||!PAYMENT_REVIEW_PROVIDERS.every(p=>required.includes(p))||!paymentActivationMatches(context?.activationProof,{policy,release_sha256:context?.release_sha256,command:context?.activationCommand??null,now}))add('independent_native_reviews_required');
  const w=windows(now);out.windows={timezone:'Asia/Shanghai',day_start_utc:new Date(w.day_start_ms).toISOString(),week_start_utc:new Date(w.week_start_ms).toISOString(),rolling_start_utc:new Date(w.rolling_start_ms).toISOString(),observed_at_utc:new Date(now).toISOString()};
  if(!exact(request,['payment_id','controller_id','payee_id','purpose_id','amount_raw','rail'])){add('unexpected_or_missing_request_fields');return out;}
  if(['payment_id','controller_id','payee_id','purpose_id'].some(k=>!validId(request[k]))){add('invalid_request_identity');return out;}
  // One canonical chain/token rail: aliases cannot split the rolling limit.
  if(request.rail!=='base_usdc'){add('unsupported_rail');return out;}
  let amount;try{amount=raw(request.amount_raw);}catch{add('invalid_amount_raw');return out;}
  if(amount<=0n)add('positive_total_debit_required');
  if(amount>=SINGLE_EXCLUSIVE_RAW)add('single_payment_must_be_less_than_20_USDC');
  const controllers=policy?.controllers,payees=policy?.payees,purposes=policy?.purposes;
  if(!Array.isArray(controllers)||!Array.isArray(payees)||!Array.isArray(purposes)||![controllers,payees,purposes].every(a=>unique(a.map(e=>e?.id)))){add('registered_whitelists_required');return out;}
  const c=controllers.find(x=>x.id===request.controller_id),p=payees.find(x=>x.id===request.payee_id),u=purposes.find(x=>x.id===request.purpose_id);
  if(!c||c.verified!==true||c.control_verified!==true||!ID.test(c.operator_id||'')||!Array.isArray(c.rails)||!c.rails.includes(request.rail))add('controller_operator_or_control_unverified');
  if(!p||p.verified!==true||p.control_verified!==true||!ID.test(p.operator_id||'')||!unique(p.controlled_by)||p.controlled_by.some(v=>!ID.test(v))||!Array.isArray(p.rails)||!p.rails.includes(request.rail))add('payee_operator_address_or_control_unverified');
  if(!u||u.verified!==true||!GROUP.test(u.group||'')||!Array.isArray(p?.purpose_ids)||!p.purpose_ids.includes(request.purpose_id))add('new_or_unverified_purpose_requires_review');
  if(!c||!p||!u)return out;
  if(c.operator_id===p.operator_id||p.controlled_by?.includes(c.id))add('self_or_same_operator_payment_not_exempt');
  // A second ID for the same address cannot discard a control relationship.
  const aliases=payees.filter(x=>typeof x.address==='string'&&x.address.toLowerCase()===String(p.address).toLowerCase());
  if(aliases.some(x=>x.operator_id!==p.operator_id||x.verified!==true||x.control_verified!==true||!Array.isArray(x.controlled_by)||x.controlled_by.includes(c.id)))add('recipient_alias_control_conflict');
  let recipient;try{recipient=normalizeRecipientKey({rail:request.rail,address:p.address});}catch{add('payee_operator_address_or_control_unverified');return out;}
  out.recipient_key=recipient;out.purpose_group=u.group;
  out.aggregation_key=hash({currency:'USDC',recipient_key:recipient,purpose_group:u.group});
  const b=context?.budgetProof;
  if(!b||b.status!=='registered'||b.schema!=='ltzzz.small-payment.budget-proof.v1'||!ID.test(b.budget_id||'')||!Array.isArray(policy?.registered_budget_ids)||!policy.registered_budget_ids.includes(b.budget_id))add('budget_not_registered');
  if(b?.verification_kind!=='authenticated_budget_limits'||typeof b?.source_ref!=='string'||!b.source_ref||b.source_ref.length>512||!HASH.test(b?.evidence_sha256||'')||b.currency!=='USDC'||b.decimals!==6||!Array.isArray(b.controller_ids)||!b.controller_ids.includes(c.id)||!Array.isArray(b.rails)||!b.rails.includes(request.rail)||!Array.isArray(b.purpose_groups)||!b.purpose_groups.includes(u.group))add('authenticated_budget_scope_proof_required');
  try{if(at(b?.verified_at)>now||at(b?.valid_until)<=now||at(b?.valid_until)<=at(b?.verified_at))add('budget_proof_expired_or_future');}catch{add('budget_proof_expired_or_future');}
  const caps={};
  try{
   for(const dimension of ['single','daily','weekly']){const registered=raw(b['limits_'+dimension+'_raw']),verified=raw(b['verified_'+dimension+'_raw']),absolute=raw(b['owner_absolute_'+dimension+'_raw']);caps[dimension]=[registered,absolute,verified*2n].reduce((x,y)=>x<y?x:y)*BigInt(paymentStagePercent(context.activationProof))/100n;}
   out.computed_caps={single_raw:caps.single.toString(),daily_raw:caps.daily.toString(),weekly_raw:caps.weekly.toString(),single_exclusive_rule_raw:SINGLE_EXCLUSIVE_RAW.toString(),stage_percent:paymentStagePercent(context.activationProof),authority:'stage_scaled_min_registered_owner_absolute_two_times_verified_not_new_authorization'};
  }catch{add('complete_registered_verified_owner_limits_required');}
  out.normalized_request={payment_id:request.payment_id,controller_id:c.id,payee_id:p.id,purpose_id:u.id,purpose_group:u.group,recipient_key:recipient,amount_raw:amount.toString(),amount_usdc:formatUsdc6(amount),rail:request.rail,currency:'USDC',budget_id:b?.budget_id||null};
  if(!Array.isArray(context?.history)){add('trusted_payment_history_required');return out;}
  let daily=0n,weekly=0n,rolling=0n;const seen=new Set();
  for(const row of context.history){
   try{
    if(!row||!validId(row.payment_id)||!validId(row.budget_id)||!validId(row.controller_id)||!validId(row.payee_id)||!GROUP.test(row.purpose_group||''))throw Error('history_identity');
    if(seen.has(row.payment_id))throw Error('history_duplicate_payment_id');seen.add(row.payment_id);
    if(row.payment_id===request.payment_id)add('payment_id_already_exists');
    const value=raw(row.amount_raw);if(value<=0n)throw Error('history_amount');
    const time=at(row.at_utc);if(time>now)throw Error('history_future_time');
    const key=historyRecipient(row.recipient_key);
    if(!ACTIVE.has(row.status)){if(!CLOSED.has(row.status)||row.closure_verified!==true)throw Error('history_status_unverified');continue;}
    const pending=PENDING.has(row.status);
    if(row.budget_id===b?.budget_id){if(pending||time>=w.day_start_ms)daily+=value;if(pending||time>=w.week_start_ms)weekly+=value;}
    if(key===recipient&&row.purpose_group===u.group&&(pending||time>=w.rolling_start_ms))rolling+=value;
   }catch{add('history_invalid_or_ambiguous');}
  }
  out.totals={daily_raw:daily.toString(),weekly_raw:weekly.toString(),recipient_purpose_24h_raw:rolling.toString(),daily_after_raw:(daily+amount).toString(),weekly_after_raw:(weekly+amount).toString(),recipient_purpose_24h_after_raw:(rolling+amount).toString(),pending_reservations_expire_by_clock:false};
  if(rolling+amount>=SINGLE_EXCLUSIVE_RAW)add('recipient_purpose_24h_total_must_be_less_than_20_USDC');
  if(out.computed_caps){if(amount>caps.single)add('registered_single_cap_exceeded');if(daily+amount>caps.daily)add('registered_daily_cap_exceeded');if(weekly+amount>caps.weekly)add('registered_weekly_cap_exceeded');}
  if(!reasons.length){out.allow=true;out.decision='eligible_for_controller_approval_not_payment';}
 }catch{add('invalid_policy_or_trusted_context');}
 return out;
}
