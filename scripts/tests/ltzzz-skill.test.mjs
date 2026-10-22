import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {CORE_FILES,SKILL_DIR,readSkill,skillContext,skillHash,syncSkillAdapters,nativeReviewEvidence} from '../lib/ltzzz-skill.mjs';
import {SKILL_REVIEW_SEATS,prepareSkillReview,executeSkillReviews} from '../lib/ltzzz-skill-review.mjs';

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
 write(root,activationPath,{decision:'activate_with_recorded_resolutions',core_sha256:pack.core_sha256,resolutions:[{section:'fixture',resolution:'Keep evidence stages distinct.'}],review:{path:reviewPath,sha256:skillHash(fs.readFileSync(path.join(root,reviewPath)))}});
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
