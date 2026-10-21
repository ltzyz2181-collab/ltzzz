import {ALLOWED_PROPOSAL_KINDS} from './limits.mjs';
import {createHash} from 'node:crypto';
const PROVIDERS=new Set(['deepseek','doubao','qianwen','grok','kimi','gpt','claude']);
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const id=v=>typeof v==='string'&&/^[A-Za-z0-9_.-]{1,100}$/.test(v);
const iso=v=>typeof v==='string'&&/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/.test(v)&&Number.isFinite(Date.parse(v));
const sha=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const extras=(v,keys)=>Object.keys(v).filter(k=>!keys.includes(k));
export const proposalHash=p=>createHash('sha256').update(JSON.stringify(p)).digest('hex');
export function validateProposal(raw){
 if(!object(raw))return {ok:false,error:'proposal_must_be_object'};
 const extra=extras(raw,['id','kind','proposer_seat','proposer_provider','requested','evidence','created_at','notes_hash']);
 if(extra.length)return {ok:false,error:'unknown_fields',details:extra};
 if(!id(raw.id)||raw.id.length<8||raw.id.length>80)return {ok:false,error:'bad_id'};
 if(!ALLOWED_PROPOSAL_KINDS.includes(raw.kind))return {ok:false,error:'bad_kind'};
 if(!id(raw.proposer_seat))return {ok:false,error:'bad_proposer_seat'};
 const provider=String(raw.proposer_provider||'').toLowerCase();
 if(!PROVIDERS.has(provider))return {ok:false,error:'bad_proposer_provider'};
 if(!iso(raw.created_at))return {ok:false,error:'bad_created_at'};
 if(!object(raw.requested))return {ok:false,error:'bad_requested'};
 if(extras(raw.requested,['amount_usd','task']).length)return {ok:false,error:'unknown_requested_fields'};
 const amount=raw.requested.amount_usd;
 if(typeof amount!=='number'||!Number.isFinite(amount)||amount<0||!Number.isSafeInteger(Math.round(amount*1e6))||Math.abs(amount*1e6-Math.round(amount*1e6))>1e-6)return {ok:false,error:'bad_amount_usd'};
 if(raw.requested.task!=null&&!['digital_public_info_dry_run','public_webpage_summary'].includes(raw.requested.task))return {ok:false,error:'unapproved_task_kind'};
 if(!Array.isArray(raw.evidence)||!raw.evidence.length)return {ok:false,error:'evidence_required'};
 for(const e of raw.evidence){
  if(!object(e)||extras(e,['receipt_id','hash','run_id','path']).length)return {ok:false,error:'bad_evidence_item'};
  if(!id(e.receipt_id))return {ok:false,error:'evidence_receipt_id_required'};
  if(!sha(e.hash))return {ok:false,error:'evidence_hash_required_sha256'};
  if(e.run_id!=null&&!id(e.run_id))return {ok:false,error:'evidence_run_id_must_be_string'};
  if(e.path!=null&&(typeof e.path!=='string'||e.path.length>400))return {ok:false,error:'bad_evidence_path'};
 }
 if(raw.notes_hash!=null&&!sha(raw.notes_hash))return {ok:false,error:'notes_hash_not_sha256'};
 return {ok:true,proposal:{id:raw.id,kind:raw.kind,proposer_seat:raw.proposer_seat,proposer_provider:provider,requested:{amount_usd:amount,...(raw.requested.task?{task:raw.requested.task}:{})},evidence:raw.evidence.map(e=>({receipt_id:e.receipt_id,hash:e.hash,run_id:e.run_id||null,path:e.path||null})),created_at:raw.created_at,notes_hash:raw.notes_hash||null}};
}
// Binding prevents accidental replay; it is not provider authentication. Stage 1
// treats these JSON votes as claims and never as spending authorization.
export function validateVote(raw,proposal){
 if(!object(raw))return {ok:false,error:'vote_must_be_object'};
 if(extras(raw,['provider','seat','vote','reason_code','at','proposal_id','proposal_sha256']).length)return {ok:false,error:'unknown_vote_fields'};
 const provider=String(raw.provider||'').toLowerCase();
 if(!PROVIDERS.has(provider))return {ok:false,error:'bad_vote_provider'};
 if(provider===proposal?.proposer_provider)return {ok:false,error:'same_provider_as_proposer'};
 if(!proposal||raw.proposal_id!==proposal.id||raw.proposal_sha256!==proposalHash(proposal))return {ok:false,error:'vote_proposal_binding_required'};
 if(!['pass','reject'].includes(raw.vote))return {ok:false,error:'vote_must_be_pass_or_reject'};
 if(typeof raw.reason_code!=='string'||!/^[A-Za-z0-9_.-]{1,64}$/.test(raw.reason_code))return {ok:false,error:'bad_reason_code'};
 if(!iso(raw.at))return {ok:false,error:'vote_timestamp_required'};
 if(raw.seat!=null&&!id(raw.seat))return {ok:false,error:'bad_vote_seat'};
 return {ok:true,vote:{provider,seat:raw.seat||provider,vote:raw.vote,reason_code:raw.reason_code,at:raw.at,proposal_id:raw.proposal_id,proposal_sha256:raw.proposal_sha256,provider_execution_verified:false}};
}
