// Independent reproduction: fund-scan missed detection (PR #278 sandbox challenge, Doubao)
// Goal: reproduce qwen's claim "8 samples, current scanner misses 7"; validate candidate
// indirectFinancialReferences catches all 8. Sandbox only: no production writes, no network.
// Node v22.
import {scanFinancialSource} from '../lib/financial-exit-inventory.mjs';

const FINANCIAL_MEMBERS=new Set(['sendTransaction','signTransaction','signTypedData','broadcastTransaction','transfer','transferFrom','safeTransfer','supply','withdraw']);

// Candidate lexical detector: computed bracket member access (incl. string concatenation) + declaration aliases.
export function indirectFinancialReferences(source){
  const found=[];
  // bracket access: w['sendTransaction'](..) / token['trans'+'fer'](..)
  const reBracket=/\b(\w+)\[\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")(?:\s*\+\s*('(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*"))*\s*\]\s*\(/g;
  for(const m of source.matchAll(reBracket)){
    const name=m[0].split('[')[1].split(']')[0];
    const joined=name.replace(/["'\s]/g,'').replace(/\+/g,'');
    if(FINANCIAL_MEMBERS.has(joined))found.push({kind:'computed_financial_member',line:source.slice(0,m.index).split('\n').length,member:joined});
  }
  // declaration alias: const send = w.sendTransaction; send(tx)
  const reAliasDecl=/const\s+([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*?\.([A-Za-z_$][\w$]*)\s*;?/g;
  const aliases=new Map();
  for(const m of source.matchAll(reAliasDecl)){if(FINANCIAL_MEMBERS.has(m[2]))aliases.set(m[1],m[2]);}
  for(const [alias,member] of aliases){
    const reCall=new RegExp('\\b'+alias+'\\s*\\(','g');
    for(const m of source.matchAll(reCall))found.push({kind:'financial_method_reference',line:source.slice(0,m.index).split('\n').length,member,alias});
  }
  return found.sort((a,b)=>a.line-b.line||a.kind.localeCompare(b.kind));
}

// 8 samples: 1 direct (current scanner catches), 7 indirect (expected missed by current scanner).
const samples=[
 ['sample_01_direct',`const w=provider(); w.sendTransaction(tx);`],
 ['sample_02_bracket',`w['sendTransaction'](tx);`],
 ['sample_03_bracket_concat',`token['trans'+'fer'](to,n);`],
 ['sample_04_alias',`const send = w.sendTransaction; send(tx);`],
 ['sample_05_alias_chain',`const a = w.sendTransaction; const b = a; b(tx);`],
 ['sample_06_bracket_supply',`pool['supply'](amount);`],
 ['sample_07_bracket_withdraw',`vault['withdraw'](x);`],
 ['sample_08_alias_transfer',`const transfer = wallet.transfer; transfer(to,n);`],
];

const rows=[];
for(const [name,src] of samples){
  const cur=scanFinancialSource(src).map(m=>m.kind);
  const cand=indirectFinancialReferences(src);
  rows.push({sample:name,source:src,current_scanner_hits:cur,candidate_hits:cand.map(c=>c.kind+':'+c.member),current_missed:cur.length===0});
}
const missedCount=rows.filter(r=>r.current_missed).length;
const combined=rows.map(r=>({sample:r.sample,current:r.current_scanner_hits.length>0,candidate:r.candidate_hits.length>0,covered:r.current_scanner_hits.length>0||r.candidate_hits.length>0}));
const combinedCoverage=combined.filter(r=>r.covered).length;
const candidateCoversAllMissed=rows.filter(r=>r.current_missed).every(r=>r.candidate_hits.length>0);

const evidence={
  task_id:'PLAN-EXTERNAL-MARKETS-20261024-PR278-SECURITY',
  challenge:'fund_scan_missed_detection_reproduction',
  at:'2026-10-28T09:40:00Z',seat:'doubao',identity:'did:ltzzz:doubao',paid:false,tx_hash:null,model_calls:0,network_calls:0,
  samples_total:8,current_scanner_missed:missedCount,current_scanner_caught:8-missedCount,
  claim_reproduced:missedCount===7,
  candidate_covers_all_previously_missed:candidateCoversAllMissed,
  combined_current_plus_candidate_coverage:combinedCoverage,
  uncovered_by_both:combined.filter(r=>!r.covered).map(r=>r.sample),
  rows,
  note:'Sandbox only. Current scanner = scripts/lib/financial-exit-inventory.mjs scanFinancialSource (production, read-only). Candidate = in-memory lexical detector (computed bracket member + single-hop declaration alias), NOT merged. Transitive alias chain (b=a; a=w.sendTransaction) is NOT covered by either qwen patch description or this candidate - honest limitation, matches lexical-detector scope.',
};
console.log(JSON.stringify(evidence,null,2));
