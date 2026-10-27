// LTZZZ M1: fixed-recipient unpaid practice only. No wallets, chains, orders or payment APIs.
import {createHash} from 'node:crypto';
export const TASK_ID='PLAN-EXTERNAL-MARKETS-20261024';
export const APPLICATION_KEY=TASK_ID+':2hives:team-application:v1';
const TO='info@2hives.com',SUBJECT='agent application',DAY=86400000;
const hash=value=>createHash('sha256').update(typeof value==='string'?value:JSON.stringify(value)).digest('hex');
const H=/^[a-f0-9]{64}$/;
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const secretLike=text=>/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|cfut_|ugig_live_)[A-Za-z0-9_-]{16,}|(?:api[_-]?key|password|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_+\/-]{16,}|https?:\/\/[^\s]+(?:[?&](?:token|key|secret|signature)=)/i.test(text);
const deny=reason=>({status:'blocked_no_external_action',reason,external_requests:0,paid:false,tx_hash:null});

export function validatePracticePolicy(policy){
 return policy?.schema==='ltzzz.external-market-m1.v1'&&policy.task_id===TASK_ID
  &&policy.platform==='2hives'&&policy.registration_transport==='official_email'
  &&policy.max_project_applications===1&&policy.outbound_funds_enabled===false
  &&policy.wallet_signatures_enabled===false&&policy.deposit_raw==='0'
  &&policy.fee_raw==='0'&&policy.buyer_orders_enabled===false;
}
export function isClawTaskExplicitlyFree({config,task}={}){
 // A global free-mode banner does not erase the live API's contradictory stake=10 field.
 return config?.free_tasks_only===true&&config.stake_percent===0
  &&task?.status==='open'&&['0','0.00','0.000000'].includes(String(task.amount))
  &&task.stake_required===false&&task.requires_wallet_signature===false
  &&task.deposit_raw==='0'&&task.fee_raw==='0';
}
export function prepareTeamApplication(input,{operatorEmail}={}){
 if(!input||Object.keys(input).sort().join(',')!=='capabilities,handle,sample_summary,sample_url'||!email.test(operatorEmail||''))throw Error('truthful_operator_and_exact_application_fields_required');
 if(!/^ltzzz(?:-[a-z0-9]+)*$/.test(input.handle||'')||!Array.isArray(input.capabilities)||input.capabilities.length<1||input.capabilities.length>6||input.capabilities.some(x=>typeof x!=='string'||!x||x.length>120))throw Error('bounded_project_identity_required');
 let sample;try{sample=new URL(input.sample_url);}catch{throw Error('owned_public_sample_required');}
 if(sample.protocol!=='https:'||sample.hostname!=='github.com'||!sample.pathname.startsWith('/ltzyz2181-collab/ltzzz/')||sample.username||sample.password||sample.port||sample.search||sample.hash)throw Error('owned_public_sample_required');
 if(typeof input.sample_summary!=='string'||input.sample_summary.length<20||input.sample_summary.length>1000)throw Error('short_public_sample_summary_required');
 const body=[
 'Hello 2hives team,',
 'We would like to apply as one LTZZZ AI-assisted project team for unpaid volunteer practice.',
 'Handle: '+input.handle,
 'Platform: https://github.com/ltzyz2181-collab/ltzzz',
 'Operator contact: '+operatorEmail,
 'Operator location: Guangzhou, China. We do not claim another region.',
 'Capabilities: '+input.capabilities.join('; '),
 'Public sample: '+input.sample_url,
 input.sample_summary,
 'GPT coordinates. Doubao and Kimi are proposed execution roles, not claims that they have accepted this engagement.',
 'We accept only tasks with zero fees, zero deposit, zero outgoing transfer and no wallet signature.',
 'Please first provide the scored trial and its exact package/reference/deadline. We have not received or completed a trial.',
 'Please confirm whether inference and cross-provider review using the proposed AI providers is permitted. Do not send confidential material incompatible with that processing.',
 'We will not treat application receipt as acceptance, claim earnings or initiate any payment.',
 'Thank you.'].join('\n\n');
 if(secretLike(body))throw Error('sensitive_material_not_allowed_in_application');
 return {to:TO,subject:SUBJECT,body};
}


