export const articleHash=async md=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(md)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function articleEligibility(md,receipt,date){
 const article_sha256=await articleHash(md);
 if(/未经\s*AI\s*编辑|以下为原始记录摘录/.test(md)||receipt?.ai_editor?.ok===false)return {status:'ARTICLE_FALLBACK_RAW',draft_eligible:false,article_sha256,reason:'editor_failed_or_raw_fallback'};
 if(!receipt||receipt.date!==date||receipt.ai_editor?.ok!==true||receipt.ai_editor?.finish_reason!=='stop')return {status:'ARTICLE_EDITOR_UNVERIFIED',draft_eligible:false,article_sha256,reason:'complete_editor_receipt_required'};
 if(date>='2026-10-20'&&(receipt.source_policy!=='current_ans_v1'||!Array.isArray(receipt.source_evidence)||!receipt.source_evidence.length||!/^[a-f0-9]{64}$/.test(receipt.input_sha256||'')))return {status:'ARTICLE_CURRENT_SOURCE_UNVERIFIED',draft_eligible:false,article_sha256,reason:'current_evidence_manifest_required_not_historical_ledger_dump'};
 if(date>='2026-10-20'){
  const evidence=receipt.source_evidence;
  const current=evidence.some(s=>s.scope==='same_day'&&s.source_date===date&&/^[a-f0-9]{64}$/.test(s.sha256||''));
  const snapshots=evidence.filter(s=>s.scope==='timestamped_snapshot');
  if(!current||snapshots.some(s=>!Number.isFinite(Date.parse(s.observed_at))||new Date(Date.parse(s.observed_at)+8*3600000).toISOString().slice(0,10)!==date))return {status:'ARTICLE_CURRENT_SOURCE_UNVERIFIED',draft_eligible:false,article_sha256,reason:'validated_same_day_source_and_snapshot_timestamp_required'};
 }
 if(receipt.article_sha256!==article_sha256)return {status:'ARTICLE_EVIDENCE_MISMATCH',draft_eligible:false,article_sha256,reason:'article_changed_since_editor_receipt'};
 return {status:'ARTICLE_READY_WORKER_UNVERIFIED',draft_eligible:true,article_sha256};
}
