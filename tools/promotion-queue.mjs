import {createHash} from 'node:crypto';
export const recordHash=value=>createHash('sha256').update(JSON.stringify(value)).digest('hex');
export const metadataClaim=value=>/^(?:[-*]\s*)?(?:(?:mode|writer|执行者|生成时间|日期|时间|status|run_id|source_commit|执行ID|读取范围)\s*[:：]|patrol\s+dry-run|summary\s+writer\s*=)/i.test(String(value||'').trim());

// Current state, historical transitions and content quality are different axes.
// A later metadata filter cannot undo a recorded historical promotion.
export function reconcilePromotionQueue(input,{at=new Date().toISOString(),evidence='memory/promote/reconciliations/legacy-state.json'}={}){
 const queue=structuredClone(input),groups=new Map(),changes=[];
 for(const row of queue.items||[]){if(!row||typeof row.id!=='string'||!row.id)throw Error('candidate_id_missing');if(!groups.has(row.id))groups.set(row.id,[]);groups.get(row.id).push(row);}
 for(const id of queue.applied||[]){if(typeof id!=='string'||!id)throw Error('invalid_applied_index');if(!groups.has(id)){groups.set(id,[{id,status:'reconciliation_required',human_confirm:false,legacy_applied_index_only:true}]);changes.push({id,reason:'applied_index_has_no_supporting_record'});}}
 const items=[];
 for(const [id,rows] of groups){
  const applied=rows.find(r=>r.status==='applied'),source=rows.find(r=>r.source),base=applied||rows[0];
  const current={...source,...base};
  if(source?.claim&&source.claim!==current.claim)current.source_claim=source.claim;
  if(rows.length>1){
   if(!applied&&new Set(rows.map(r=>r.status)).size>1){current.status='reconciliation_required';current.human_confirm=false;}
   current.revision=(Math.max(0,...rows.map(r=>Number.isInteger(r.revision)?r.revision:0)))+1;
   current.state_history=[...(base.state_history||[]),{event:'legacy_records_consolidated',observed_at:at,evidence,previous_records:rows.map(r=>({sha256:recordHash(r),status:r.status,human_confirm:r.human_confirm??null})),resulting_status:current.status}];
   if(applied)current.confirmation_provenance='legacy_applied_record_preserved_not_new_confirmation';
   changes.push({id,reason:'duplicate_id',previous_statuses:rows.map(r=>r.status),current_status:current.status});
  }
  if(metadataClaim(current.claim)||metadataClaim(current.source_claim)||rows.some(r=>r.status==='rejected_metadata')){
   current.content_quality='operational_metadata';current.eligible_for_promotion=false;current.impact='low';
   current.quality_reason='Operational metadata is not eligible for a new durable-memory promotion; historical application is retained in state_history/evidence.';
   if(current.status==='candidate')current.status='rejected_metadata';
  }
  items.push(current);
 }
 queue.schema_version=2;queue.items=items;queue.applied=items.filter(r=>r.status==='applied').map(r=>r.id);
 queue.state_policy='items contains one current record per id; applied is a derived index; state_history is historical, content_quality does not reverse an application';
 assertPromotionQueue(queue);return {queue,changes};
}

export function assertPromotionQueue(queue){
 const ids=new Set();for(const row of queue.items||[]){if(!row?.id||ids.has(row.id))throw Error('duplicate_or_missing_candidate_id');ids.add(row.id);}
 const actual=(queue.items||[]).filter(r=>r.status==='applied').map(r=>r.id).sort(),index=[...(queue.applied||[])].sort();
 if(JSON.stringify(actual)!==JSON.stringify(index))throw Error('applied_index_differs_from_current_state');
 for(const row of queue.items||[])if(row.status==='candidate'&&(row.eligible_for_promotion===false||row.content_quality==='operational_metadata'))throw Error('metadata_cannot_remain_a_candidate');
 return true;
}
