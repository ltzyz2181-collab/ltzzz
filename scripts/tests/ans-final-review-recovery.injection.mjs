// ANS P1-01 故障注入诊断（只读，不改生产代码，不进 CI 断言）
// 目的：实测 syncDailyBoard 对「已进入最终评审状态」的席位，
//      在 (a) 远端瞬时读取失败 与 (b) 远端证据真实冲突 两种情况下，
//      是否发生本地已验证状态被清空、以及两种情况能否被区分。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {prepareDailyBoard,runReservedSeat,syncDailyBoard,readLedger} from '../lib/daily-task-board.mjs';
import {digest} from '../lib/daily-task-board.mjs';
import {taskCommand,seedTasks} from '../../workers/pulse-worker/tasks.js';
import {control as pulseControl} from '../../workers/pulse-worker/engine.js';

const date='2026-10-16', now=Date.parse(date+'T03:00:00Z'), agent='deepseek';
const verdictFor=(seat,patch={})=>({accepted:true,artifact_sha256:seat.artifact.sha256,task_id:seat.assignment.id,date,run_key:'run:1',source_commit:'source-sha',actual_provider:'doubao',...patch});

async function reachFinalState(){
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'ans-inject-'));
  let state=seedTasks({ran_at:new Date(now).toISOString(),agents:{}},now), posts=0, remote=new Map();
  const options={root,date,runKey:'run:1',sourceCommit:'source-sha',agents:[agent],now,
    snapshot:async()=>({available:true,...structuredClone(state)}),
    command:async body=>{posts++;state=pulseControl(state,{...body,id:body.id||'fixture-preclaim',reason:'No-funds injection'},'qianwen',{targets:[{name:agent}],baseline_concurrency:1},now).state;},
    readRemote:async file=>{if(!remote.has(file))throw Error('not_committed');return remote.get(file);}};
  const generate=extra=>runReservedSeat({...options,agent,call:async()=>({ok:true,output:'Verified assertion draft【交付结束】',finish_reason:'stop',model:'actual-model',model_source:'provider_response',tokens_used:12,...extra})});
  const commit=()=>{const a=readLedger(root,date).seats[agent].artifact;remote.set(a.path,fs.readFileSync(path.join(root,a.path)))};

  await prepareDailyBoard(options); await generate(); commit(); await syncDailyBoard(options);
  const seat=readLedger(root,date).seats[agent];
  const reviewBytes=Buffer.from(JSON.stringify(verdictFor(seat)));
  const reviewPath='knowledge/results/inject-review.json';
  remote.set(reviewPath,reviewBytes);
  const reviewed=taskCommand(state,{action:'review_task',task_id:seat.assignment.id,agent:'doubao',accepted:true,reviewed_sha256:seat.artifact.sha256,scope:'engineering_draft_only',worker_actual_provider:'deepseek',reviewer_actual_provider:'doubao',review_evidence_path:reviewPath,review_evidence_sha256:digest(reviewBytes)},'qianwen',[agent,'doubao'],now).state;
  await syncDailyBoard({...options,snapshot:async()=>({available:true,...reviewed})});
  return {root,options,remote,reviewPath,reviewed,postsBefore:posts,getPosts:()=>posts};
}

const snap=seat=>({status:seat.status,submission_verified:seat.submission_verified,review_verified:seat.review_verified,accepted:seat.accepted,review_receipt:seat.review_receipt?{evidence_sha256:seat.review_receipt.evidence_sha256}:null,sync_reason:seat.sync_reason,deployed:seat.deployed});

const out={generated_at:new Date().toISOString(),subject:'ANS P1-01 syncDailyBoard 最终评审状态恢复',cases:[]};

// 基线：进入最终评审状态
{
  const f=await reachFinalState();
  const before=snap(readLedger(f.root,date).seats[agent]);
  out.baseline=before;
  out.cases.push({case:'baseline_final_state',expect:'completed_draft_review / review_verified=true / accepted=true',observed:before,passed:before.status==='completed_draft_review'&&before.review_verified===true});
  f._=1; out._f=f;
}

// 场景 A：远端瞬时读取失败（工作产物文件读不到）
{
  const f=out._f;
  const before=snap(readLedger(f.root,date).seats[agent]);
  const postsBefore=f.getPosts();
  f.remote.delete(readLedger(f.root,date).seats[agent].artifact.path);
  await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...f.reviewed})});
  const after=snap(readLedger(f.root,date).seats[agent]);
  out.cases.push({case:'A_transient_remote_read_failure',expect:'应保留 completed_draft_review 与 review_verified',observed:after,
    degraded:before.status!==after.status,flags_cleared:before.review_verified===true&&after.review_verified===false,
    new_submit: f.getPosts()-postsBefore, sync_reason:after.sync_reason});
}

