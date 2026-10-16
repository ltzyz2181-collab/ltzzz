import {dailyBaselineDispatches} from '../../workers/pulse-worker/tasks.js';
const index=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?Date.parse(value+'T00:00:00Z')/86400000:NaN;
export function dailyAssignment(agent,date,{control,pulse}={}){
 const age=index(date)-index(control?.date);
 const eligible=t=>t.agent===agent&&typeof t.instruction==='string'&&t.instruction.trim()&&(!t.status||['queued','queued_for_next_daily_economy','assigned'].includes(t.status));
 const dispatches=Array.isArray(control?.dispatches)?control.dispatches:[];
 // Carry the instruction across one midnight, not the previous day's ANS identity.
 const scheduled=Number.isInteger(age)&&age>=0&&age<=1?dispatches.find(t=>eligible(t)&&['queued','queued_for_next_daily_economy'].includes(t.status)&&(t.execute_on?t.execute_on===date:age===1)):null;
 const explicit=scheduled||(control?.date===date?dispatches.find(t=>eligible(t)&&(!t.execute_on||t.execute_on===date)):null);
 if(explicit){
  const issuedId=explicit.id||'CONTROL-'+date+'-'+agent;
  const datedAns=new RegExp('^ANS-\\d{4}-\\d{2}-\\d{2}-'+agent+'$').test(issuedId);
  const id=datedAns?'DAILY-'+date+'-'+agent:(explicit.board_task_id||issuedId);
  return {id,instruction:explicit.instruction,source:control.dispatch_source||'coordinator_record',source_date:control.date,execution_date:date,source_task_id:issuedId};
 }
 const board=Array.isArray(pulse?.task_board)?pulse.task_board:[];
 const directed=board.find(t=>t.date===date&&t.assigned_to===agent&&t.status==='assigned'&&t.execution_chain==='daily');
 if(directed)return {id:directed.id,instruction:directed.instruction,source:'pulse_direct_assignment',execution_date:date};
 const baseline=dailyBaselineDispatches(date).find(t=>t.agent===agent);if(baseline)return {id:baseline.id,instruction:baseline.instruction,source:'coordinator_rules_zero_model_baseline',execution_date:date};
 const open=board.find(t=>t.date===date&&t.status==='available'&&!t.assigned_to);
 if(open)return {id:open.id,instruction:open.instruction,source:'self_discovered_available_task_not_claim_proof',execution_date:date};
 return null;
}
