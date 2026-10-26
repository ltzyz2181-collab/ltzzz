// B2 compensation for L0 Markdown only; this is not an expected-base API/CAS.
import {canonical, classify, sha256} from './patchgate.mjs';

export const DOCS_BASE_STRATEGY='L0_postmerge_readback_persistent_stop_latch';
export const A2_STOP_REF='patchgate-a2-stop';
const ROOT='/repos/ltzyz2181-collab/ltzzz',SHA=/^[a-f0-9]{40}$/;
const pathOK=p=>typeof p==='string'&&p.length>0&&!/[\\\u0000-\u001f\u007f]/.test(p)&&!p.startsWith('/')&&!p.split('/').some(x=>!x||x==='.'||x==='..');
const equal=(a,b)=>canonical(a??null)===canonical(b??null);
async function commit(api,sha){
  if(!SHA.test(sha||''))throw Error('readback_commit_required');
  const r=await api('GET',ROOT+'/git/commits/'+sha),c=r.data;
  if(r.status!==200||c?.sha!==sha||!SHA.test(c.tree?.sha||'')||!Array.isArray(c.parents)||c.parents.some(p=>!SHA.test(p.sha||'')))throw Error('readback_commit_unavailable');
  return c;
}
async function tree(api,sha){
  const r=await api('GET',ROOT+'/git/trees/'+sha+'?recursive=1'),t=r.data;
  if(r.status!==200||t?.sha!==sha||t.truncated!==false||!Array.isArray(t.tree)||t.tree.length>20000)throw Error('readback_complete_tree_required');
  const map=new Map(),seen=new Set();
  for(const f of t.tree){
    if(!pathOK(f.path)||seen.has(f.path)||!SHA.test(f.sha||''))throw Error('readback_tree_entry_invalid');
    seen.add(f.path);
    if(f.type==='tree'){if(f.mode!=='040000')throw Error('readback_tree_entry_invalid');continue;}
    if(!((f.type==='blob'&&['100644','100755','120000'].includes(f.mode))||(f.type==='commit'&&f.mode==='160000')))throw Error('readback_tree_entry_invalid');
    map.set(f.path,{mode:f.mode,type:f.type,sha:f.sha});
  }
  return map;
}
function delta(before,after){
  return [...new Set([...before.keys(),...after.keys()])].sort().filter(p=>!equal(before.get(p),after.get(p))).map(path=>({path,before:before.get(path)||null,after:after.get(path)||null}));
}
function ordinaryDocs(policy,changes){
  if(!changes.length)return true;
  const files=changes.map(f=>({path:f.path,mode:(f.after||f.before).mode,old_mode:f.before?.mode||null,binary:false,diff:''}));
  return changes.every(f=>f.path.endsWith('.md')&&[f.before,f.after].filter(Boolean).every(e=>e.mode==='100644'&&e.type==='blob'))
    &&classify(policy,files).level==='L0';
}
async function descendant(api,base,head){
  if(base===head)return;
  const r=await api('GET',ROOT+'/compare/'+base+'...'+head),d=r.data;
  if(r.status!==200||d?.base_commit?.sha!==base||d.merge_base_commit?.sha!==base||d.status!=='ahead')throw Error('readback_base_ancestry_unverified');
}
export async function prepareDocsReadback({api,snapshot,policy}){
  const base=await commit(api,snapshot.base_sha),head=await commit(api,snapshot.head_sha);
  await descendant(api,base.sha,head.sha);
  const before=await tree(api,base.tree.sha),after=await tree(api,head.tree.sha),changes=delta(before,after);
  if(!changes.length||!ordinaryDocs(policy,changes)||!equal(changes.map(x=>x.path),snapshot.files.map(x=>x.path).sort()))throw Error('approved_docs_tree_manifest_mismatch');
  return {base_sha:base.sha,head_sha:head.sha,before,after,changes,manifest_sha256:sha256(canonical(changes))};
}
export async function verifyDocsMerge({api,approved,policy,mergeSha}){
  const merged=await commit(api,mergeSha);
  if(merged.parents.length!==2||merged.parents[1].sha!==approved.head_sha)throw Error('readback_merge_parents_mismatch');
  const parentSha=merged.parents[0].sha;
  await descendant(api,approved.base_sha,parentSha);
  const parent=await commit(api,parentSha),before=await tree(api,parent.tree.sha),after=await tree(api,merged.tree.sha);
  // A concurrent executable/policy/trust change invalidates the old approval.
  // Concurrent ordinary docs may proceed, but never modify a reviewed path.
  if(!ordinaryDocs(policy,delta(approved.before,before)))throw Error('readback_concurrent_base_not_L0_docs');
  const actual=delta(before,after);
  if(!equal(actual,approved.changes))throw Error('readback_merge_tree_bytes_mode_or_paths_mismatch');
  const actualHash=sha256(canonical(actual));
  return {verified:true,source_base_sha:approved.base_sha,actual_base_sha:parentSha,approved_head_sha:approved.head_sha,merge_commit_sha:mergeSha,
    candidate_manifest_sha256:approved.manifest_sha256,actual_manifest_sha256:actualHash,changed_file_count:actual.length,base_moved:parentSha!==approved.base_sha};
}
export function validDocsReadback(p,{headSha,baseSha,mergeSha}){
  return p&&Object.keys(p).sort().join(',')===['verified','source_base_sha','actual_base_sha','approved_head_sha','merge_commit_sha','candidate_manifest_sha256','actual_manifest_sha256','changed_file_count','base_moved'].sort().join(',')
    &&p.verified===true&&p.source_base_sha===baseSha&&p.approved_head_sha===headSha&&p.merge_commit_sha===mergeSha&&SHA.test(p.actual_base_sha||'')
    &&/^[a-f0-9]{64}$/.test(p.candidate_manifest_sha256||'')&&p.candidate_manifest_sha256===p.actual_manifest_sha256
    &&Number.isSafeInteger(p.changed_file_count)&&p.changed_file_count>0&&p.base_moved===(p.actual_base_sha!==baseSha);
}
