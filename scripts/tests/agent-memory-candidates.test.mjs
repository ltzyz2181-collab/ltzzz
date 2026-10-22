import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {spawnSync} from 'node:child_process';
import {collectAgentMemory} from '../../tools/agent-memory-candidates.mjs';
const date='2026-10-22',now='2026-10-22T08:00:00Z';
const entry=(extra={})=>({date,executed_by:'doubao',model:'fixture-model',finish_reason:'stop',delivery_integrity:{status:'structurally_complete',accepted:false},output:'【读后感】不把草稿当事实。\\n【观】本轮HTTP健康检查不能证明模型已经生成正文，也不能证明任务已经部署。\\n【不确定】没有读取对应API原始回执，仍需独立复核。\\n【交付结束】',...extra});
function fixture(fn){const root=fs.mkdtempSync(path.join(os.tmpdir(),'agent-memory-'));try{fs.mkdirSync(path.join(root,'data/memory'),{recursive:true});return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}}
function write(root,agent,entries){fs.writeFileSync(path.join(root,'data/memory',agent+'.json'),JSON.stringify({agent,entries}));}
test('new Agent JSON is collected as an attributed unverified candidate, preserving uncertainty and source hash',()=>fixture(root=>{
 write(root,'doubao',[entry()]);const r=collectAgentMemory({root,date,now});assert.equal(r.items.length,1);const i=r.items[0];assert.equal(i.status,'candidate');assert.equal(i.human_confirm,false);assert.equal(i.claim_type,'agent_observation_unverified');assert.equal(i.origin.path,'data/memory/doubao.json');assert.match(i.source_sha256,/^[a-f0-9]{64}$/);const bytes=fs.readFileSync(path.join(root,i.source),'utf8');assert.ok(bytes.includes(i.claim));assert.ok(bytes.includes('仍需独立复核'));assert.ok(bytes.includes('尚未独立核验'));
}));
test('replay is immutable and append to mutable Agent file does not change the prior snapshot',()=>fixture(root=>{
 const first=entry();write(root,'doubao',[first]);const a=collectAgentMemory({root,date,now});write(root,'doubao',[first,entry({date:'2026-10-23'})]);const b=collectAgentMemory({root,date,now:'2026-10-22T09:00:00Z'});assert.deepEqual(a.items,b.items);assert.equal(fs.readdirSync(path.join(root,'memory/daily')).length,1);
}));
test('incomplete output, rejected attribution, metadata and sensitive content are not copied as memory',()=>fixture(root=>{
 write(root,'doubao',[entry({finish_reason:'length'}),entry({source_attribution_review:{eligible_for_promotion:false}}),entry({output:'【观】writer: GitHub Actions patrol metadata only【交付结束】'}),entry({output:'【观】'+ 'sk-'+'x'.repeat(30)})]);const r=collectAgentMemory({root,date,now});assert.equal(r.items.length,0);assert.deepEqual(r.coverage.map(x=>x.skipped),['incomplete_or_unverified_delivery','source_attribution_rejected','no_substantive_observation','sensitive_output_not_copied']);
}));
test('real scanner creates one candidate per source entry and never applies or edits core memory on replay',()=>fixture(root=>{
 write(root,'doubao',[entry()]);fs.mkdirSync(path.join(root,'ltzzz-memory'));fs.writeFileSync(path.join(root,'ltzzz-memory/important.md'),'original');const script=path.resolve('tools/promote-memory.mjs');for(let n=0;n<2;n++){const r=spawnSync(process.execPath,[script,'--collect-only','--date',date],{cwd:root,encoding:'utf8'});assert.equal(r.status,0,r.stderr);}const q=JSON.parse(fs.readFileSync(path.join(root,'memory/promote/queue.json')));assert.equal(q.items.length,1);assert.deepEqual(q.applied,[]);assert.equal(q.items[0].review_status,'pending_review');assert.equal(fs.readFileSync(path.join(root,'ltzzz-memory/important.md'),'utf8'),'original');assert.equal(fs.existsSync(path.join(root,'memory/long-term')),false);
}));
