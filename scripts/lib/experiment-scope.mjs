export function experimentScope(kind){
 if(kind==='receipt_hash_benchmark')return {validation_scope:'local_hash_change_only',sample_count:1,real_delivery_count:0,quality_validation_performed:false,validated_claims:['changing_fixture_status_changes_sha256'],unvalidated_claims:['ten_real_deliveries','delivery_quality','cross_agent_quality_ranking','refund_latency','on_chain_verification']};
 return {validation_scope:'local_fixture_only',real_delivery_count:0,quality_validation_performed:false};
}