export function existingApplicationFromReadback({receipt,readback}={}){
 if(receipt?.schema!=='ltzzz.external-market.application.v1'||receipt.task_id!==TASK_ID||receipt.platform!=='2hives'
  ||receipt.recipient!==TO||receipt.subject!==SUBJECT||receipt.status!=='application_sent_waiting_platform_trial'
  ||typeof receipt.gmail_message_id!=='string'||!receipt.gmail_message_id
  ||readback?.metadata_source!=='connected_mailbox_message_readback'||readback.id!==receipt.gmail_message_id
  ||readback.to!==TO||readback.subject!==SUBJECT||!Array.isArray(readback.labels)||!readback.labels.includes('SENT'))throw Error('actual_existing_application_readback_required');
 return {task_id:TASK_ID,idempotency_key:APPLICATION_KEY,intent_sha256:H.test(readback.body_sha256||'')?readback.body_sha256:null,
  status:'application_sent_waiting_external_trial',message_id:receipt.gmail_message_id,existing_source_receipt:true,
  registered_market_account:false,trial_received:false,work_submitted:false,externally_accepted:false,paid:false,tx_hash:null};
}

// These callbacks are deployment-owned capabilities, not methods accepted from an HTTP requester.
// Store transactions must be durable and serializable. sendMail must be bound to the selected
// authenticated project mailbox; it must never log body, credentials or raw provider errors.
export function createM1PracticeService({policy,store,authenticatedMailbox,loadExistingApplication,sendMail,clock=Date.now}={}){
 policy=structuredClone(policy);
 const enabled=()=>validatePracticePolicy(policy)&&policy.enabled===true;
 return {
  async registerTeam(input){
   if(!enabled())return deny('M1_default_off_or_zero_outflow_policy_invalid');
   if(!store?.transaction||typeof authenticatedMailbox!=='function'||typeof loadExistingApplication!=='function'||typeof sendMail!=='function')return deny('durable_registration_and_existing_mailbox_required');
   let mail,registered=false;
   try{
    const mailbox=await authenticatedMailbox();
    if(mailbox?.authenticated!==true||mailbox.metadata_source!=='connected_mailbox_profile'||!email.test(mailbox.email||''))return deny('actual_connected_operator_mailbox_required');
    mail=prepareTeamApplication(structuredClone(input),{operatorEmail:mailbox.email});
    const prior=await loadExistingApplication();
    let existingRow=null;
    if(prior?.receipt)existingRow=existingApplicationFromReadback(prior);
    else if(prior?.status!=='not_found'||prior.metadata_source!=='connected_mailbox_sent_search'||prior.recipient!==TO||prior.subject!==SUBJECT)throw Error('existing_sent_application_search_required');
    const intent=hash(mail),reservation=await store.transaction(async tx=>{
     const old=await tx.get(APPLICATION_KEY);
     if(old)return {existing:old};
     if(existingRow){await tx.put(APPLICATION_KEY,existingRow);return {existing:existingRow};}
     const row={task_id:TASK_ID,idempotency_key:APPLICATION_KEY,intent_sha256:intent,
      status:'reserved_before_application_send',created_at_utc:new Date(clock()).toISOString(),
      mailbox_identity_sha256:hash(mailbox.email.toLowerCase()),message_id:null,
      registered_market_account:false,trial_received:false,work_submitted:false,externally_accepted:false,paid:false,tx_hash:null};
     await tx.put(APPLICATION_KEY,row);return {reserved:true};
    });
    if(reservation.existing)return {status:reservation.existing.existing_source_receipt===true||reservation.existing.intent_sha256===intent?'existing_application_reconcile_only':'registration_identity_or_intent_changed',external_requests:0,automatic_retry:false,paid:false,tx_hash:null};
    registered=true;
    const response=await sendMail(mail);
    if(typeof response?.id!=='string'||!response.id||response.id.length>200)throw Error('mail_receipt_missing');
    await store.transaction(async tx=>{const row=await tx.get(APPLICATION_KEY);if(row?.intent_sha256!==intent)throw Error('registration_reservation_lost');row.message_id=response.id;row.status='application_sent_waiting_external_trial';row.sent_at_utc=new Date(clock()).toISOString();await tx.put(APPLICATION_KEY,row);});
    return {status:'application_sent_waiting_external_trial',message_id:response.id,external_requests:1,automatic_retry:false,registered_market_account:false,externally_accepted:false,paid:false,tx_hash:null};
   }catch{
    // Unknown send outcome must be reconciled in Sent mail using the original key/intent.
    // No retry, alternate mailbox or renamed account is launched automatically.
    return {status:registered?'application_outcome_unknown_reconcile_only':'blocked_no_external_action',reason:registered?'send_or_durable_receipt_unavailable':'invalid_application_or_mailbox',external_requests:registered?null:0,automatic_retry:false,paid:false,tx_hash:null};
   }
  },
  async status(){
   if(!store?.transaction)return deny('durable_store_unavailable');
   return store.transaction(async tx=>{const row=await tx.get(APPLICATION_KEY);return row?structuredClone(row):{task_id:TASK_ID,status:'not_applied',registered_market_account:false,trial_received:false,work_submitted:false,externally_accepted:false,paid:false,tx_hash:null};});
  }
 };
}

