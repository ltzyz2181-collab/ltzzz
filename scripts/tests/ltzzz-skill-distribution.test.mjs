import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {pinnedRelease,distributionArtifacts,metaInlinePrompt,prepareMetaConsumption,consumeMetaInline,RELEASE_COMMIT,DISTRIBUTION_TASK} from '../lib/ltzzz-skill-distribution.mjs';
import {skillHash} from '../lib/ltzzz-skill.mjs';
const release=pinnedRelease();
const prepared=()=>prepareMetaConsumption({release,runId:'123456789',issue:215,sourceCommit:'a'.repeat(40)}).record;
const answer=JSON.stringify({case1_stage:'draft',case2_actual_provider:'deepseek',case3_paid:false,case3_tx_hash:null,end:'SKILL_DONE'});
const result=r=>({ok:true,status:'proposal_completed',task_id:r.task_id,provider:'cloudflare-workers-ai',model:'fixture-llama',output:answer,http:200});

test('release has six exact LF git blobs at one full commit, not rolling links or empty runtime',()=>{
 assert.match(RELEASE_COMMIT,/^[a-f0-9]{40}$/);assert.equal(release.files.length,6);
 for(const f of release.files){assert.ok(f.url.includes('/'+RELEASE_COMMIT+'/'));assert.ok(!f.url.includes('/main/'));assert.equal(f.sha256,skillHash(f.text));assert.equal(f.bytes,Buffer.byteLength(f.text));assert.ok(!f.text.includes('\r'));}
 assert.equal(release.files.find(f=>f.path.endsWith('runtime-contract.md')).bytes,1198);
 const schema=JSON.parse(release.files.find(f=>f.path.endsWith('receipt-template.json')).text);assert.equal('reasoningHash' in schema,false);
});
test('all 11 active seats receive cards, Microsoft is excluded and Meta gets the exact full Skill',()=>{
 const registry=JSON.parse(fs.readFileSync('identity/seat-registry.json','utf8'));
 const artifacts=distributionArtifacts(release,registry);assert.equal(artifacts.size,12);
 assert.ok(![...artifacts.keys()].some(f=>f.includes('/microsoft/')));
 const card=artifacts.get(`ops/dispatch/inbox/meta/${DISTRIBUTION_TASK}-meta.md`);
 const full=release.files.find(f=>f.path.endsWith('/SKILL.md')).text;
 assert.equal(card.split(full).length,2);assert.ok(card.includes('not_client_acceptance'));
 assert.ok(artifacts.get(`ops/dispatch/inbox/claude/${DISTRIBUTION_TASK}-claude.md`).includes('不要求安装'));
});
test('Meta receives unabridged inline text within actual Worker limits and executor-bound hashes',()=>{
 const r=prepared();assert.ok(r.prompt.length<=6000);assert.ok(JSON.stringify({task_id:r.task_id,kind:'analysis',prompt:r.prompt}).length<=12000);
 assert.equal(r.prompt_sha256,skillHash(r.prompt));assert.equal(r.request_body_sha256,skillHash(JSON.stringify({task_id:r.task_id,kind:'analysis',prompt:r.prompt})));
 const changed=structuredClone(release);changed.files[0].text+='drift';assert.throws(()=>metaInlinePrompt(changed),/inline_skill_hash_mismatch/);
});
test('one release reservation suppresses retries on success, failure and unknown outcomes',()=>{
 for(const status of ['reserved_before_generation','started_completion_unknown','inline_skill_consumption_unverified_no_retry','inline_skill_consumed_scenarios_passed_not_business_acceptance']){
  const prior={...prepared(),status};assert.deepEqual(prepareMetaConsumption({release,prior}),{execute:false,record:prior});
 }
 assert.throws(()=>prepareMetaConsumption({release,runId:'123',attempt:'2',issue:1,sourceCommit:'a'.repeat(40)}),/invalid_meta_consumption_reservation/);
});
test('one actual response may pass scenarios but does not claim client install, finish metadata or business acceptance',async()=>{
 const r=prepared();let calls=0;const snapshots=[];
 await consumeMetaInline(r,{save:x=>snapshots.push(structuredClone(x)),call:async body=>{calls++;assert.equal(body.prompt,r.prompt);assert.equal(snapshots.at(-1).status,'started_completion_unknown');return result(r);}});
 assert.equal(calls,1);assert.equal(r.scenarios_verified,true);assert.equal(r.model_calls,1);assert.equal(r.actual_provider,'cloudflare-workers-ai');assert.equal(r.finish_reason,null);assert.equal(r.tokens_used,null);assert.equal(r.actual_client_load_verified,false);assert.equal(r.paid,false);assert.equal(r.tx_hash,null);
 await assert.rejects(()=>consumeMetaInline(r,{call:async()=>{calls++;}}),/fresh_meta_consumption_reservation_required/);assert.equal(calls,1);
});
test('HTTP 200 empty, wrong task/provider, echo-only and semantically wrong replies are not accepted',async()=>{
 for(const patch of [{output:''},{task_id:'other'},{provider:'meta-self-report'},{output:RELEASE_COMMIT},{output:JSON.stringify({case1_stage:'deployed',case2_actual_provider:'Claude',case3_paid:true,case3_tx_hash:null,end:'SKILL_DONE'})}]){
  const r=prepared();await consumeMetaInline(r,{call:async()=>({...result(r),...patch})});assert.equal(r.scenarios_verified,false);assert.equal(r.status,'inline_skill_consumption_unverified_no_retry');
 }
});
test('timeout is recorded once, an altered prompt fails before invocation',async()=>{
 const r=prepared();let calls=0;await consumeMetaInline(r,{call:async()=>{calls++;throw Error('timeout');}});assert.equal(calls,1);assert.equal(r.scenarios_verified,false);assert.equal(r.provider_status,'transport_outcome_unknown_no_retry');
 const tampered=prepared();tampered.prompt+='different';await assert.rejects(()=>consumeMetaInline(tampered,{call:async()=>{calls++;}}),/fresh_meta_consumption_reservation_required/);assert.equal(calls,1);
});
