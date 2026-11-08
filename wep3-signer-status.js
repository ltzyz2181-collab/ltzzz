import {denyLegacyFinancialExecution} from './lib/financial-exit-guard.js';

export const SIGNER_STATUS_REVISION='wep3-signer-status-v1';
export const SIGNER_STATUS_SCOPES=Object.freeze(['aave_supply','snapshot_anchor']);

// This reports the installed transaction path, not the separate identity-only
// signer. Legacy Market has no permitted transaction adapter. Checking the
// existing guard never reads a key or creates a control proof/signature.
export function transactionSignerStatus(env={},scope='aave_supply') {
  if(!SIGNER_STATUS_SCOPES.includes(scope))throw Error('unsupported_signer_scope');
  let legacyBlocked=false;
  try {denyLegacyFinancialExecution('signer_status');}catch {legacyBlocked=true;}
  return {
    ok:true,schema:'ltzzz.treasury-signer-status.v1',revision:SIGNER_STATUS_REVISION,
    scope,chain_id:8453,source_commit:env.WEP3_SOURCE_COMMIT||null,
    configured:false,configured_basis:legacyBlocked?'existing_legacy_guard_denies_transaction_adapter':'no_transaction_adapter_installed',
    control_verified:null,control_evidence:null,transaction_adapter_ready:false,
    status:'blocked_transaction_adapter',identity_key_availability:'not_observed',
    signed:false,transactions:0,on_chain_executed:false,paid:false,tx_hash:null,
  };
}
