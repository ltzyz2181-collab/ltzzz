import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CORE_FILES,SKILL_DIR,readSkill,skillContext,skillHash,syncSkillAdapters,nativeReviewEvidence,callWithSkill} from '../lib/ltzzz-skill.mjs';
import {SKILL_REVIEW_SEATS,prepareSkillReview,executeSkillReviews,reviewSelectionFromBody} from '../lib/ltzzz-skill-review.mjs';

const adapters=['.github/skills/ltzzz-task-execution','.claude/skills/ltzzz-task-execution','.agents/skills/ltzzz-task-execution'];
const verdict=(extra={})=>({verdict:'approve',risks:[],additions:[],review_end:true,...extra});
const write=(root,file,value)=>{const full=path.join(root,file);fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,typeof value==='string'?value:JSON.stringify(value,null,2)+'\n');};
async function fixture(fn){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-skill-'));
 try{
  write(root,'config/ltzzz-skill.json',{name:'ltzzz-task-execution',version:'fixture-0.1',enabled:false,directory:SKILL_DIR,reviewed_core_files:CORE_FILES,adapters,activation_review:null});
  for(const file of CORE_FILES)write(root,SKILL_DIR+'/'+file,file==='SKILL.md'?'---\nname: ltzzz-task-execution\ndescription: Fixture portable task skill.\n---\nUse exact task IDs and actual evidence.\n':file.endsWith('.json')?{task_id:'FIXTURE',paid:false,tx_hash:null}:'# '+file+'\nFixture contract: drafts require evidence and independent review.\n');
  write(root,SKILL_DIR+'/references/contributions.md','# Recorded reviewer contributions\nFixture advisory note.\n');
  return await fn(root);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
function prepared(pack){return prepareSkillReview({core:pack.core_sha256,runId:'12345678',issue:201,sourceCommit:'a'.repeat(40),now:'2026-10-22T10:00:00Z'}).record;}
function nativeRow(provider='deepseek',parsed=verdict()){
 const output=JSON.stringify(parsed);
 return {actual_provider:provider,native_provider_call:true,status:'complete',model:'fixture-model',model_source:'provider_response',finish_reason:'stop',output,output_sha256:skillHash(output),review:parsed,model_calls:1};
}
function reviewed(pack){const record=prepared(pack);record.status='native_reviews_finished';record.seats.deepseek={...record.seats.deepseek,...nativeRow('deepseek')};record.seats.doubao={...record.seats.doubao,...nativeRow('doubao')};return record;}
function activate(root,pack,record=reviewed(pack)){
 const directory='knowledge/results/skill-review/'+pack.core_sha256.slice(0,16),reviewPath=directory+'/review.json';
 write(root,reviewPath,record);
 const activationPath=directory+'/activation.json';
 write(root,activationPath,{decision:'activate_with_recorded_resolutions',core_sha256:pack.core_sha256,resolutions:Object.entries(record.seats).filter(([,row])=>row.review).map(([seat,row])=>({seat,kind:'verdict',index:null,output_sha256:row.output_sha256,decision:'retain',reason:'Keep fixture evidence stages distinct.'})),review:{path:reviewPath,sha256:skillHash(fs.readFileSync(path.join(root,reviewPath)))}});
 const manifest={...pack.manifest,enabled:true,activation_review:{path:activationPath,sha256:skillHash(fs.readFileSync(path.join(root,activationPath)))}};
 write(root,'config/ltzzz-skill.json',manifest);return {directory,activationPath,reviewPath};
}

test('inactive draft never injects context or installs client adapters',()=>fixture(root=>{
 const pack=readSkill(root),context=skillContext({root,scope:'daily'});
 assert.equal(context.text,'');assert.equal(context.proof.applied,false);assert.equal(context.proof.status,'draft_not_active');assert.equal(context.proof.core_sha256,pack.core_sha256);
 assert.deepEqual(syncSkillAdapters({root}),{status:'draft_not_installed',paths:[]});
 for(const target of adapters)assert.equal(fs.existsSync(path.join(root,target)),false);
}));

test('a durable review reservation is not re-issued or replayed on another run attempt',()=>fixture(root=>{
 const pack=readSkill(root),record=prepared(pack);
 const reused=prepareSkillReview({core:pack.core_sha256,runId:'99999999',issue:202,sourceCommit:'b'.repeat(40),prior:record});
 assert.equal(reused.execute,false);assert.equal(reused.record,record);
 assert.throws(()=>prepareSkillReview({core:pack.core_sha256,runId:'12345678',attempt:'2',issue:201}),/invalid_skill_review_run/);
 assert.throws(()=>prepareSkillReview({core:pack.core_sha256,runId:'local',issue:201}),/invalid_skill_review_run/);
}));

test('each configured native provider is called once after reservation; missing providers stay unconfigured',()=>fixture(async root=>{
 const pack=readSkill(root),record=prepared(pack),counts={},snapshots=[];
 const candidates=Object.fromEntries([['deepseek','deepseek'],['doubao','doubao'],['qianwen','aliyun_dashscope']].map(([seat,provider])=>[seat,{configured:true,provider,call:async prompt=>{
  counts[seat]=(counts[seat]||0)+1;assert.ok(prompt.includes('Fixture portable task skill'));
  const before=snapshots.at(-1).seats[seat];assert.equal(before.status,'started_completion_unknown');assert.equal(before.model_calls,1);
  return {ok:true,status:'success',model:'fixture-model',model_source:'provider_response',finish_reason:'stop',output:JSON.stringify(verdict()),tokens_used:5};
 }}]));
 await executeSkillReviews(record,{pack,candidates,save:r=>snapshots.push(structuredClone(r))});
 assert.deepEqual(counts,{deepseek:1,doubao:1,qianwen:1});assert.equal(record.model_calls,3);assert.equal(record.native_openai_calls,0);assert.equal(record.native_anthropic_calls,0);
 for(const seat of ['kimi_cn','grok','meta_hosted']){assert.equal(record.seats[seat].status,'not_configured');assert.equal(record.seats[seat].model_calls,0);assert.equal(record.seats[seat].output,undefined);assert.equal(record.seats[seat].actual_provider,undefined);}
 await assert.rejects(()=>executeSkillReviews(record,{pack,candidates}),/durable_skill_reservation_required/);assert.deepEqual(counts,{deepseek:1,doubao:1,qianwen:1});
}));

test('an interrupted started provider is preserved and never invoked again',()=>fixture(async root=>{
 const pack=readSkill(root);
 for(const configured of [true,false]){
  const record=prepared(pack);record.seats.deepseek.status='started_completion_unknown';record.seats.deepseek.model_calls=1;
  let calls=0;
  await executeSkillReviews(record,{pack,candidates:{deepseek:{configured,provider:'deepseek',call:async()=>{calls++;return {ok:true,output:JSON.stringify(verdict()),finish_reason:'stop'};}}}});
  assert.equal(calls,0);assert.equal(record.seats.deepseek.status,'started_completion_unknown');assert.equal(record.seats.deepseek.model_calls,1);
 }
}));

test('truncated, HTTP200-empty, unstructured and hosted-without-finish reviews cannot count for activation',()=>fixture(async root=>{
 const pack=readSkill(root),record=prepared(pack);
 const results={deepseek:{ok:true,status:'success',output:JSON.stringify(verdict()),finish_reason:'length'},doubao:{ok:true,status:'success',http:200,output:'',finish_reason:'stop'},qianwen:{ok:true,status:'success',output:'Approved, but this is not structured review JSON.',finish_reason:'stop'},grok:{ok:true,status:'success',output:JSON.stringify({verdict:'approve',review_end:true}),finish_reason:'stop'},meta_hosted:{ok:true,status:'success',output:JSON.stringify(verdict()),finish_reason:null}};
 const providers={deepseek:'deepseek',doubao:'doubao',qianwen:'aliyun_dashscope',grok:'xai',meta_hosted:'cloudflare-workers-ai'};
 const candidates=Object.fromEntries(Object.keys(results).map(seat=>[seat,{configured:true,provider:providers[seat],call:async()=>({...results[seat],model:'fixture-model'})}]));
 await executeSkillReviews(record,{pack,candidates});assert.equal(record.seats.deepseek.status,'incomplete_or_failed');assert.equal(record.seats.doubao.status,'incomplete_or_unstructured_review');assert.equal(record.seats.meta_hosted.status,'proposal_missing_finish_metadata');
 assert.deepEqual(nativeReviewEvidence(record,pack.core_sha256),[]);activate(root,pack,record);assert.equal(skillContext({root}).proof.applied,false);
}));

test('activation requires two distinct exact native providers bound to the exact core and output hashes',()=>fixture(root=>{
 const pack=readSkill(root),good=reviewed(pack);activate(root,pack,good);
 const context=skillContext({root,scope:'ans'});assert.equal(context.proof.applied,true);assert.equal(context.proof.scope,'ans');assert.equal(context.proof.core_sha256,pack.core_sha256);assert.ok(context.text.includes('Fixture contract'));
 assert.throws(()=>nativeReviewEvidence(good,'f'.repeat(64)),/skill_review_subject_mismatch/);
 const mutations=[
  r=>{r.seats.doubao.actual_provider='deepseek';},
  r=>{r.seats.doubao.native_provider_call=false;},
  r=>{r.seats.doubao.output_sha256='0'.repeat(64);},
  r=>{r.seats.doubao.model=null;},
  r=>{r.seats.doubao.actual_provider=undefined;},
  r=>{r.seats.doubao.output='';r.seats.doubao.output_sha256=skillHash('');},
  r=>{delete r.seats.doubao.review;},
  r=>{r.seats.doubao.review=verdict({verdict:'revise'});},
  r=>{const parsed={verdict:'approve',review_end:true};r.seats.doubao.review=parsed;r.seats.doubao.output=JSON.stringify(parsed);r.seats.doubao.output_sha256=skillHash(r.seats.doubao.output);},
  r=>{const parsed=verdict({verdict:'reject'});r.seats.doubao.review=parsed;r.seats.doubao.output=JSON.stringify(parsed);r.seats.doubao.output_sha256=skillHash(r.seats.doubao.output);},
  r=>{r.core_sha256='e'.repeat(64);}
 ];
 for(const [index,mutate] of mutations.entries()){const invalid=structuredClone(good);mutate(invalid);activate(root,pack,invalid);assert.equal(skillContext({root}).proof.applied,false,'invalid native review mutation '+index);}
}));

test('changes to core, activation bytes, review bytes or activation core disable context injection',()=>fixture(root=>{
 const pack=readSkill(root),corePath=path.join(root,SKILL_DIR,'references/runtime-contract.md'),before=fs.readFileSync(corePath);
 activate(root,pack);fs.appendFileSync(corePath,'Unreviewed instruction.');assert.equal(skillContext({root}).proof.applied,false);fs.writeFileSync(corePath,before);
 let refs=activate(root,pack);fs.appendFileSync(path.join(root,refs.activationPath),' ');assert.equal(skillContext({root}).proof.applied,false);
 refs=activate(root,pack);fs.appendFileSync(path.join(root,refs.reviewPath),' ');assert.equal(skillContext({root}).proof.applied,false);
 refs=activate(root,pack);const activation=JSON.parse(fs.readFileSync(path.join(root,refs.activationPath)));activation.core_sha256='d'.repeat(64);write(root,refs.activationPath,activation);const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/ltzzz-skill.json')));manifest.activation_review.sha256=skillHash(fs.readFileSync(path.join(root,refs.activationPath)));write(root,'config/ltzzz-skill.json',manifest);assert.equal(skillContext({root}).proof.applied,false);
}));

test('all installed mirrors match canonical bytes and check mode detects drift without rewriting it',()=>fixture(root=>{
 const pack=readSkill(root);activate(root,pack);
 assert.throws(()=>syncSkillAdapters({root,check:true}),/skill_adapter_out_of_sync/);
 const installed=syncSkillAdapters({root});assert.equal(installed.status,'repository_adapters_generated_not_client_load_proof');assert.deepEqual(installed.paths,adapters);
 for(const target of adapters)for(const file of [...CORE_FILES,'references/contributions.md'])assert.ok(fs.readFileSync(path.join(root,target,file)).equals(fs.readFileSync(path.join(root,SKILL_DIR,file))));
 assert.equal(syncSkillAdapters({root,check:true}).status,'all_adapters_match');
 const drift=path.join(root,adapters[1],'SKILL.md');fs.appendFileSync(drift,'Unreviewed local drift.');const changed=fs.readFileSync(drift);assert.throws(()=>syncSkillAdapters({root,check:true}),/skill_adapter_out_of_sync/);assert.ok(fs.readFileSync(drift).equals(changed));
 syncSkillAdapters({root});assert.equal(syncSkillAdapters({root,check:true}).status,'all_adapters_match');
}));

test('existing active call receives the exact runtime contract and task prompt once with hash-bound skill proof',()=>fixture(async root=>{
 const pack=readSkill(root);activate(root,pack);
 const prompt='  Task ID: DAILY-FIXTURE\n保留原始输入、空格和末尾换行。\n';
 const context=skillContext({root,scope:'fixture_daily'}),inputs=[];
 const response={ok:true,status:'success',output:'fixture result',model:'native-fixture',request_id:'fixture-request'};
 const actual=await callWithSkill({root,scope:'fixture_daily',prompt},async input=>{inputs.push(input);return response;});
 assert.deepEqual(inputs,[context.text+'\n\n'+prompt]);assert.equal(actual.output,response.output);assert.equal(actual.model,response.model);assert.equal(actual.request_id,response.request_id);
 assert.deepEqual(actual.skill,{...context.proof,prompt_sha256:skillHash(inputs[0])});
 assert.equal(actual.skill.runtime_sha256,skillHash(fs.readFileSync(path.join(root,SKILL_DIR,'references/runtime-contract.md'))));
 assert.equal(actual.skill.core_sha256,pack.core_sha256);assert.equal(actual.skill.applied,true);
}));

test('inactive or missing activation keeps the original prompt and still performs only the existing call',()=>fixture(async root=>{
 const pack=readSkill(root),prompt='No hidden prefix.\n仅执行现有任务。\n';
 for(const enabled of [false,true]){
  write(root,'config/ltzzz-skill.json',{...pack.manifest,enabled,activation_review:enabled?{path:'knowledge/results/skill-review/'+pack.core_sha256.slice(0,16)+'/activation.json',sha256:'a'.repeat(64)}:null});
  let calls=0;
  const actual=await callWithSkill({root,scope:'fixture_inactive',prompt},async input=>{calls++;assert.equal(input,prompt);return {ok:true,output:'unchanged call'};});
  assert.equal(calls,1);assert.equal(actual.output,'unchanged call');assert.equal(actual.skill.applied,false);assert.equal(actual.skill.prompt_sha256,skillHash(prompt));
  assert.equal(actual.skill.status,enabled?'skill_unavailable_or_integrity_error':'draft_not_active');
 }
}));

test('provider failure or exception is never retried and context proof cannot turn it into generation success',()=>fixture(async root=>{
 const pack=readSkill(root);activate(root,pack);let calls=0;
 const failed=await callWithSkill({root,prompt:'Existing reserved task'},async()=>{calls++;return {ok:false,status:'provider_outcome_unknown',output:'partial fixture'};});
 assert.equal(calls,1);assert.equal(failed.ok,false);assert.equal(failed.status,'provider_outcome_unknown');assert.equal(failed.output,'partial fixture');assert.equal(failed.skill.applied,true);
 const failure=new Error('fixture transport interrupted');calls=0;
 await assert.rejects(()=>callWithSkill({root,prompt:'Existing reserved task'},async()=>{calls++;throw failure;}),error=>error===failure);
 assert.equal(calls,1);
}));

test('selected two-provider revision never calls other configured adapters and rejects invalid selections',()=>fixture(async root=>{
 const pack=readSkill(root),selected=['qianwen','doubao'];
 const record=prepareSkillReview({core:pack.core_sha256,runId:'12345678',issue:201,sourceCommit:'a'.repeat(40),selectedSeats:selected}).record;
 const providers={deepseek:'deepseek',doubao:'doubao',qianwen:'aliyun_dashscope',kimi_cn:'moonshot_cn',grok:'xai',meta_hosted:'cloudflare-workers-ai'},calls=[];
 const candidates=Object.fromEntries(SKILL_REVIEW_SEATS.map(seat=>[seat,{configured:true,provider:providers[seat],call:async()=>{calls.push(seat);return {ok:true,status:'success',model:'fixture-model',finish_reason:'stop',output:JSON.stringify(verdict())};}}]));
 await executeSkillReviews(record,{pack,candidates});
 assert.deepEqual(calls.sort(),[...selected].sort());assert.deepEqual(record.selected_seats,selected);assert.equal(record.model_calls,2);
 for(const seat of SKILL_REVIEW_SEATS.filter(s=>!selected.includes(s))){const row=record.seats[seat];assert.equal(row.status,'not_requested_this_revision');assert.equal(row.model_calls,0);assert.equal(row.actual_provider,undefined);assert.equal(row.output,undefined);}
 for(const selectedSeats of [null,'all',[],['doubao'],['doubao','doubao'],['deepseek','microsoft'],['deepseek',null]])assert.throws(()=>prepareSkillReview({core:pack.core_sha256,runId:'12345678',issue:201,selectedSeats}),/invalid_skill_review_seats/);
}));

test('activation addresses every risk and addition with exact output hash, known index and nonblank reason',()=>fixture(root=>{
 const pack=readSkill(root),record=reviewed(pack);
 record.seats.deepseek={...record.seats.deepseek,...nativeRow('deepseek',verdict({verdict:'revise',risks:[{section:'task-card',problem:'Acceptance evidence needs exact task identity.',blocking:true}],additions:[{section:'receipt',text:'Record original task identity.',why:'Avoid aliasing the daily task.'}]}))};
 const refs=activate(root,pack,record),file=path.join(root,refs.activationPath),base=JSON.parse(fs.readFileSync(file));
 assert.equal(skillContext({root}).proof.applied,false,'verdict-only resolution cannot address actual risks and additions');
 base.resolutions.push({seat:'deepseek',kind:'risk',index:0,output_sha256:record.seats.deepseek.output_sha256,decision:'defer',reason:'Retain the existing task gate; track follow-up without claiming it fixed.'},{seat:'deepseek',kind:'addition',index:0,output_sha256:record.seats.deepseek.output_sha256,decision:'adopt',reason:'Keep the exact original task identity in the receipt.'});
 const persist=activation=>{write(root,refs.activationPath,activation);const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/ltzzz-skill.json')));manifest.activation_review.sha256=skillHash(fs.readFileSync(file));write(root,'config/ltzzz-skill.json',manifest);};
 persist(base);assert.equal(skillContext({root}).proof.applied,true);
 const invalid=[
  {label:'missing risk resolution',change:a=>{a.resolutions=a.resolutions.filter(r=>r.kind!=='risk');}},
  {label:'missing addition resolution',change:a=>{a.resolutions=a.resolutions.filter(r=>r.kind!=='addition');}},
  {label:'wrong risk output hash',change:a=>{a.resolutions.find(r=>r.kind==='risk').output_sha256='0'.repeat(64);}},
  {label:'wrong verdict output hash',change:a=>{a.resolutions.find(r=>r.kind==='verdict').output_sha256='0'.repeat(64);}},
  {label:'blank reason',change:a=>{a.resolutions.find(r=>r.kind==='addition').reason=' \n ';}},
  {label:'missing reason',change:a=>{delete a.resolutions.find(r=>r.kind==='risk').reason;}},
  {label:'unknown risk index',change:a=>{a.resolutions.push({...a.resolutions.find(r=>r.kind==='risk'),index:1});}},
  {label:'negative addition index',change:a=>{a.resolutions.push({...a.resolutions.find(r=>r.kind==='addition'),index:-1});}},
  {label:'unknown finding kind',change:a=>{a.resolutions.push({...a.resolutions.find(r=>r.kind==='risk'),kind:'unknown'});}},
  {label:'unknown decision',change:a=>{a.resolutions.find(r=>r.kind==='risk').decision='ignore';}}
 ];
 for(const {label,change} of invalid){const activation=structuredClone(base);change(activation);persist(activation);assert.equal(skillContext({root}).proof.applied,false,label);}
}));


test('supplement preserves archived outcomes and invokes only an unrequested provider once',()=>fixture(async root=>{
 const pack=readSkill(root),first=prepareSkillReview({core:pack.core_sha256,runId:'11111111',issue:204,sourceCommit:'a'.repeat(40),selectedSeats:['deepseek','doubao']}).record;
 first.status='native_reviews_finished';Object.assign(first.seats.deepseek,nativeRow('deepseek'));first.seats.doubao.status='incomplete_or_failed';first.seats.doubao.model_calls=1;
 const before=structuredClone(first),next=prepareSkillReview({core:pack.core_sha256,runId:'22222222',issue:205,sourceCommit:'b'.repeat(40),selectedSeats:['qianwen'],supplement:true,prior:first});
 assert.equal(next.archive,first);assert.deepEqual(first,before);assert.deepEqual(next.record.seats.deepseek,first.seats.deepseek);assert.deepEqual(next.record.seats.doubao,first.seats.doubao);
 assert.equal(next.record.round_history[0].record_sha256,skillHash(JSON.stringify(before,null,2)+'\n'));
 const counts={};await executeSkillReviews(next.record,{pack,candidates:Object.fromEntries(SKILL_REVIEW_SEATS.map(seat=>[seat,{configured:true,provider:seat==='qianwen'?'aliyun_dashscope':seat,call:async()=>{counts[seat]=(counts[seat]||0)+1;return {ok:true,status:'success',model:'fixture',finish_reason:'stop',output:JSON.stringify(verdict())};}}]))});
 assert.deepEqual(counts,{qianwen:1});assert.equal(nativeReviewEvidence(next.record,pack.core_sha256).length,2);
 for(const seat of ['deepseek','doubao','qianwen'])assert.throws(()=>prepareSkillReview({core:pack.core_sha256,runId:'33333333',issue:206,sourceCommit:'c'.repeat(40),selectedSeats:[seat],supplement:true,prior:next.record}),/supplement_only_previously_unrequested_seats/);
 assert.throws(()=>prepareSkillReview({core:'0'.repeat(64),runId:'33333333',issue:206,selectedSeats:['grok'],supplement:true,prior:next.record}),/supplement_only_previously_unrequested_seats/);
}));


test('malformed explicit review selection fails closed instead of defaulting to all paid adapters',()=>{
 assert.deepEqual(reviewSelectionFromBody('ordinary owner review'),{selectedSeats:undefined,supplement:false});
 assert.deepEqual(reviewSelectionFromBody('native-review-seats: deepseek,doubao\ncontext'),{selectedSeats:['deepseek','doubao'],supplement:false});
 assert.deepEqual(reviewSelectionFromBody('supplement-review-seats: qianwen'),{selectedSeats:['qianwen'],supplement:true});
 for(const body of ['native-review-seats: doubao, qianwen','native-review-seats: deepseek-doubao','supplement-review-seats: ','native-review-seats: deepseek,doubao\nsupplement-review-seats: qianwen',' native-review-seats: deepseek,doubao'])assert.throws(()=>reviewSelectionFromBody(body),/invalid_explicit_review_selection/);
});
