// Static change detector, not a sandbox or a claim to pause deployed contracts.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const PATTERNS=[
 ['wallet_constructor',/\bWallet\s*\(/g],
 ['transaction_send',/\.\s*(?:sendTransaction|signTransaction|signTypedData|broadcastTransaction|transfer|transferFrom|safeTransfer|supply|withdraw)\s*\(/g],
 ['rpc_or_browser_sign',/['"](?:eth_sendRawTransaction|eth_sendTransaction|eth_signTypedData_v4|personal_sendTransaction)['"]/g],
 ['contract_deployment',/\bContractFactory\s*\(/g],
 ['exchange_write_endpoint',/\/api\/v5\/(?:asset\/(?:transfer|withdrawal)|trade\/order)/g],
 ['paid_relay_header',/['"]PAYMENT-SIGNATURE['"]\s*:/gi],
 ['other_signing_sdk',/\b(?:send_transaction|writeContract|sendUserOperation|sendSponsoredUserOperation)\s*\(/g]
];
const EXT=/\.(?:js|mjs|cjs|ts|tsx|sol|py|sh|ps1|bat|html)$/;
export function scanFinancialSource(source){
 const matches=[];for(const [kind,re] of PATTERNS){re.lastIndex=0;for(const m of source.matchAll(re))matches.push({kind,line:source.slice(0,m.index).split('\n').length});}
 return matches.sort((a,b)=>a.line-b.line||a.kind.localeCompare(b.kind));
}
export function financialSourcePaths(root){
 return [...new Set(execFileSync('git',['ls-files','-z','--cached','--others','--exclude-standard'],{cwd:root,encoding:'utf8',maxBuffer:8000000}).split('\0').filter(Boolean))].filter(p=>EXT.test(p)&&!/(^|\/)(node_modules|vendor|dist|\.git|tests|fixtures)\//.test(p)&&!p.startsWith('scripts/tests/')&&!/\.test\.[^/]+$/.test(p)&&p!=='test-orchestrator.mjs');
}
export function inspectFinancialSources(root){
 return financialSourcePaths(root).map(p=>{
  if(/(^|\/)(?:\.env(?:\.|$)|(?:secrets?|credentials?|private[-_]?keys?)\.(?:js|mjs|cjs|ts|tsx)$)/i.test(p))return {path:p,sensitive_name_not_read:true,matches:[]};
  const full=path.join(root,p),st=fs.lstatSync(full);if(!st.isFile()||st.size>8000000)return {path:p,unreadable_or_unsafe:true,matches:[]};
  const bytes=fs.readFileSync(full);return {path:p,sha256:createHash('sha256').update(bytes).digest('hex'),matches:scanFinancialSource(bytes.toString('utf8'))};
 });
}
export function checkFinancialInventory({sources,inventory,read}){
 const errors=[],rows=inventory?.exits;
 if(inventory?.schema!=='ltzzz.financial-exits.v1'||!Array.isArray(rows))return {passed:false,errors:['inventory_schema_invalid']};
 const byPath=new Map();for(const r of rows){if(byPath.has(r.path))errors.push('duplicate_inventory:'+r.path);byPath.set(r.path,r);}
 for(const s of sources){
  const entry=byPath.get(s.path);
  if(s.sensitive_name_not_read){errors.push('sensitive_executable_source_not_read_or_admitted:'+s.path);continue;}
  if(s.matches.length&&!entry)errors.push('unregistered_financial_primitive:'+s.path);
  if(!entry)continue;
  if(s.sha256!==entry.sha256)errors.push('registered_source_changed_requires_review:'+s.path);
  if(s.unreadable_or_unsafe||s.sensitive_name_not_read)errors.push('registered_source_unreadable:'+s.path);
  if(!['retired_entry','guarded_small_payment','credential_separated_worker','readonly_IO_guard','identity_only','external_customer_wallet','external_contract_authority','upstream_guarded_client','readonly_observer','display_only_code_example'].includes(entry.disposition))errors.push('missing_disposition:'+s.path);
  if(!Array.isArray(entry.guards)||!entry.guards.length)errors.push('missing_guard_or_scope_evidence:'+s.path);
  else for(const g of entry.guards){const text=read(g.path);if(!text?.includes(g.required))errors.push('guard_missing:'+s.path+':'+g.path);}
 }
 for(const e of rows)if(!sources.some(s=>s.path===e.path))errors.push('inventory_path_missing:'+e.path);
 return {passed:errors.length===0,errors,registered_exits:rows.length,scanned_files:sources.length};
}
