import {baselineDispatches} from '../../workers/pulse-worker/tasks.js';
export function dailyAssignment(agent,date,{control,pulse}={}){
 const explicit=control?.date===date&&Array.isArray(control.dispatches)?control.dispatches.find(t=>t.agent===agent&&typeof t.instruction==='string'&&t.instruction.trim()):null;
 if(explicit)return {id:explicit.id||'CONTROL-'+date+'-'+agent,instruction:explicit.instruction,source:control.dispatch_source||'coordinator_record'};
 const board=Array.isArray(pulse?.task_board)?pulse.task_board:[];
 const directed=board.find(t=>t.date===date&&t.assigned_to===agent&&t.status==='assigned');
 if(directed)return {id:directed.id,instruction:directed.instruction,source:'pulse_direct_assignment'};
 const baseline=baselineDispatches(date).find(t=>t.agent===agent);if(baseline)return {id:baseline.id,instruction:baseline.instruction,source:'coordinator_rules_zero_model_baseline'};
 const open=board.find(t=>t.date===date&&t.status==='available'&&!t.assigned_to);
 if(open)return {id:open.id,instruction:open.instruction,source:'self_discovered_available_task_not_claim_proof'};
 return null;
}
