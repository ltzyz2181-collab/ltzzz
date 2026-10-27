import {credentialPattern} from './patchgate-secret-scan.mjs';
import {REPO} from './patchgate-oidc.mjs';
import {A2_REVIEW_FILES} from './patchgate-a2-manifest.mjs';
export const TASK='PLAN-PATCHGATE-ESCROW-20261023';
export const canonical=x=>x===null||typeof x!=='object'?JSON.stringify(x):Array.isArray(x)?'['+x.map(canonical).join(',')+']':'{'+Object.keys(x).sort().map(k=>JSON.stringify(k)+':'+canonical(x[k])).join(',')+'}';
const enc=new TextEncoder();
export const digest=async(x,alg='SHA-256')=>[...new Uint8Array(await crypto.subtle.digest(alg,typeof x==='string'?enc.encode(x):x))].map(b=>b.toString(16).padStart(2,'0')).join('');
export const exact=(x,keys)=>!!x&&typeof x==='object'&&!Array.isArray(x)&&Object.keys(x).sort().join(',')===[...keys].sort().join(',');
const SHA=/^[a-f0-9]{40}$/;
const doc=p=>typeof p==='string'&&/^(?:README\.md|docs\/[A-Za-z0-9_./-]+\.md)$/.test(p)&&!p.split('/').some(v=>!v||v==='.'||v==='..');
export async function readBytes(response,max=1000000){
 if(!response.ok)throw Error('fixed_upstream_http');let size=0;const chunks=[];
 for await(const b of response.body){size+=b.length;if(size>max)throw Error('bounded_response_required');chunks.push(b);}
 const out=new Uint8Array(size);let at=0;for(const b of chunks){out.set(b,at);at+=b.length;}
 return out;
}
export async function readJson(response,max=1000000){
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(await readBytes(response,max)));
}
export function validateModelRequest(r){
 const keys=['schema','task_id','role','source_main_sha'];if(r?.role==='review')keys.push('candidate_pr','candidate_head','snapshot');
 if(!exact(r,keys)||r.schema!=='ltzzz.patchgate.model-request.v1'||r.task_id!==TASK||!['review','stage_review'].includes(r.role)||!SHA.test(r.source_main_sha||''))throw Error('model_request_identity');
 if(r.role==='review'&&(!Number.isSafeInteger(r.candidate_pr)||r.candidate_pr<1||r.candidate_pr>999999999||!SHA.test(r.candidate_head||'')))throw Error('candidate_identity');return r;
}
export function evidenceReader(fetchImpl=fetch){
 const treesByRef=new Map();
 const get=async route=>readJson(await fetchImpl('https://api.github.com/repos/'+REPO+route,{headers:{Accept:'application/vnd.github+json','User-Agent':'LTZZZ-PatchGate-Attestation'},redirect:'error',signal:AbortSignal.timeout(20000)}),route.startsWith('/git/trees/')?8000000:1000000);
 const tree=async ref=>{
  if(!SHA.test(ref))throw Error('immutable_tree_ref');
  if(!treesByRef.has(ref)){
   const t=await get('/git/trees/'+ref+'?recursive=1');
   if(t.truncated||!Array.isArray(t.tree)||t.tree.length>20000)throw Error('complete_tree_required');
   treesByRef.set(ref,t.tree);
  }return treesByRef.get(ref);
 };
 const file=async(path,ref)=>{
  if(!A2_REVIEW_FILES.includes(path)&&!doc(path))throw Error('fixed_read_path');
  const matches=(await tree(ref)).filter(f=>f.path===path),f=matches[0];
  if(matches.length!==1||f.type!=='blob'||f.mode!=='100644'||!SHA.test(f.sha||''))throw Error('immutable_file_required');
  // Raw immutable blobs avoid per-file GitHub REST quota. No credentials travel.
  const bytes=await readBytes(await fetchImpl('https://raw.githubusercontent.com/'+REPO+'/'+ref+'/'+path,{redirect:'error',signal:AbortSignal.timeout(20000)}),200000);
  const header=enc.encode('blob '+bytes.length+'\0'),blob=new Uint8Array(header.length+bytes.length);blob.set(header);blob.set(bytes,header.length);
  if(!bytes.length||await digest(blob,'SHA-1')!==f.sha)throw Error('immutable_file_integrity');
  const raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);
  if(credentialPattern(raw))throw Error('immutable_input_secret_pattern');return raw;
 };
 const current=async r=>{const main=await get('/git/ref/heads/main');if(main.ref!=='refs/heads/main'||main.object?.sha!==r.source_main_sha)throw Error('source_main_moved');if(r.role==='review'){const p=await get('/pulls/'+r.candidate_pr);if(p.head?.repo?.full_name!==REPO||p.base?.repo?.full_name!==REPO||p.head.sha!==r.candidate_head||p.base.sha!==r.source_main_sha||p.base.ref!=='main'||p.state!=='open'||p.merged||p.draft||!['OWNER','MEMBER','COLLABORATOR'].includes(p.author_association)||p.user?.login!=='ltzyz2181-collab'||p.user?.id!==261544579)throw Error('trusted_PR_identity');}};
 return {current,async read(r){
  validateModelRequest(r);await current(r);
  if(r.role==='stage_review'){
   const files=[];let size=0;for(const path of A2_REVIEW_FILES){const raw=await file(path,r.source_main_sha);size+=enc.encode(raw).length;if(size>600000)throw Error('stage_input_size');let committed=raw;if(path==='config/patchgate-a2.json'){const c=JSON.parse(raw);delete c.runtime_bundle_sha256;delete c.stage_audits;delete c.external_stage_audits;committed=canonical(c);}files.push({path,sha256:await digest(committed),content:raw});}
   const manifest=files.map(({path,sha256})=>({path,sha256})),bundle=await digest(canonical(manifest));
   return {subject:{task_id:TASK,phase:'A2',runtime_bundle_sha256:bundle},artifact_sha256:await digest(canonical(files)),prompt:canonical({scope:'A2 L0 document merge opinion only; not L1+, A3, funds or complete security audit',files}),runtime_bundle_sha256:bundle};
  }
  const s=r.snapshot;
  if(!exact(s,['repository','task_id','base_sha','head_sha','diff_base_sha','policy_sha256','trust_sha256','files'])||s.repository!==REPO||s.task_id!==TASK||s.base_sha!==r.source_main_sha||s.diff_base_sha!==s.base_sha||s.head_sha!==r.candidate_head||!Array.isArray(s.files)||s.files.length<1||s.files.length>10)throw Error('snapshot_identity');
  const policy=JSON.parse(await file('config/patch-policy.json',s.base_sha)),trust=JSON.parse(await file('config/patchgate-trust.json',s.base_sha));
  if(s.policy_sha256!==await digest(canonical(policy))||s.trust_sha256!==await digest(canonical(trust)))throw Error('snapshot_BASE_hash');
  const comp=await get('/compare/'+s.base_sha+'...'+s.head_sha);
  if(comp.merge_base_commit?.sha!==s.base_sha||!Array.isArray(comp.files)||comp.files.length!==s.files.length||comp.files.some(f=>!['added','modified'].includes(f.status)))throw Error('complete_BASE_ancestor_diff_required');
  const trees=await Promise.all([tree(s.base_sha),tree(s.head_sha)]);
  const rendered=[];let size=0;
  for(const f of s.files){
   if(!exact(f,['path','mode','old_mode','binary','diff'])||!doc(f.path)||f.mode!=='100644'||f.binary!==false||typeof f.diff!=='string'||f.diff.length>100000||policy.protected_prefixes.some(p=>f.path.startsWith(p)))throw Error('ordinary_document_only');
   const match=comp.files.filter(x=>x.filename===f.path),before=trees[0].find(x=>x.path===f.path),after=trees[1].find(x=>x.path===f.path);
   if(match.length!==1||after?.type!=='blob'||after.mode!=='100644'||after.sha!==match[0].sha||(before?before.mode!==f.old_mode:f.old_mode!==null))throw Error('snapshot_path_mode');
   const old=before?await file(f.path,s.base_sha):null,now=await file(f.path,s.head_sha);size+=(old?.length||0)+now.length;if(size>100000)throw Error('review_input_size');
   // Review actual immutable BASE/HEAD bytes, never trust the supplied diff as prompt.
   rendered.push({path:f.path,base:old,head:now});
  }
  if(new Set(s.files.map(f=>f.path)).size!==s.files.length)throw Error('duplicate_snapshot_path');
  const subject={repository:REPO,task_id:TASK,base_sha:s.base_sha,head_sha:s.head_sha,policy_sha256:s.policy_sha256,trust_sha256:s.trust_sha256,files_sha256:await digest(canonical([...s.files].sort((a,b)=>a.path.localeCompare(b.path))))};
  return {subject,artifact_sha256:await digest(canonical(rendered)),prompt:canonical({scope:'independent review of ordinary document BASE/HEAD bytes',files:rendered})};
 }};
}
