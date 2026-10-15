import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
import {pulseToken} from './pulse-credentials.mjs';import {PULSE_URL} from './lib/pulse-client.mjs';
const action=process.env.AGENT_ACTION||'discover',agent=process.env.AGENT_NAME||'deepseek';const report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,agent,action,model_calls:0,paid:false,tx_hash:null};
try{
 const r=await fetch(PULSE_URL+'/tasks',{signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('task_board_unreachable');const board=await r.json();
 const relevant=board.tasks.filter(t=>t.date===board.date&&(!t.assigned_to||t.assigned_to===agent)&&['available','assigned'].includes(t.status));report.discovered=relevant.map(t=>({id:t.id,status:t.status,instruction:t.instruction}));
 if(action!=='discover'){
  const task_id=process.env.AGENT_TASK_ID||relevant[0]?.id;if(!task_id)throw Error('no_available_task');
  const token=pulseToken('qianwen');console.log('::add-mask::'+token);
  const body={id:action+'-'+process.env.GITHUB_RUN_ID,action:action==='claim'?'claim_task':action==='submit'?'submit_task':'invalid',agent,task_id,reason:'Owner-authorized AI self-service task discovery and evidence submission'};
  if(action==='submit'){
   const relative=process.env.AGENT_EVIDENCE_PATH||'';if(!/^(knowledge|results|ops)\//.test(relative)||relative.split('/').includes('..'))throw Error('evidence_path_invalid');
   const root=fs.realpathSync(process.cwd()),target=fs.realpathSync(path.resolve(relative));if(!target.startsWith(root+path.sep))throw Error('evidence_outside_repo');
   body.evidence_path=relative;body.evidence_sha256=createHash('sha256').update(fs.readFileSync(target)).digest('hex');
  }
  const result=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(15000)});report.http=result.status;report.result=await result.json();if(!result.ok)throw Error('task_operation_rejected');report.task_id=task_id;
 }
 report.status=action==='discover'?'discovered_without_model_call':action==='claim'?'claimed_by_executor_not_native_model_proof':'submitted_pending_review';
}catch{report.status='blocked_task_operation';process.exitCode=1;}
fs.mkdirSync('knowledge/results/pulse',{recursive:true});fs.writeFileSync('knowledge/results/pulse/agent-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
