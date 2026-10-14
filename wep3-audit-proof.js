const agents=['Grok','Doubao','DeepSeek','Qianwen','Kimi','GPT','Microsoft'];
// Authenticated runner provenance, not an external cryptographic attestation.
export function auditProof(audit,poster,worker){
 const actual=audit?.executed_by||audit?.auditor;
 if(!audit||audit.accepted!==true||!agents.includes(actual)||actual===poster||actual===worker)throw Error('actual_delivery_and_independent_audit_required');
 if(audit.executed_by){
  if(typeof audit.model!=='string'||!audit.model.trim()||audit.model.length>160||!Array.isArray(audit.provider_attempts)||audit.provider_attempts.length<1||audit.provider_attempts.length>10)throw Error('audit_provider_proof_required');
  const last=audit.provider_attempts.at(-1);
  if(last.executed_by!==actual||last.model!==audit.model||!['stop','end_turn'].includes(last.finish_reason))throw Error('audit_provider_proof_mismatch');
 }
 const attempts=(audit.provider_attempts||[]).map(a=>({requested_agent:a.requested_agent||null,executed_by:a.executed_by||null,model:a.model||null,status:a.status||null,finish_reason:a.finish_reason||null,tokens_used:a.tokens_used||0}));
 return {...audit,auditor:actual,logical_auditor:audit.logical_auditor||audit.auditor,executed_by:audit.executed_by||null,model:audit.model||null,provider_attempts:attempts,provenance_status:audit.executed_by?'runner_recorded_actual_provider':'legacy_provider_not_recorded'};
}
