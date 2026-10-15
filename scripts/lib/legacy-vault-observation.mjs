export function simulationFailure(error){
 const raw=error?.info?.error||error?.error||{},code=raw.code??error?.code??null;
 const data=typeof error?.data==='string'?error.data:typeof raw.data==='string'?raw.data:null;
 const selector=/^0x[0-9a-f]{8}/i.test(data||'')?data.slice(0,10):null;
 const unsupported=[-32601,-32602].includes(Number(code))||['UNSUPPORTED_OPERATION','NOT_IMPLEMENTED'].includes(code);
 const reverted=!unsupported&&(selector!==null||Number(code)===3||(error?.code==='CALL_EXCEPTION'&&/revert/i.test(String(error.shortMessage||raw.message||''))));
 return {outcome:unsupported?'rpc_unsupported_or_invalid_parameters':reverted?'contract_reverted':'inconclusive_rpc_error',error_code:typeof code==='string'||typeof code==='number'?code:null,revert_selector:selector,permission_safety_proven:false,assessment:'A revert can result from empty assets or other preconditions; it never proves guardian authorization was removed.'};
}

export function assessLegacyObservations(rows){
 const valid=rows.filter(r=>r.guardian);
 const keys=['block','guardian','bytecode_hash','exposure_usdc','vault_usdc','vault_ausdc'];
 const consistent=valid.length===2&&keys.every(k=>String(valid[0][k]).toLowerCase()===String(valid[1][k]).toLowerCase());
 return {rpc_consistent:consistent,status:consistent&&valid.every(r=>r.guardian_matches_legacy_agent)?'legacy_guardian_control_unresolved':'verification_incomplete_or_changed',permission_revocation_verified:false,credential_exposure_verified:false,new_funding_allowed:false};
}
