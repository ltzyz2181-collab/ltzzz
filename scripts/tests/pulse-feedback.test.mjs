import test from 'node:test';import assert from 'node:assert/strict';
import {evolve} from '../../workers/pulse-worker/engine.js';import config from '../../workers/pulse-worker/pulse.json' with {type:'json'};
const now=Date.parse('2026-10-19T08:00:00Z');
const observations=(ok=true)=>({heartbeats:config.targets.map(t=>({name:t.name,ok:t.name==='doubao'?ok:true,http:t.name==='doubao'&&!ok?503:200})),wallet:{ok:true,units:'20000000',balance_usdc:'20'}});
test('three real failures pause dispatch; two independent successes resolve the same reflex case',()=>{
 let state={};for(let i=0;i<3;i++)state=evolve(state,observations(false),config,now+i*300000).state;
 assert.equal(state.agents.doubao.dispatch_allowed,false);const item=state.autonomic_feedback.cases[0];assert.equal(item.status,'open');assert.equal(item.action_taken.type,'pause_agent_dispatch');assert.equal(item.follow_up_receipt,null);
 state=evolve(state,observations(true),config,now+900000).state;assert.equal(state.autonomic_feedback.cases[0].status,'open');
 state=evolve(state,observations(true),config,now+1200000).state;
 const done=state.autonomic_feedback.cases[0];assert.equal(done.id,item.id);assert.equal(done.status,'resolved');assert.equal(done.follow_up_receipt.dispatch_allowed,true);assert.equal(state.autonomic_feedback.real_money_penalty,false);assert.equal(done.paid,false);
});
test('manual pause is retained after health recovery and never reported as restored dispatch',()=>{
 let state={};for(let i=0;i<3;i++)state=evolve(state,observations(false),config,now+i*300000).state;
 state.manual={doubao:true};for(let i=3;i<5;i++)state=evolve(state,observations(true),config,now+i*300000).state;
 assert.equal(state.autonomic_feedback.cases[0].status,'open_controller_pause_retained');assert.equal(state.agents.doubao.dispatch_allowed,false);
});
test('unknown common collector failure is not invented as six agent incidents or six penalties',()=>{
 const o=observations();o.heartbeats.forEach(h=>{h.ok=false;h.http=null;});let state={};for(let i=0;i<5;i++)state=evolve(state,o,config,now+i*300000).state;
 assert.equal(state.autonomic_feedback.cases.length,0);assert.equal(state.autonomic_feedback.financial_execution,false);assert.equal(state.autonomic_feedback.model_generation_proven,false);
});
test('feedback survives ordinary healthy probes without generating a duplicate episode',()=>{
 let state={};for(let i=0;i<3;i++)state=evolve(state,observations(false),config,now+i*300000).state;
 for(let i=3;i<10;i++)state=evolve(state,observations(true),config,now+i*300000).state;
 assert.equal(state.autonomic_feedback.cases.length,1);assert.equal(state.autonomic_feedback.open_cases,0);assert.equal(state.autonomic_feedback.scope,'actual_health_dispatch_reflexes_not_arbitrary_patch_deployment');
});
