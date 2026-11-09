import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {buildDailyCard,DAILY_TASK_ID,PUBLIC_READSET_PATHS,trustedDailyContext} from '../run-deep-superagent-daily.mjs';
import {validateJob} from '../run-deep-superagent-queue.mjs';
import {normalizeJob,REVISION} from '../../workers/deep-superagent/index.js';

const hash=x=>createHash('sha256').update(x).digest('hex');
const sourceBytes=()=>PUBLIC_READSET_PATHS.map(path=>({path,bytes:Buffer.from(`public source: ${path}`)}));
function snapshot(date='2026-11-09'){
 return Buffer.from(JSON.stringify({date,at:`${date}T00:00:00Z`,backlog:{open_warning_cases:3,unique_original_tasks:3,not_rechecked_in_current_window:2,by_responsible_seat:{doubao:1},oldest_first:[{task_id:'ANS-OLD-01'}]},tasks:[{id:'ANS-OLD-01',issue:'engineering_completion_unverified',status:'warning_required',evidence:['knowledge/results/ans-cycle/old.json']}]}));
}
test('daily card binds a fixed public readset to stable idempotent package identity',()=>{
 const first=buildDailyCard({businessDate:'2026-11-09',latestBytes:snapshot(),sourceBytes:sourceBytes()});
 const second=buildDailyCard({businessDate:'2026-11-09',latestBytes:snapshot(),sourceBytes:sourceBytes()});
 assert.equal(first.body.task_id,DAILY_TASK_ID);assert.equal(first.body.platform,'internal');assert.equal(first.body.data_classification,'public_distributable');
 assert.equal(first.body.package_id,second.body.package_id);assert.equal(first.input_sha256,second.input_sha256);assert.equal(first.source_readset.length,PUBLIC_READSET_PATHS.length);
 assert.match(first.body.prompt,/ANS-OLD-01/);assert.match(first.body.prompt,/SHA-256/);assert.doesNotMatch(first.body.prompt,/API_KEY|Bearer /);
});
test('changed readset or oversight snapshot changes package key; an identical day cannot hide changed inputs',()=>{
 const a=buildDailyCard({businessDate:'2026-11-09',latestBytes:snapshot(),sourceBytes:sourceBytes()});
 const changed=Buffer.from(snapshot().toString().replace('"open_warning_cases":3','"open_warning_cases":4'));
 const b=buildDailyCard({businessDate:'2026-11-09',latestBytes:changed,sourceBytes:sourceBytes()});
 assert.notEqual(a.body.package_id,b.body.package_id);assert.notEqual(a.input_sha256,b.input_sha256);
});
test('daily readset rejects missing sources, bad dates, mismatched dates and oversized prompts',()=>{
 assert.throws(()=>buildDailyCard({businessDate:'bad',latestBytes:snapshot(),sourceBytes:sourceBytes()}));
 assert.throws(()=>buildDailyCard({businessDate:'2026-11-08',latestBytes:snapshot(),sourceBytes:sourceBytes()}));
 assert.throws(()=>buildDailyCard({businessDate:'2026-11-09',latestBytes:snapshot(),sourceBytes:sourceBytes().slice(1)}));
 const badCount=Buffer.from(snapshot().toString().replace('"open_warning_cases":3','"open_warning_cases":"many"'));
 assert.throws(()=>buildDailyCard({businessDate:'2026-11-09',latestBytes:badCount,sourceBytes:sourceBytes()}));
});
test('only trusted main schedule or manual dispatch can execute daily; PR and other repos are blocked',()=>{
 const base={GITHUB_REPOSITORY:'ltzyz2181-collab/ltzzz',GITHUB_REF:'refs/heads/main',GITHUB_EVENT_NAME:'schedule',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'123',GITHUB_RUN_ATTEMPT:'1',GITHUB_EVENT_PATH:'/tmp/deep-daily-test-event.json'};
 fs.writeFileSync(base.GITHUB_EVENT_PATH,JSON.stringify({repository:{full_name:'ltzyz2181-collab/ltzzz'}}));
 assert.equal(trustedDailyContext(base).source_commit,'a'.repeat(40));
 for(const patch of [{GITHUB_EVENT_NAME:'pull_request'},{GITHUB_REF:'refs/heads/other'},{GITHUB_REPOSITORY:'other/repo'}])assert.throws(()=>trustedDailyContext({...base,...patch}));
});
test('daily jobs are hard-capped at three receipts while ordinary jobs retain existing cap',()=>{
 const daily=normalizeJob({task_id:DAILY_TASK_ID,package_id:'readset-test',prompt:'public',data_classification:'public_distributable',platform:'internal'});
 const base={...daily,input_sha256:hash(JSON.stringify(daily)),execution_id:'exec',source_commit:'b'.repeat(40),revision:REVISION,status:'blocked',terminal:true,financial_execution:false,external_submissions_enabled:false,paid:false,tx_hash:null};
 assert.throws(()=>validateJob({...base,model_calls:4,receipts:[{},{},{},{}]},{task_id:daily.task_id,package_id:daily.package_id,input_sha256:base.input_sha256}));
 assert.doesNotThrow(()=>validateJob({...base,model_calls:3,receipts:[{},{},{}]},{task_id:daily.task_id,package_id:daily.package_id,input_sha256:base.input_sha256}));
});