export function prepareFreeTrialDelivery({package:pkg,artifact,review,now=Date.now()}={}){
 if(!pkg||pkg.sender!==TO||pkg.sender_authenticated!==true||/[\r\n]/.test(pkg.subject||'')||!H.test(pkg.package_sha256||'')||!/^\[pkg-[A-Za-z0-9_-]+\](?:\s|$)/.test(pkg.subject||''))throw Error('actual_authenticated_external_package_required');
 if(pkg.fee_raw!=='0'||pkg.deposit_raw!=='0'||pkg.requires_wallet_signature!==false||pkg.outgoing_transfer_required!==false)throw Error('explicit_zero_outflow_package_required');
 if(!Number.isFinite(Date.parse(pkg.deadline_at_utc))||now>=Date.parse(pkg.deadline_at_utc))throw Error('live_external_deadline_required');
 if(typeof pkg.reference!=='string'||!/[A-Za-z0-9]/.test(pkg.reference)||!/^[-A-Za-z0-9_.:]{1,100}$/.test(pkg.reference)||typeof artifact?.text!=='string'||artifact.text.split(/\r?\n/)[0]!==pkg.reference||hash(artifact.text)!==artifact.sha256)throw Error('exact_package_reference_and_artifact_bytes_required');
 if(!pkg.subject.includes(pkg.reference))throw Error('reference_required_in_reply_subject');
 if(!review||review.verdict!=='approve'||review.artifact_sha256!==artifact.sha256||review.package_sha256!==pkg.package_sha256||!['aliyun_dashscope','volcengine_ark','deepseek','moonshot','openai','anthropic','xai'].includes(artifact.actual_provider)||!['provider_response','executor_context'].includes(artifact.metadata_source)||review.actual_provider===artifact.actual_provider||!['aliyun_dashscope','volcengine_ark','deepseek','moonshot','openai','anthropic','xai'].includes(review.actual_provider)||!H.test(review.evidence_sha256||'')||review.metadata_source!=='provider_response')throw Error('bound_other_provider_review_required');
 if(pkg.cross_provider_processing_permitted!==true)throw Error('package_processing_terms_not_satisfied');
 if(secretLike(artifact.text))throw Error('sensitive_material_not_allowed_in_deliverable');
 // A prepared reply is not sent, accepted, paid, or published. Package material must
 // stay private and be deleted under its own terms; this function writes no files.
 return {to:TO,subject:pkg.subject,body:artifact.text,status:'reply_prepared_not_sent',artifact_sha256:artifact.sha256,
  task_id:TASK_ID,paid:false,tx_hash:null,externally_accepted:false};
}

export async function inspectM1PublicReadiness({fetchImpl=fetch}={}){
 const urls=['https://clawtasks.com/api/config','https://clawtasks.com/api/bounties?status=open','https://2hives.com/agent-work/protocol'];
 const results=[];
 for(const url of urls){
  try{
   const r=await fetchImpl(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
   const text=await r.text();results.push({url,http_status:r.status,body_sha256:hash(text),bytes:Buffer.byteLength(text),
    location:r.headers?.get?.('location')??null,can_register:false,can_execute_task:false});
  }catch{results.push({url,http_status:null,error:'read_unavailable_no_retry',can_register:false,can_execute_task:false});}
 }
 return {task_id:TASK_ID,status:'public_probe_only',results,external_post_requests:0,registered_accounts:0,orders:0,signatures:0,paid:false,tx_hash:null};
}
