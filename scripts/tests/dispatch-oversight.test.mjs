import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {inspectDispatches,runDispatchOversight,qianwenOversightContext,OVERSIGHT_ROOT} from '../lib/dispatch-oversight.mjs';
const now='2026-10-22T15:00:00Z';
const fixture=fn=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'oversight-'));try{return fn(root);}finally{fs.rmSync(root,{recursive:true,force:true});}};
const write=(root,file,d)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),typeof d==='string'?d:JSON.stringify(d));};
const sha=b=>createHash('sha256').update(b).digest('hex');
function board(root,{claim=true,submitted=true,review=false,reviewer='doubao',instruction='交检查报告',sourceId='CONTROL-2026-10-22-deepseek'}={}) {
 const artifact={date:'2026-10-22',run_key:'run',task_id:'DAILY-2026-10-22-deepseek',logical_seat:'deepseek',source_commit:'fixture',status:'complete',output:'检查完成，证据待审。\n【交付结束】',finish_reason:'stop'};
 const bytes=JSON.stringify(artifact),h=sha(bytes),file=`knowledge/results/daily-board/artifacts/2026-10-22-deepseek-${h}.json`;
 write(root,file,bytes);
 const rb=JSON.stringify({artifact_sha256:h,task_id:artifact.task_id,date:artifact.date,run_key:'run',source_commit:'fixture',actual_provider:reviewer,actual_model:'fixture-model',accepted:true}),rh=sha(rb),rp=`knowledge/results/daily-board/reviews/review-${rh}.json`;write(root,rp,rb);
 const ledger={date:'2026-10-22',run_key:'run',source_commit:'fixture',seats:{deepseek:{status:'submitted_pending_review',assignment:{id:artifact.task_id,source_task_id:sourceId,instruction},claim_verified:claim,claim_receipt:{task_id:artifact.task_id,run_key:'run'},submission_verified:submitted,artifact:{path:file,sha256:h},review_verified:review,review_receipt:review?{task_id:artifact.task_id,reviewed_sha256:h,evidence_path:rp,evidence_sha256:rh,worker_actual_provider:'deepseek',reviewer_actual_provider:reviewer,accepted:true}:null}}};
 write(root,'knowledge/results/daily-board/2026-10-22.json',ledger);return {ledger,file};
}
test('no warnings before explicit coordinator and external deadlines',()=>fixture(root=>{
 const report=inspectDispatches({root,now:'2026-10-22T00:00:00Z',lookback:1});assert.equal(report.tasks.filter(t=>t.overdue).length,0);
}));
test('missing dispatch issues one same-ID card; hourly repeats do not multiply warning days or change it',()=>fixture(root=>{
 const a=runDispatchOversight({root,now,lookback:1}),w=a.warnings.find(w=>w.task_id==='DAILY-2026-10-22-claude');
 assert.ok(w);assert.equal(w.warning_days,1);assert.equal(a.model_calls,0);assert.equal(a.controller_permissions_reduced,false);assert.equal(a.paid,false);
 const bytes=fs.readFileSync(path.join(root,w.repair_file),'utf8');assert.ok(bytes.includes('Task ID: `DAILY-2026-10-22-claude`'));
 const b=runDispatchOversight({root,now:'2026-10-22T15:30:00Z',lookback:1});assert.equal(b.warnings.find(x=>x.case_id===w.case_id).warning_days,1);assert.equal(fs.readFileSync(path.join(root,w.repair_file),'utf8'),bytes);
 const c=runDispatchOversight({root,now:'2026-10-23T15:00:00Z',lookback:2});assert.equal(c.warnings.find(x=>x.case_id===w.case_id).severity,'repeated_warning');assert.equal(c.warnings.find(x=>x.case_id===w.case_id).warning_days,2);
}));
test('JSON board is seen with no Markdown; verified submission is not independent review',()=>fixture(root=>{
 board(root);const t=inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.id==='DAILY-2026-10-22-deepseek');assert.equal(t.phase,'review_missing');assert.equal(t.submission_verified,true);assert.equal(t.overdue,true);
}));
test('only explicit resolver source ID maps CONTROL to DAILY; no duplicate dispatch',()=>fixture(root=>{
 write(root,'knowledge/results/control/2026-10-21.json',{date:'2026-10-21',dispatches:[{agent:'deepseek',execute_on:'2026-10-22',instruction:'task'}]});board(root);
 const tasks=inspectDispatches({root,now,lookback:2}).tasks;assert.equal(tasks.some(t=>t.id==='CONTROL-2026-10-22-deepseek'),false);assert.equal(tasks.filter(t=>t.id==='DAILY-2026-10-22-deepseek').length,1);
}));
test('artifact tampering or unverified claim prevents submitted status',()=>fixture(root=>{
 const b=board(root);fs.appendFileSync(path.join(root,b.file),' ');assert.equal(inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek').phase,'delivery_missing');
 board(root,{claim:false});assert.equal(inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek').phase,'claim_missing');
}));
test('same provider, alias or missing review bytes never proves independent acceptance',()=>fixture(root=>{
 board(root,{review:true,reviewer:'DeepSeek'});assert.equal(inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek').phase,'review_missing');
 const {ledger}=board(root,{review:true});ledger.seats.deepseek.review_receipt.evidence_path='../../etc/passwd';write(root,'knowledge/results/daily-board/2026-10-22.json',ledger);assert.equal(inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek').independent_review_verified,false);
}));
test('accepted engineering draft still warns when assignment requests code/PR, never deployed',()=>fixture(root=>{
 board(root,{review:true,instruction:'交补丁、测试、commit 和 PR'});const t=inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek');assert.equal(t.issue,'engineering_completion_unverified');assert.equal(t.deployed,false);assert.equal(t.overdue,true);
}));
test('hash-bound test run and exact-task PR closeout resolves code delivery, still cannot claim deployment',()=>fixture(root=>{
 board(root,{review:true,instruction:'交补丁、测试和 PR'});const source='a'.repeat(40),artifact='补丁实物',testRun=JSON.stringify({run_id:'12345678',source_commit:source,passed:8,failed:0});
 write(root,'knowledge/results/desktop/fix.md',artifact);write(root,'knowledge/results/desktop/tests.json',testRun);
 const c={task_id:'DAILY-2026-10-22-deepseek',source_commit:source,run_id:'12345678',pr_url:'https://github.com/ltzyz2181-collab/ltzzz/pull/999',artifact:{path:'knowledge/results/desktop/fix.md',sha256:sha(artifact)},tests:{path:'knowledge/results/desktop/tests.json',sha256:sha(testRun),passed:true,count:8}};
 write(root,OVERSIGHT_ROOT+'/closeouts/'+c.task_id+'.json',c);let t=inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek');assert.equal(t.phase,'engineering_delivery_verified_not_deployed');assert.equal(t.overdue,false);assert.equal(t.deployed,false);
 c.task_id='OTHER';write(root,OVERSIGHT_ROOT+'/closeouts/DAILY-2026-10-22-deepseek.json',c);t=inspectDispatches({root,now,lookback:1}).tasks.find(t=>t.assigned_to==='deepseek');assert.equal(t.engineering_completion_verified,false);
}));
test('uncertain ANS generation gets reconcile-only reminder, never another purchase',()=>fixture(root=>{
 write(root,'knowledge/results/ans-cycle/2026-10-22.json',{date:'2026-10-22',status:'blocked_provider_or_incomplete'});const r=runDispatchOversight({root,now,lookback:1}),w=r.warnings.find(w=>w.task_id==='ANS-2026-10-22-doubao');assert.ok(w);assert.equal(r.automatic_financial_replay,false);assert.ok(fs.readFileSync(path.join(root,w.repair_file),'utf8').includes('不得因补派自动重购'));
}));
test('prior warning phase is superseded only after same task evidence changes; absent history is not completion',()=>fixture(root=>{
 runDispatchOversight({root,now,lookback:1});write(root,'ops/dispatch/DAILY-2026-10-22-claude.md','assigned');
 runDispatchOversight({root,now:'2026-10-22T15:30:00Z',lookback:1});const cases=JSON.parse(fs.readFileSync(path.join(root,OVERSIGHT_ROOT,'warnings.json'))).cases;assert.equal(Object.values(cases).find(c=>c.task_id==='DAILY-2026-10-22-claude'&&c.issue==='dispatch_missing').state,'superseded_by_current_phase');
 const later=runDispatchOversight({root,now:'2026-11-01T15:00:00Z',lookback:1});assert.ok(later.warnings.some(w=>w.task_id==='DAILY-2026-10-22-claude'));
}));
test('supervision prompt added to existing Qwen call; no native identity or second daily reservation',()=>fixture(root=>{
 const prompt=qianwenOversightContext({root,now});assert.ok(prompt.includes('派单监督'));assert.ok(prompt.includes('原 Task ID'));const source=fs.readFileSync('scripts/run-daily-tasks.mjs','utf8');assert.ok(source.includes('qianwenOversightContext({root:ROOT})'));assert.equal((source.match(/await runReservedSeat\(/g)||[]).length,1);
}));
test('malformed task identities cannot write reminder files outside repository',()=>fixture(root=>{
 write(root,'config/claude-team.json',{role_acceptances:{claude:{status:'accepted_planning_audit_only',tasks:['../../bad']}}});runDispatchOversight({root,now,lookback:1});assert.equal(fs.existsSync(path.join(root,'ops/bad.md')),false);
 assert.throws(()=>runDispatchOversight({root,now,runId:'../oops'}),/invalid_oversight_run/);
}));
