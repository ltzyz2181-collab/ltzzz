import fs from 'node:fs';import {createHash} from 'node:crypto';
import {A2_REVIEW_FILES} from '../../../patchgate-a2-manifest.mjs';
import {canonical} from '../../../patchgate-attestation-evidence.mjs';
export const BASE='a'.repeat(40),HEAD='b'.repeat(40),hash=x=>createHash('sha256').update(x).digest('hex');
const policy=JSON.parse(fs.readFileSync('config/patch-policy.json')),trust=JSON.parse(fs.readFileSync('config/patchgate-trust.json'));
export const snapshot={repository:'ltzyz2181-collab/ltzzz',task_id:'PLAN-PATCHGATE-ESCROW-20261023',base_sha:BASE,head_sha:HEAD,diff_base_sha:BASE,policy_sha256:hash(canonical(policy)),trust_sha256:hash(canonical(trust)),files:[{path:'docs/ordinary.md',mode:'100644',old_mode:'100644',binary:false,diff:'diff --git a/docs/ordinary.md b/docs/ordinary.md\n-old\n+new\n'}]};
export const modelRequest={schema:'ltzzz.patchgate.model-request.v1',task_id:snapshot.task_id,role:'review',source_main_sha:BASE,candidate_pr:246,candidate_head:HEAD,snapshot};
export const stageRequest={schema:modelRequest.schema,task_id:modelRequest.task_id,role:'stage_review',source_main_sha:BASE};
const gitBlob=b=>createHash('sha1').update(Buffer.from('blob '+Buffer.byteLength(b)+'\0')).update(b).digest('hex');
export function githubFixture(){
 const state={calls:[],changed:false,mode:'100644',mergeBase:BASE,headBody:'new\n',oldBody:'old\n',truncated:false,treePadding:0};
 const file=(p,ref)=>p==='docs/ordinary.md'?(ref===BASE?state.oldBody:state.headBody):fs.readFileSync(p,'utf8');
 const fetchImpl=async(input,o={})=>{const u=new URL(input);state.calls.push(u.href);if(o.redirect!=='error')throw Error('unexpected_read_route');if(u.hostname==='raw.githubusercontent.com'){const parts=u.pathname.split('/'),ref=parts[3],p=parts.slice(4).join('/');return new Response(file(p,ref));}if(u.hostname!=='api.github.com')throw Error('unexpected_read_route');const route=u.pathname.replace('/repos/ltzyz2181-collab/ltzzz','');
  if(route==='/git/ref/heads/main')return Response.json({ref:'refs/heads/main',object:{sha:state.changed?HEAD:BASE}});
  if(route==='/pulls/246')return Response.json({head:{sha:HEAD,repo:{full_name:snapshot.repository}},base:{sha:BASE,ref:'main',repo:{full_name:snapshot.repository}},state:'open',draft:false,merged:false,author_association:'OWNER',user:{login:'ltzyz2181-collab',id:261544579}});
  if(route.startsWith('/contents/')){const p=route.slice('/contents/'.length),b=file(p,u.searchParams.get('ref'));return Response.json({path:p,type:'file',encoding:'base64',size:Buffer.byteLength(b),sha:gitBlob(b),content:Buffer.from(b).toString('base64')});}
  if(route.startsWith('/compare/'))return Response.json({merge_base_commit:{sha:state.mergeBase},files:[{filename:'docs/ordinary.md',status:'modified',sha:gitBlob(state.headBody)}]});
  if(route.startsWith('/git/trees/'))return Response.json({truncated:state.truncated,tree:[...A2_REVIEW_FILES.map(p=>({path:p,mode:'100644',type:'blob',sha:gitBlob(file(p,BASE))})),{path:'docs/ordinary.md',mode:state.mode,type:'blob',sha:gitBlob(route.includes(BASE)?state.oldBody:state.headBody)}],padding:'x'.repeat(state.treePadding)});
  throw Error('unexpected_read_route');
 };return {state,fetchImpl};
}