// 场景 B：远端证据内容真实变化（评审回执被替换成不同内容）
{
  const f=await reachFinalState();
  const before=snap(readLedger(f.root,date).seats[agent]);
  const postsBefore=f.getPosts();
  f.remote.set(f.reviewPath,Buffer.from(JSON.stringify({accepted:false})));
  await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...f.reviewed})});
  const after=snap(readLedger(f.root,date).seats[agent]);
  out.cases.push({case:'B_real_evidence_conflict',expect:'应进入明确的冲突处理，而非与瞬时失败同路径',observed:after,
    degraded:before.status!==after.status,flags_cleared:before.review_verified===true&&after.review_verified===false,
    new_submit: f.getPosts()-postsBefore, sync_reason:after.sync_reason});
}

// 场景 C：远端不可用 + 任务板仍报最终状态（只读复核应稳定保留）
{
  const f=await reachFinalState();
  const before=snap(readLedger(f.root,date).seats[agent]);
  const postsBefore=f.getPosts();
  f.remote.delete(readLedger(f.root,date).seats[agent].artifact.path);
  await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...f.reviewed})});
  const mid=snap(readLedger(f.root,date).seats[agent]);
  // 恢复远端后立刻重跑，检验下一轮能否自动恢复
  f.remote.set(readLedger(f.root,date).seats[agent].artifact.path,fs.readFileSync(path.join(f.root,readLedger(f.root,date).seats[agent].artifact.path)));
  await syncDailyBoard({...f.options,snapshot:async()=>({available:true,...f.reviewed})});
  const after=snap(readLedger(f.root,date).seats[agent]);
  out.cases.push({case:'C_downgrade_then_restore',expect:'降级后应能幂等恢复且不重复提交',degraded_to:mid.status,restored_to:after.status,
    auto_recovered:after.status==='completed_draft_review'&&after.review_verified===true,new_submit:f.getPosts()-postsBefore});
}

delete out._f;
out.summary={
  A_flags_cleared: out.cases.find(c=>c.case==='A_transient_remote_read_failure')?.flags_cleared,
  B_flags_cleared: out.cases.find(c=>c.case==='B_real_evidence_conflict')?.flags_cleared,
  AB_sync_reason_identical: out.cases.find(c=>c.case==='A_transient_remote_read_failure')?.sync_reason===out.cases.find(c=>c.case==='B_real_evidence_conflict')?.sync_reason,
  conflict_distinguishable:false,
  auto_recovery: out.cases.find(c=>c.case==='C_downgrade_then_restore')?.auto_recovered
};
const A=out.cases.find(c=>c.case==='A_transient_remote_read_failure'),B=out.cases.find(c=>c.case==='B_real_evidence_conflict');
out.summary.conflict_distinguishable = !!(A&&B&&A.sync_reason!==B.sync_reason);

// 期望断言：这是验证脚本，不是观察脚本。summary 之前只算不判，行为坏了也照样退出 0。
const caseOf=name=>out.cases.find(c=>c.case===name);
const expectations=[
  ['A 瞬时远端读取失败不得清掉 review_verified 与终态', out.summary.A_flags_cleared===false],
  ['B 真实证据冲突必须清掉 review_verified', out.summary.B_flags_cleared===true],
  ['A/B 两条路径的 sync_reason 必须可区分', out.summary.AB_sync_reason_identical===false&&out.summary.conflict_distinguishable===true],
  ['A 瞬时失败不得触发重复提交', caseOf('A_transient_remote_read_failure')?.new_submit===0],
  ['B 真实冲突不得触发重复提交', caseOf('B_real_evidence_conflict')?.new_submit===0],
  ['C 远端恢复后必须幂等回到 verified', out.summary.auto_recovery===true],
  ['C 降级再恢复全程不得触发重复提交', caseOf('C_downgrade_then_restore')?.new_submit===0],
];
const failures=expectations.filter(([,ok])=>!ok).map(([name])=>name);
out.assertions=expectations.map(([name,ok])=>({name,passed:ok}));
out.verdict=failures.length===0?'pass':'fail';
out.failures=failures;

const target=process.argv[2]||'/tmp/ans-p1-01-injection.json';
fs.writeFileSync(target,JSON.stringify(out,null,2)+'\n');
console.log(JSON.stringify(out,null,2));
if(failures.length){console.error('INJECTION FAIL: '+failures.join(' | '));process.exit(1);}
