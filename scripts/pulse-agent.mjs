import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {pulseToken} from './pulse-credentials.mjs';import {PULSE_URL} from './lib/pulse-client.mjs';
const action=process.env.AGENT_ACTION||'discover',agent=process.env.AGENT_NAME||'deepseek';const report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,agent,action,model_calls:0,paid:false,tx_hash:null};
try{
 const r=await fetch(PULSE_URL+'/tasks',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('task_board_unreachable');const board=await r.json();
 const relevant=board.tasks.filter(t=>t.date===board.date&&(!t.assigned_to||t.assigned_to===agent)&&['available','assigned'].includes(t.status));report.discovered=relevant.map(t=>({id:t.id,status:t.status,instruction:t.instruction}));
 // 指定 task_id 时无论其处在何种状态都回显，用于写回后的独立状态核验（终态任务不会出现在 discovered 里）。
 const focus=process.env.AGENT_TASK_ID?board.tasks.find(t=>t.id===process.env.AGENT_TASK_ID):null;
 if(focus)report.focus_task={id:focus.id,status:focus.status,assigned_to:focus.assigned_to,evidence_sha256:focus.evidence_sha256,review:focus.review};
 else if(process.env.AGENT_TASK_ID){report.focus_missing=true;report.board_shape=Object.keys(board);report.all_task_ids=(board.tasks||[]).map(t=>t.id).slice(-8);report.ans_status=(board.tasks||[]).filter(t=>/^ANS/.test(t.id)).map(t=>({id:t.id,status:t.status,assigned_to:t.assigned_to,reviewed:t.review?t.review.reviewer_actual_provider:null}));report.status_counts=(board.tasks||[]).reduce((a,t)=>{a[t.status]=(a[t.status]||0)+1;return a;},{});}
 if(action!=='discover'){
  const task_id=process.env.AGENT_TASK_ID||relevant[0]?.id;if(!task_id)throw Error('no_available_task');
  // actor 角色必须与声明身份一致：gpt 走系统签发的 gpt token，不能用 qianwen token 顶替，
  // 否则 actor 记录与 reviewer_actual_provider 不符，等于伪造席位身份。
  const role=agent==='gpt'?'gpt':'qianwen';
  const token=pulseToken(role);console.log('::add-mask::'+token);
  const base={id:action+'-'+process.env.GITHUB_RUN_ID,agent,task_id};
  let body;
  if(action==='claim'){
   body={...base,action:'claim_task',reason:'Owner-authorized AI self-service task discovery and evidence submission'};
  }else if(action==='submit'){
   const relative=process.env.AGENT_EVIDENCE_PATH||'';if(!/^(knowledge|results|ops)\//.test(relative)||relative.split('/').includes('..'))throw Error('evidence_path_invalid');
   const root=fs.realpathSync(process.cwd()),target=fs.realpathSync(path.resolve(relative));if(!target.startsWith(root+path.sep))throw Error('evidence_outside_repo');
   body={...base,action:'submit_task',reason:'Owner-authorized AI self-service task discovery and evidence submission',evidence_path:relative,evidence_sha256:createHash('sha256').update(fs.readFileSync(target)).digest('hex')};
  }else if(action==='review'){
   // 终态任务不再出现在 available/assigned 过滤里，必须从全量 board 精确取。
   const target=board.tasks.find(t=>t.id===task_id);if(!target)throw Error('task_not_found');
   const relative=process.env.AGENT_EVIDENCE_PATH||'';if(!/^(knowledge|results|ops)\//.test(relative)||relative.split('/').includes('..'))throw Error('evidence_path_invalid');
   const root=fs.realpathSync(process.cwd()),real=fs.realpathSync(path.resolve(relative));if(!real.startsWith(root+path.sep))throw Error('evidence_outside_repo');
   // reviewed_sha256 必须绑定被审对象自身的 evidence_sha256，不接受外部传入覆盖。
   body={...base,action:'review_task',reason:'Decision-seat metadata review relayed by owner; executor submits under its own signed role, seat identity unchanged',accepted:String(process.env.AGENT_ACCEPTED||'true')==='true',reviewed_sha256:target.evidence_sha256,scope:'engineering_draft_only',worker_actual_provider:process.env.AGENT_WORKER||'deepseek',reviewer_actual_provider:process.env.AGENT_REVIEWER||'gpt',review_evidence_path:relative,review_evidence_sha256:createHash('sha256').update(fs.readFileSync(real)).digest('hex')};
   report.bound_evidence_sha256=target.evidence_sha256;report.review_evidence_sha256=body.review_evidence_sha256;
  }else throw Error('action_invalid');
  const result=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});report.http=result.status;report.result=await result.json();if(!result.ok)throw Error('task_operation_rejected');report.task_id=task_id;
 }
 report.status=action==='discover'?'discovered_without_model_call':action==='claim'?'claimed_by_executor_not_native_model_proof':action==='review'?'reviewed_by_authenticated_executor':'submitted_pending_review';
}catch(e){report.error=String((e&&e.message)||e);report.status='blocked_task_operation';process.exitCode=1;}
fs.mkdirSync('knowledge/results/pulse',{recursive:true});fs.writeFileSync('knowledge/results/pulse/agent-'+process.env.GITHUB_RUN_ID+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
