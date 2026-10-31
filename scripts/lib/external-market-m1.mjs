// LTZZZ M1: fixed-recipient unpaid practice only. No wallets, chains, orders or payment APIs.
import {createHash} from 'node:crypto';
export const TASK_ID='PLAN-EXTERNAL-MARKETS-20261024';
export const APPLICATION_KEY=TASK_ID+':2hives:team-application:v1';
const TO='info@2hives.com',SUBJECT='agent application';
export const EXISTING_APPLICATION_MESSAGE_ID='1a17cf44f3bdf73e';
const hash=value=>createHash('sha256').update(typeof value==='string'||ArrayBuffer.isView(value)?value:JSON.stringify(value)).digest('hex');
const H=/^[a-f0-9]{64}$/;
const email=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const secretLike=text=>/-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:sk-|cfut_|ugig_live_|gh[pousr]_|github_pat_|xai-)[A-Za-z0-9_-]{16,}|\bAKIA[A-Z0-9]{16}\b|\bBearer\s+[^\s]{12,}|\beyJ[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}|(?:api[_-]?key|password|app[_ -]?password|authorization)\s*[:=]\s*['"]?[A-Za-z0-9_+\/-]{12,}|https?:\/\/[^\s]+(?:[?&](?:token|key|secret|signature)=)/i.test(text);
const CAPABILITIES=new Set(['public-source verification','English/Chinese review','structured JSON validation','small Node.js regression tests']);
const freeTextAllowed=text=>typeof text==='string'&&!secretLike(text)&&!/[\r\n\u0000-\u001f]/.test(text)&&!/(?:[a-z][a-z0-9+.-]*:\/\/|(?:https?|mailto|data|javascript):|www\.|[^\s@]+@[^\s@]+\.[^\s@]+)|\b(?:accepted|registered|earnings|income|earned|paid|profit)\b|已(?:接受|注册|完成)|盈利|赚钱/i.test(text);
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
 if(!/^ltzzz(?:-[a-z0-9]+)*$/.test(input.handle||'')||!Array.isArray(input.capabilities)||input.capabilities.length<1||input.capabilities.length>6||input.capabilities.some(x=>!CAPABILITIES.has(x)))throw Error('bounded_project_identity_required');
 let sample;try{sample=new URL(input.sample_url);}catch{throw Error('owned_public_sample_required');}
 if(sample.protocol!=='https:'||sample.hostname!=='github.com'||!sample.pathname.startsWith('/ltzyz2181-collab/ltzzz/')||sample.username||sample.password||sample.port||sample.search||sample.hash)throw Error('owned_public_sample_required');
 if(typeof input.sample_summary!=='string'||input.sample_summary.length<20||input.sample_summary.length>1000||!freeTextAllowed(input.sample_summary))throw Error('short_public_sample_summary_required');
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


function canonicalApplicationReceipt(receipt){
 if(receipt?.schema!=='ltzzz.external-market.application.v1'||receipt.task_id!==TASK_ID||receipt.platform!=='2hives'||receipt.recipient!==TO||receipt.subject!==SUBJECT||receipt.status!=='application_sent_waiting_platform_trial'||receipt.gmail_message_id!==EXISTING_APPLICATION_MESSAGE_ID||receipt.gmail_thread_id!==EXISTING_APPLICATION_MESSAGE_ID)throw Error('canonical_existing_application_receipt_required');
 return structuredClone(receipt);
}
export function existingApplicationFromReadback({receipt,readback,mailboxEmail}={}){
 canonicalApplicationReceipt(receipt);
 if(readback?.metadata_source!=='connected_mailbox_message_readback'||readback.id!==EXISTING_APPLICATION_MESSAGE_ID||readback.thread_id!==EXISTING_APPLICATION_MESSAGE_ID||readback.to!==TO||readback.subject!==SUBJECT||!Array.isArray(readback.labels)||!readback.labels.includes('SENT')||readback.mailbox_email!==mailboxEmail||typeof readback.body!=='string'||!readback.body||readback.body.length>100000)throw Error('actual_existing_application_readback_required');
 return {task_id:TASK_ID,idempotency_key:APPLICATION_KEY,status:'application_sent_waiting_external_trial',send_state:'known_sent',message_id:EXISTING_APPLICATION_MESSAGE_ID,thread_id:EXISTING_APPLICATION_MESSAGE_ID,body_sha256:hash(readback.body),existing_source_receipt:true,readback_verified:true,registered_market_account:false,trial_received:false,work_submitted:false,externally_accepted:false,paid:false,tx_hash:null};
}
// This task already has a known SENT application. No sender capability is retained
// or called. These are deployment-owned read/storage capabilities, never HTTP inputs.
export function createM1PracticeService({policy,store,existingApplicationReceipt,authenticatedMailbox,loadExistingApplication,clock=Date.now}={}){
 policy=structuredClone(policy);existingApplicationReceipt=structuredClone(existingApplicationReceipt);
 const enabled=()=>validatePracticePolicy(policy)&&policy.enabled===true;
 const mailbox=async()=>{const m=await authenticatedMailbox();if(m?.authenticated!==true||m.metadata_source!=='connected_mailbox_profile'||!email.test(m.email||''))throw Error('actual_connected_operator_mailbox_required');return m;};
 const capabilities=()=>store?.transaction&&typeof authenticatedMailbox==='function';
 const result=(status,extra={})=>({status,external_requests:0,automatic_retry:false,registered_market_account:false,externally_accepted:false,paid:false,tx_hash:null,...extra});
 return {
  async registerTeam(input){
   if(!enabled())return deny('M1_default_off_or_zero_outflow_policy_invalid');
   if(!capabilities())return deny('durable_registration_and_existing_mailbox_required');
   try{
    const receipt=canonicalApplicationReceipt(existingApplicationReceipt),m=await mailbox();
    const intent=hash(prepareTeamApplication(structuredClone(input),{operatorEmail:m.email}));
    return store.transaction(async tx=>{
     const old=await tx.get(APPLICATION_KEY);
     if(old){
      if(old.mailbox_identity_sha256&&old.mailbox_identity_sha256!==hash(m.email.toLowerCase()))return result('registration_identity_or_intent_changed');
      if(old.intent_sha256&&old.intent_sha256!==intent)return result('registration_identity_or_intent_changed');
      return result('existing_application_reconcile_only',{send_state:old.send_state||(!old.message_id?'send_unknown':'known_sent'),reconciliation_required:old.readback_verified!==true});
     }
     // The immutable known message seeds the same project key BEFORE a mailbox
     // callback can report not_found. It can never be mistaken for no application.
     const row={task_id:TASK_ID,idempotency_key:APPLICATION_KEY,status:'known_application_pending_readback',send_state:'canonical_sent_receipt_present',message_id:receipt.gmail_message_id,thread_id:receipt.gmail_thread_id,existing_source_receipt:true,readback_verified:false,intent_sha256:intent,mailbox_identity_sha256:hash(m.email.toLowerCase()),created_at_utc:new Date(clock()).toISOString(),registered_market_account:false,trial_received:false,work_submitted:false,externally_accepted:false,paid:false,tx_hash:null};
     await tx.put(APPLICATION_KEY,row);return result('existing_application_reconcile_only',{reconciliation_required:true,send_state:row.send_state});
    });
   }catch{return deny('canonical_application_or_authenticated_mailbox_unavailable');}
  },
  async reconcileApplication(){
   if(!enabled())return deny('M1_default_off_or_zero_outflow_policy_invalid');
   if(!capabilities()||typeof loadExistingApplication!=='function')return deny('authenticated_readback_and_durable_store_required');
   try{
    const receipt=canonicalApplicationReceipt(existingApplicationReceipt),m=await mailbox();
    const held=await store.transaction(async tx=>{
     let row=await tx.get(APPLICATION_KEY);
     if(!row){row={task_id:TASK_ID,idempotency_key:APPLICATION_KEY,status:'known_application_pending_readback',send_state:'canonical_sent_receipt_present',message_id:receipt.gmail_message_id,thread_id:receipt.gmail_thread_id,existing_source_receipt:true,readback_verified:false,mailbox_identity_sha256:hash(m.email.toLowerCase()),paid:false,tx_hash:null};await tx.put(APPLICATION_KEY,row);}
     if(row.mailbox_identity_sha256&&row.mailbox_identity_sha256!==hash(m.email.toLowerCase()))throw Error('mailbox_changed');
     if(row.message_id&&row.message_id!==EXISTING_APPLICATION_MESSAGE_ID)throw Error('application_message_changed');
     return row;
    });
    const observed=await loadExistingApplication({idempotency_key:APPLICATION_KEY,message_id:EXISTING_APPLICATION_MESSAGE_ID,thread_id:EXISTING_APPLICATION_MESSAGE_ID});
    let verified;
    try{verified=existingApplicationFromReadback({receipt,readback:observed?.readback,mailboxEmail:m.email});}
    catch{
     await store.transaction(async tx=>{const row=await tx.get(APPLICATION_KEY);if(!row.readback_verified){row.send_state=held.message_id?'known_sent_readback_unavailable':'send_unknown';row.status=held.message_id?'known_application_pending_readback':'send_unknown_reconcile_only';}row.last_reconciliation='readback_unavailable_no_resend';await tx.put(APPLICATION_KEY,row);});
     return result(held.message_id?'known_application_readback_unavailable':'send_unknown_reconcile_only',{reconciliation_required:true});
    }
    await store.transaction(async tx=>{const row=await tx.get(APPLICATION_KEY);if(row.message_id&&row.message_id!==verified.message_id)throw Error('application_identity_changed');await tx.put(APPLICATION_KEY,{...row,...verified,last_reconciliation:'canonical_Sent_message_read_back',reconciled_at_utc:new Date(clock()).toISOString()});});
    return result('application_reconciled_from_Sent',{message_id:verified.message_id,reconciliation_required:false});
   }catch{return deny('canonical_application_reconciliation_unavailable_no_resend');}
  },
  async status(){
   if(!store?.transaction)return deny('durable_store_unavailable');
   return store.transaction(async tx=>{const row=await tx.get(APPLICATION_KEY);return row?structuredClone(row):{task_id:TASK_ID,status:'canonical_application_exists_not_initialized',message_id:EXISTING_APPLICATION_MESSAGE_ID,registered_market_account:false,trial_received:false,work_submitted:false,externally_accepted:false,paid:false,tx_hash:null};});
  }
 };
}

const PROVIDERS=new Set(['aliyun_dashscope','volcengine_ark','deepseek','moonshot','openai','anthropic','xai']);
const opaqueId=x=>typeof x==='string'&&/^[-A-Za-z0-9_]{1,120}$/.test(x);
const bytes=(value,max=200000)=>{if(!(value instanceof Uint8Array)||!value.byteLength||value.byteLength>max)throw Error('bounded_original_evidence_bytes_required');return Uint8Array.from(value);};
function authenticatedMessage(message,id){
 if(message?.id!==id||message.metadata_source!=='connected_mailbox_message_readback'||message.from!==TO||/[\r\n]/.test(message.subject||'')||message.authentication?.dkim!=='pass'||message.authentication?.dkim_domain!=='2hives.com'||message.authentication?.dmarc!=='pass')throw Error('actual_authenticated_platform_message_required');
 bytes(message.bytes);return message;
}
function providerRecord(raw,id,kind){
 const record=JSON.parse(Buffer.from(bytes(raw)).toString('utf8'));
 if(record.task_id!==TASK_ID||record[kind+'_id']!==id||record.metadata_source!=='provider_response'||!PROVIDERS.has(record.actual_provider)||typeof record.model!=='string'||!record.model||typeof record.request_id!=='string'||!record.request_id)throw Error('actual_provider_response_record_required');
 return record;
}
// The former public fact-object helper was not an authorization boundary. Keep
// the export as an explicit rejection for old callers rather than silently accept it.
export function prepareFreeTrialDelivery(){throw Error('deployment_owned_delivery_preparer_required');}
export function createM1DeliveryPreparer({policy,readAuthenticatedPackage,readAuthenticatedPermission,loadArtifact,loadReview,clock=Date.now}={}){
 policy=structuredClone(policy);
 return Object.freeze({async prepare(selector){
  if(!validatePracticePolicy(policy)||policy.enabled!==true)throw Error('M1_default_off_or_zero_outflow_policy_invalid');
  if(!selector||Object.keys(selector).sort().join(',')!=='artifact_id,package_message_id,permission_message_id,review_id'||Object.values(selector).some(x=>!opaqueId(x)))throw Error('opaque_delivery_selectors_only');
  if([readAuthenticatedPackage,readAuthenticatedPermission,loadArtifact,loadReview].some(f=>typeof f!=='function'))throw Error('deployment_owned_evidence_capabilities_required');
  // Only deployment-owned loaders interpret mailbox/API results. A caller cannot
  // supply package flags, permission booleans, provider metadata, hashes or time.
  const pkg=authenticatedMessage(structuredClone(await readAuthenticatedPackage(selector.package_message_id)),selector.package_message_id),pkgHash=hash(pkg.bytes),f=pkg.facts;
  if(!f||f.source_bytes_sha256!==pkgHash||!/^\[pkg-[A-Za-z0-9_-]+\](?:\s|$)/.test(pkg.subject)||typeof f.reference!=='string'||!/^[-A-Za-z0-9_.:]{1,100}$/.test(f.reference)||!pkg.subject.includes(f.reference))throw Error('bound_package_facts_and_reference_required');
  if(f.fee_raw!=='0'||f.deposit_raw!=='0'||f.requires_wallet_signature!==false||f.outgoing_transfer_required!==false)throw Error('explicit_zero_outflow_package_required');
  const permission=authenticatedMessage(structuredClone(await readAuthenticatedPermission(selector.permission_message_id)),selector.permission_message_id),permissionHash=hash(permission.bytes),terms=permission.facts;
  if(terms?.source_bytes_sha256!==permissionHash||terms.package_message_id!==pkg.id||terms.package_sha256!==pkgHash||terms.allow_inference!==true||terms.allow_cross_provider_review!==true||terms.material_scope!=='this_package_only'||!Array.isArray(terms.permitted_providers))throw Error('bound_platform_processing_permission_required');
  const artifactBytes=bytes(await loadArtifact(selector.artifact_id)),artifact=providerRecord(artifactBytes,selector.artifact_id,'artifact');
  const reviewBytes=bytes(await loadReview(selector.review_id)),review=providerRecord(reviewBytes,selector.review_id,'review');
  if(artifact.package_sha256!==pkgHash||typeof artifact.output!=='string'||artifact.output.split(/\r?\n/)[0]!==f.reference||hash(artifact.output)!==artifact.output_sha256)throw Error('exact_package_reference_and_artifact_bytes_required');
  const artifactHash=hash(artifact.output);
  if(review.package_sha256!==pkgHash||review.artifact_sha256!==artifactHash||review.verdict!=='approve'||review.actual_provider===artifact.actual_provider)throw Error('bound_other_provider_review_required');
  for(const provider of [artifact.actual_provider,review.actual_provider])if(!terms.permitted_providers.includes(provider))throw Error('specific_provider_processing_permission_required');
  // Evaluate the deployment clock after all evidence awaits. Request-supplied now
  // and a deadline that expires during evidence reads cannot authorize a reply.
  const now=clock();if(!Number.isFinite(now)||!Number.isFinite(Date.parse(f.deadline_at_utc))||now>=Date.parse(f.deadline_at_utc))throw Error('live_external_deadline_required');
  if(secretLike(artifact.output))throw Error('sensitive_material_not_allowed_in_deliverable');
  return {to:TO,subject:pkg.subject,body:artifact.output,status:'reply_prepared_not_sent',task_id:TASK_ID,package_message_id:pkg.id,package_sha256:pkgHash,artifact_sha256:artifactHash,artifact_evidence_sha256:hash(artifactBytes),review_evidence_sha256:hash(reviewBytes),permission_evidence_sha256:permissionHash,author_provider:artifact.actual_provider,review_provider:review.actual_provider,author_request_id:artifact.request_id,review_request_id:review.request_id,paid:false,tx_hash:null,externally_accepted:false};
 }});
}

async function boundedResponseBytes(response,max=32768){
 const declared=response.headers?.get?.('content-length');if(declared!==null&&declared!==undefined&&(!/^\d+$/.test(declared)||Number(declared)>max))throw Error('response_size_exceeded');
 if(typeof response.body?.getReader!=='function')throw Error('bounded_response_stream_required');
 const reader=response.body.getReader(),chunks=[];let length=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;length+=value.byteLength;if(length>max)throw Error('response_size_exceeded');chunks.push(value);}return Buffer.concat(chunks);}
 catch(e){try{await reader.cancel();}catch{}throw e;}
}

export async function inspectM1PublicReadiness({fetchImpl=fetch}={}){
 const urls=['https://clawtasks.com/api/config','https://clawtasks.com/api/bounties?status=open','https://2hives.com/agent-work/protocol'];
 const results=[];
 for(const url of urls){
  try{
   const r=await fetchImpl(url,{method:'GET',redirect:'manual',signal:AbortSignal.timeout(15000)});
   const body=await boundedResponseBytes(r);results.push({url,http_status:r.status,body_sha256:hash(body),bytes:body.byteLength,
    location:r.headers?.get?.('location')??null,can_register:false,can_execute_task:false});
  }catch{results.push({url,http_status:null,error:'read_unavailable_or_response_too_large_no_retry',can_register:false,can_execute_task:false});}
 }
 return {task_id:TASK_ID,status:'public_probe_only',results,external_post_requests:0,registered_accounts:0,orders:0,signatures:0,paid:false,tx_hash:null};
}
