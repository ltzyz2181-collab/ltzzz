import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sha256,unitKey,safePath,validatePreflight,parseTask,routeTask,leaseStatus,acquireLease,updateLease} from '../lib/workpool-policy.mjs';
import {WorkpoolGitHubStore} from '../lib/workpool-github.mjs';
import {runWorkpool} from '../run-workpool.mjs';
const now=Date.parse('2026-10-28T12:00:00Z'),commit='a'.repeat(40),tree='b'.repeat(40),coreHash='c'.repeat(64);
const policy={repository:'ltzyz2181-collab/ltzzz',trusted_issue_authors:['ltzyz2181-collab'],seats:['gpt','qianwen'],lease_seconds:3600};
const task={task_id:'PLAN-EXTERNAL-MARKETS-20261024',step_id:'INTERNAL-READ-01',goal:'Hash public source',acceptance:'exact hash',deadline_at:'2099-01-01T00:00:00Z',risk:'L0',budget_usdc:'0',source_kind:'internal',kind:'repo_readonly',read_paths:['CORE-VIEW.md'],write_paths:[],requested_seat:'gpt'};
const issue={repository:policy.repository,number:1,author:'ltzyz2181-collab',state:'open',labels:['work:open']};
class AtomicStore {
  value=null;
  async read(){return structuredClone(this.value);}
  async compareAndSwap(key,previous,state,extra){if((previous?.head??null)!==(this.value?.head??null))return false;this.value={head:String(Number(this.value?.head||0)+1),state:structuredClone(state)};this.artifact=extra?.artifact;return true;}
}
const acquire=(store,extra={})=>acquireLease({task,issue,policy,coreHash,sourceCommit:commit,executor:{id:'rules'},store,now,...extra});
const update=(store,action,extra={})=>updateLease({key:unitKey(task),leaseId:store.value.state.lease_id,executorId:'rules',store,action,now:now+100,...extra});
test('trusted core and direct owner policy are bound without changing existing budgets',()=>{
 const p=JSON.parse(fs.readFileSync('config/workpool.json'));assert.equal(p.core_view_sha256,sha256(fs.readFileSync('CORE-VIEW.md')));assert.equal(p.requires_owner_confirmation,false);assert.equal(p.formal_five_signature_enabled,false);assert(!p.seats.includes('microsoft'));
 const a=JSON.parse(fs.readFileSync('config/autonomy-authority.json'));assert.equal(a.forwarded_proposals.reject_new_personal_approval_or_controller_restriction,true);assert.equal(a.daily_ai_hire.max_purchase_usdc,'0.05');assert.equal(a.internal_per_action_owner_confirmation,false);
});
test('preflight checks public structure and trusted hashes, rejects new personal gates',()=>{
 const p={goal:'Read',impulse_check:'No side effects',independent_check:'Other provider pending',touches_core:[1,7],unverified:[],stop_if:['source changed'],approval_kind:'none',core_view_sha256:coreHash,source_commit:commit};
 assert.deepEqual(validatePreflight(p,{coreHash,sourceCommit:commit}),[]);
 for(const approval_kind of ['owner','five_signature','reviewer_veto'])assert(validatePreflight({...p,approval_kind},{coreHash,sourceCommit:commit}).includes('new_personal_or_five_signature_gate_not_authorized'));
 assert(validatePreflight({...p,core_view_sha256:'0'.repeat(64)},{coreHash,sourceCommit:commit}).includes('core_view_hash_mismatch'));
 assert(validatePreflight({...p,source_commit:'0'.repeat(40)},{coreHash,sourceCommit:commit}).includes('base_commit_mismatch'));
});
test('task parser treats text as data and rejects ambiguity',()=>{assert.deepEqual(parseTask('```json\n'+JSON.stringify(task)+'\n```'),task);assert.throws(()=>parseTask('```json\n{}\n```\n```json\n{}\n```'));assert.throws(()=>parseTask('```json\nprocess.exit()\n```'));});
test('unsafe paths never reach low-risk pool',()=>{for(const p of ['../x','/x','.git/config','docs/../x','docs/%2e%2e/x','docs/x?ref=other','docs\\x','docs//x','docs/./x']){assert.equal(safePath(p),false,p);assert.equal(routeTask({...task,read_paths:[p]},issue,policy,now).route,'controller');}});
test('cash, external and high-risk tasks route controller without owner gate',()=>{for(const t of [{budget_usdc:'1'},{source_kind:'platform'},{risk:'L3'},{write_paths:['.github/workflows/a.yml'],kind:'documentation'},{requested_seat:'microsoft'},{owner_approved:true},{kind:'sandbox_analysis',risk:'L1',write_paths:[]}]){const r=routeTask({...task,...t},issue,policy,now);assert.equal(r.route,'controller');assert.equal(r.owner_confirmation_required,false);}});
test('only authenticated same-repo open work may claim',()=>{for(const i of [{author:'unknown'},{repository:'other/repo'},{state:'closed'},{labels:[]}])assert.equal(routeTask(task,{...issue,...i},policy,now).route,'untrusted_or_not_open');assert.equal(routeTask(task,issue,policy,now).route,'pool');});
test('twenty simultaneous claimants produce one lease, duplicate issues use same original key',async()=>{const store=new AtomicStore();const results=await Promise.all(Array.from({length:20},(_,i)=>acquire(store,{issue:{...issue,number:i+1}})));assert.equal(results.filter(r=>r.acquired).length,1);assert.equal(store.value.state.attempt,1);assert.equal((await acquire(store)).status,'leased');});
test('changed task payload must reconcile rather than silently repeat original step',async()=>{const s=new AtomicStore();await acquire(s);assert.equal((await acquire(s,{task:{...task,goal:'different'}})).status,'task_changed_reconcile');});
test('expired unstarted work can be reclaimed, invalid or unknown effects cannot',async()=>{const s=new AtomicStore();await acquire(s);assert((await acquire(s,{now:now+3600001})).acquired);await update(s,'begin_effects',{now:now+3600010});assert.equal((await acquire(s,{now:now+7200002})).status,'reconciliation_required');assert.equal(leaseStatus({status:'leased',expires_at:'bad'},now),'reconciliation_required');});
test('stale holder cannot submit or release; started effects cannot be released twice',async()=>{const s=new AtomicStore();await acquire(s);assert.equal((await update(s,'release',{leaseId:'stale'})).status,'not_current_lease');assert((await update(s,'begin_effects')).updated);assert.equal((await update(s,'begin_effects')).updated,false);assert.equal((await update(s,'release')).updated,false);assert.equal((await update(s,'reconcile')).updated,false);});
test('late known output closes unknown effect without permitting a second execution',async()=>{const s=new AtomicStore();await acquire(s);await update(s,'begin_effects');const content='{}\n',artifact={path:'knowledge/results/workpool/a.json',sha256:sha256(content),content};assert((await update(s,'submit',{now:now+3600001,artifact})).updated);assert.equal(s.value.state.accepted,false);assert.equal(s.value.state.late_submission,true);assert.equal((await acquire(s,{now:now+3600002})).status,'submitted_do_not_repeat');assert.equal(s.artifact.content,content);});
test('artifact content mismatch does not change the lease',async()=>{const s=new AtomicStore();await acquire(s);assert.equal((await update(s,'submit',{artifact:{path:'docs/a.md',sha256:'0'.repeat(64),content:'actual'}})).updated,false);assert.equal(s.value.state.status,'leased');});
test('Git ref CAS uses isolated branches, non-forced updates and unique commit content',async()=>{
 const calls=[];const fetcher=async(url,opts)=>{calls.push({url,...opts});const resource=url.split('/ltzzz/')[1];let data={sha:resource==='git/trees'?tree:commit};if(resource.startsWith('git/refs/'))return {ok:false,status:422,json:async()=>({message:'race'})};return {ok:true,status:201,json:async()=>data};};
 const s=new WorkpoolGitHubStore({repository:policy.repository,token:'FAKE_TEST_ONLY',baseCommit:commit,baseTree:tree,fetcher});assert(!JSON.stringify(s).includes('FAKE_TEST_ONLY'));
 const state={lease_id:'12345678-1234-1234-1234-123456789012'};const key=unitKey(task);
 assert.equal(await s.compareAndSwap(key,{head:commit,tree},state),false);await s.compareAndSwap(key,{head:commit,tree},state);
 const updates=calls.filter(x=>x.method==='PATCH');assert.equal(updates.length,2);assert(updates.every(x=>JSON.parse(x.body).force===false&&x.url.includes('/heads/workpool/leases/')));
 const trees=calls.filter(x=>x.url.endsWith('git/trees')).map(x=>JSON.parse(JSON.parse(x.body).tree[0].content));assert.notEqual(trees[0].cas_nonce,trees[1].cas_nonce);assert(calls.every(x=>x.url.startsWith('https://api.github.com/repos/'+policy.repository+'/')&&x.redirect==='error'));
});
test('atomic artifact write is bound to lease, content hash and isolated output path',async()=>{
 const calls=[];const fetcher=async(url,opts)=>{calls.push({url,...opts});return{ok:true,status:201,json:async()=>({sha:commit})};};const s=new WorkpoolGitHubStore({repository:policy.repository,token:'FAKE',baseCommit:commit,baseTree:tree,fetcher});const key=unitKey(task),lease_id='12345678-1234-1234-1234-123456789012',content='{}',hash=sha256(content),state={lease_id,artifact:{sha256:hash}};
 await assert.rejects(s.compareAndSwap(key,null,state,{artifact:{path:'main.js',content,sha256:hash}}));assert.equal(calls.length,0);
 await s.compareAndSwap(key,null,state,{artifact:{path:`knowledge/results/workpool/artifacts/${key}/${lease_id}.json`,content,sha256:hash}});const entries=JSON.parse(calls[0].body).tree;assert.equal(entries.length,2);assert.equal(entries[1].content,content);
});
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'workpool-test-'));fs.mkdirSync(path.join(root,'config'));fs.writeFileSync(path.join(root,'CORE-VIEW.md'),'test core');const p={...policy,core_view_sha256:sha256('test core'),requires_owner_confirmation:false,formal_five_signature_enabled:false};fs.writeFileSync(path.join(root,'config/workpool.json'),JSON.stringify(p));return root;}
test('missing transport is truthfully unconfigured with zero model calls',async()=>{const root=fixture();try{const r=await runWorkpool({root,env:{},fetcher:()=>assert.fail('no network')});assert.equal(r.status,'github_transport_not_configured');assert.equal(r.model_calls,0);}finally{fs.rmSync(root,{recursive:true});}});
test('hourly readonly lane submits actual hashes atomically; duplicate run does not rewrite',async()=>{
 const root=fixture(),remote=new Map(),objects=new Map();let seq=0;const fake=async(url,opt={})=>{assert(url.startsWith('https://api.github.com/repos/'+policy.repository+'/'));let resource=url.split('/ltzzz/')[1],data,status=200;const body=opt.body?JSON.parse(opt.body):null;
 if(resource==='git/ref/heads/main')data={object:{sha:commit}};
 else if(resource===`git/commits/${commit}`)data={tree:{sha:tree}};
 else if(resource.startsWith('contents/CORE-VIEW.md?'))data={type:'file',encoding:'base64',content:Buffer.from('test core').toString('base64')};
 else if(resource.startsWith('contents/config/workpool.json?'))data={encoding:'base64',content:fs.readFileSync(path.join(root,'config/workpool.json')).toString('base64')};
 else if(resource.startsWith('issues?'))data=[{...issue,user:{login:issue.author},body:'```json\n'+JSON.stringify(task)+'\n```'}];
 else if(resource.startsWith('git/ref/heads/workpool/')){const head=remote.get(resource.slice('git/ref/'.length));if(!head){status=404;data={};}else data={object:{sha:head}};}
 else if(resource==='git/trees'||resource==='git/commits'){const id=(++seq).toString(16).padStart(40,'0');objects.set(id,body);data={sha:id};}
 else if(resource==='git/refs'){remote.set(body.ref.slice(5),body.sha);data={};}
 else if(resource.startsWith('git/refs/')){remote.set(resource.slice('git/refs/'.length),body.sha);data={};}
 else if(resource.startsWith('git/commits/'))data={tree:{sha:objects.get(resource.slice(12)).tree}};
 else if(resource.startsWith('contents/knowledge/results/workpool/leases/')){const head=resource.split('?ref=')[1],t=objects.get(objects.get(head).tree);data={encoding:'base64',content:Buffer.from(t.tree[0].content).toString('base64')};}
 else assert.fail('unexpected request '+resource);return{ok:status<400,status,json:async()=>data,headers:{get:()=>null}};
 };
 try{const r=await runWorkpool({root,env:{GITHUB_TOKEN:'FAKE'},fetcher:fake,mode:'claim-readonly'});assert.equal(r.observations[0].submission_status,'submitted_waiting_independent_review');assert.equal(r.model_calls,0);assert.equal(r.unattended_acceptance_verified,false);const count=objects.size;const again=await runWorkpool({root,env:{GITHUB_TOKEN:'FAKE'},fetcher:fake,mode:'claim-readonly'});assert.equal(again.observations[0].claim_status,'submitted_do_not_repeat');assert.equal(objects.size,count);const drafts=[...objects.values()].flatMap(v=>v.tree||[]).filter(v=>v.path?.includes('/artifacts/'));assert.equal(drafts.length,1);const actual=JSON.parse(drafts[0].content);assert.equal(actual.files[0].sha256,sha256('test core'));assert.equal(actual.actual_provider,null);assert.equal(actual.execution_provider,'authenticated_github_client');assert.equal(actual.accepted,false);}finally{fs.rmSync(root,{recursive:true});}
});
test('trusted-base preflight workflow never checks out candidate code or uses write credentials',()=>{const y=fs.readFileSync('.github/workflows/workpool.yml','utf8');const block=y.split('  preflight:')[1].split('  claim:')[0];assert(block.includes('pull_request.base.sha'));assert(block.includes('persist-credentials: false'));assert(!block.includes('contents: write'));assert(!block.includes('secrets.'));});

