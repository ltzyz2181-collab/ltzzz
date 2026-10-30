import test from 'node:test';
import assert from 'node:assert/strict';
import {createControllerDecisionAuthority,controllerDecisionMatches,controllerDecisionEvidence} from '../lib/controller-decision.mjs';
const now=1793340000000,subject={scope:'test',policy_sha256:'a'.repeat(64),command:'activate'};
const principal={verified:true,controller_id:'gpt',identity_evidence_sha256:'b'.repeat(64)};
const make=p=>createControllerDecisionAuthority({controllerIds:['gpt','qianwen'],authenticate:async()=>p});
test('existing authenticated controller grants a bound capability without a model or private key',async()=>{
 const token=await make(principal)({subject,now});assert.ok(controllerDecisionMatches(token,{subject,now}));
 assert.equal(controllerDecisionEvidence(token).independent_model_quorum_verified,false);
 for(const forged of [{verified:true},controllerDecisionEvidence(token),JSON.parse(JSON.stringify(token)),structuredClone(token)])assert.equal(controllerDecisionMatches(forged,{subject,now}),false);
});
for(const p of [{...principal,verified:false},{...principal,controller_id:'claude'}, {...principal,identity_evidence_sha256:null},{...principal,valid_until_ms:now}])test('unverified or unregistered identity cannot decide '+JSON.stringify(p),async()=>assert.rejects(make(p)({subject,now})));
test('decision cannot authorize another policy, future time, expiration or operation',async()=>{
 const token=await make(principal)({subject,now});
 for(const changed of [{...subject,command:'unfreeze'},{...subject,policy_sha256:'c'.repeat(64)}])assert.equal(controllerDecisionMatches(token,{subject:changed,now}),false);
 for(const at of [now-1,now+300000])assert.equal(controllerDecisionMatches(token,{subject,now:at}),false);
});
test('caller cannot change intent during asynchronous authentication',async()=>{
 let done;const authorize=createControllerDecisionAuthority({controllerIds:['gpt'],authenticate:()=>new Promise(r=>{done=r;})});
 const intended=structuredClone(subject),pending=authorize({subject:intended,now});intended.command='unfreeze';done(principal);
 const token=await pending;assert.ok(controllerDecisionMatches(token,{subject,now}));assert.equal(controllerDecisionMatches(token,{subject:intended,now}),false);
});
test('public evidence is a copy and carries no supplied credential fields',async()=>{
 const token=await make({...principal,token:'never-export'})({subject,now}),e=controllerDecisionEvidence(token);e.controller_id='attacker';
 assert.equal(controllerDecisionEvidence(token).controller_id,'gpt');assert.equal(JSON.stringify(e).includes('never-export'),false);
});
test('malformed or cyclic subjects never match an authenticated decision',async()=>{
 const token=await make(principal)({subject,now}),cycle={};cycle.self=cycle;
 for(const bad of [undefined,null,'text',[],cycle])assert.equal(controllerDecisionMatches(token,{subject:bad,now}),false);
});
