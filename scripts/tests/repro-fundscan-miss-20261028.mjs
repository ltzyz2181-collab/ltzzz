// Independent reproduction: fund-scan missed detection (PR #278 sandbox challenge, Doubao)
// Goal: reproduce qwen's claim "8 samples, current scanner misses 7"; validate candidate
// indirectFinancialReferences catches all 8. Sandbox only: no production writes, no network.
// Node v22.
import {scanFinancialSource} from '../lib/financial-exit-inventory.mjs';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

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
  // Sandbox-only, conservative lexical closure; not a JS scope/dataflow proof.
  // Finite declarations bound the fixed point; aliases with no financial origin
  // (including cycles) never enter the map. No source is evaluated.
  const aliasAssignments=[...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*([A-Za-z_$][\w$]*)\s*(?=;|$)/g)];
  for(let round=0;round<aliasAssignments.length;round++){
    let changed=false;
    for(const [,name,from] of aliasAssignments){
      if(!aliases.has(name)&&aliases.has(from)){aliases.set(name,aliases.get(from));changed=true;}
    }
    if(!changed)break;
  }
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

export function reproduce(){
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
  at:new Date().toISOString(),logical_seat:'gpt',client:'Codex sandbox Node.js',actual_provider:null,model:null,execution_provider:process.env.GITHUB_ACTIONS==='true'?'github_actions':'nodejs_local',run_id:process.env.GITHUB_ACTIONS==='true'?(process.env.GITHUB_RUN_ID||null):null,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),source_commit_kind:'checkout_base_not_assertion_of_clean_candidate',source_tree_clean:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()==='',candidate_source_sha256:createHash('sha256').update(readFileSync(fileURLToPath(import.meta.url))).digest('hex'),production_scanner_sha256:createHash('sha256').update(readFileSync(new URL('../lib/financial-exit-inventory.mjs',import.meta.url))).digest('hex'),original_reported_author:'doubao',original_candidate_commit:'e74be4adcd3d8236f0ce2425565d7cc3c788c707',paid:false,tx_hash:null,model_calls:0,network_calls:0,
  samples_total:8,current_scanner_missed:missedCount,current_scanner_caught:8-missedCount,
  claim_reproduced:missedCount===7,
  candidate_covers_all_previously_missed:candidateCoversAllMissed,
  combined_current_plus_candidate_coverage:combinedCoverage,
  uncovered_by_both:combined.filter(r=>!r.covered).map(r=>r.sample),
  rows,
  note:'Sandbox only. Current scanner = scripts/lib/financial-exit-inventory.mjs scanFinancialSource (production, read-only). Candidate = in-memory lexical detector (computed bracket member + single-hop declaration alias), NOT merged. GPT amendment adds finite declaration-alias closure for the reproduced chain; this is sandbox lexical coverage of eight samples, not production scanner coverage or full JS scope/dataflow analysis. Original Doubao report is retained unchanged.',
};
return evidence;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(reproduce(),null,2));
