import {baselineDispatches} from '../../workers/pulse-worker/tasks.js';
const index=value=>/^\d{4}-\d{2}-\d{2}$/.test(value||'')?Date.parse(value+'T00:00:00Z')/86400000:NaN;
export function dailyAssignment(agent,date,{control,pulse}={}){
 const age=index(date)-index(control?.date);
 const eligible=t=>t.agent===agent&&typeof t.instruction==='string'&&t.instruction.trim()&&(!t.status||['queued','queued_for_next_daily_economy','assigned'].includes(t.status));
 const dispatches=Array.isArray(control?.dispatches)?control.dispatches:[];
 // A queued next-day instruction survives one midnight, never an indefinite replay.
 const scheduled=Number.isInteger(age)&&age>=0&&age<=1?dispatches.find(t=>eligible(t)&&['queued','queued_for_next_daily_economy'].includes(t.status)&&(t.execute_on?t.execute_on===date:age===1)):null;
 const explicit=scheduled||(control?.date===date?dispatches.find(t=>eligible(t)&&(!t.execute_on||t.execute_on===date)):null);
 if(explicit)return {id:explicit.id||'CONTROL-'+date+'-'+agent,instruction:explicit.instruction,source:control.dispatch_source||'coordinator_record',source_date:control.date};
 const board=Array.isArray(pulse?.task_board)?pulse.task_board:[];
 const directed=board.find(t=>t.date===date&&t.assigned_to===agent&&t.status==='assigned');
 if(directed)return {id:directed.id,instruction:directed.instruction,source:'pulse_direct_assignment'};
 const baseline=baselineDispatches(date).find(t=>t.agent===agent);if(baseline)return {id:baseline.id,instruction:baseline.instruction,source:'coordinator_rules_zero_model_baseline'};
 const open=board.find(t=>t.date===date&&t.status==='available'&&!t.assigned_to);
 if(open)return {id:open.id,instruction:open.instruction,source:'self_discovered_available_task_not_claim_proof'};
 return null;
}