test('malformed effect state cannot recycle a lease, even when marked released',()=>{for(const status of ['leased','released'])for(const effect_state of [null,'unknown','output_recorded'])assert.equal(leaseStatus({status,effect_state,expires_at:'2020-01-01T00:00:00Z'},now),'reconciliation_required');});
test('JSON input cannot inject NaN, functions or undefined, and spaces remain valid paths',()=>{for(const value of ['NaN','undefined','()=>1'])assert.throws(()=>parseTask('```json\n'+value+'\n```'));assert.equal(safePath('docs/user guide.md'),true);assert.equal(safePath('.github/workflows/a.yml'),false);});
test('invalid deadlines and missing artifacts stop before state mutation',async()=>{const s=new AtomicStore();assert.equal((await acquire(s,{task:{...task,deadline_at:'NaN'}})).acquired,false);assert.equal(s.value,null);await acquire(s);assert.equal((await update(s,'submit')).updated,false);assert.equal((await update(s,'submit',{artifact:null})).updated,false);});

test('a claimed artifact hash without actual bytes cannot become submitted',async()=>{const s=new AtomicStore();await acquire(s);assert.equal((await update(s,'submit',{artifact:{path:'docs/fake.md',sha256:'c'.repeat(64)}})).updated,false);const transport=new WorkpoolGitHubStore({repository:policy.repository,token:'FAKE',baseCommit:commit,baseTree:tree,fetcher:()=>assert.fail('no write before bytes')});await assert.rejects(transport.compareAndSwap(unitKey(task),null,{status:'submitted_waiting_independent_review'}),/submitted_artifact_bytes_required/);});

test('path injection never reaches Git trees, regardless of claimed artifact hash',async()=>{const s=new WorkpoolGitHubStore({repository:policy.repository,token:'FAKE',baseCommit:commit,baseTree:tree,fetcher:()=>assert.fail('unsafe path must not write')});const key=unitKey(task);for(const lease_id of ['../secret','../../.github/workflows/pwn.yml','%2fsecret','------------------------------------']){const content='{}',hash=sha256(content);await assert.rejects(s.compareAndSwap(key,null,{lease_id,artifact:{sha256:hash}},{artifact:{path:`knowledge/results/workpool/artifacts/${key}/${lease_id}.json`,content,sha256:hash}}));}await assert.rejects(s.compareAndSwap('../key',null,{}));});
