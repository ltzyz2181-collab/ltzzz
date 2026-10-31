import {createHash, randomUUID} from 'node:crypto';
import {loadLessons, checkConsidered} from './lessons.mjs';

export const sha256 = value => createHash('sha256').update(value).digest('hex');
export const unitKey = task => sha256(`${task.task_id}\0${task.step_id}`);
const taskDigest = task => sha256(JSON.stringify(Object.fromEntries(Object.keys(task).sort().map(k => [k,task[k]]))));
const ID = /^[A-Z0-9][A-Z0-9_-]{5,120}$/;
const HASH = /^[a-f0-9]{64}$/;
const COMMIT = /^[a-f0-9]{40}$/;
export const MAX_TASK_JSON_CHARS = 16000; // Bounded JSON input to this lane; not a controller quota.
const text = value => typeof value === 'string' && value.trim().length > 0;
export function safePath(value) {
  return text(value) && !/^[/.]|[\\\u0000-\u001f%?#]/.test(value) && value.split('/').every(v => v && v !== '.' && v !== '..' && v !== '.git');
}
export function validatePreflight(record, {coreHash, sourceCommit}, tags = []) {
  const errors = [];
  if (!record || typeof record !== 'object' || record.template_only) return ['preflight_missing_or_template'];
  for (const field of ['goal','impulse_check','independent_check']) if (!text(record[field])) errors.push(`missing_${field}`);
  if (!Array.isArray(record.touches_core) || !record.touches_core.length || record.touches_core.some(v => !Number.isInteger(v) || v < 1 || v > 7)) errors.push('invalid_core_references');
  for (const field of ['unverified','stop_if']) if (!Array.isArray(record[field]) || record[field].some(v => !text(v))) errors.push(`invalid_${field}`);
  if (!record.stop_if?.length) errors.push('missing_stop_condition');
  if (!['none','existing_machine_policy','external_platform_verification'].includes(record.approval_kind)) errors.push('new_personal_or_five_signature_gate_not_authorized');
  if (!HASH.test(coreHash) || record.core_view_sha256 !== coreHash) errors.push('core_view_hash_mismatch');
  if (!COMMIT.test(sourceCommit) || record.source_commit !== sourceCommit) errors.push('base_commit_mismatch');
  // Reflection harness wiring (docs/REFLECTION-HARNESS.md §9, advisory phase): report only, never block.
  try {
    const {lessons, problems} = loadLessons();
    if (problems.length) console.warn(`reflection_harness: lesson_problems ${problems.join(',')}`);
    for (const w of checkConsidered(record, lessons, tags)) console.warn(`reflection_harness: ${w}`);
  } catch (e) {
    console.warn(`reflection_harness: ${e.message}`);
  }
  return errors;
}

export function parseTask(body) {
  const matches = [...String(body || '').matchAll(/```json\s*([\s\S]*?)```/g)];
  if (matches.length !== 1 || matches[0][1].length > MAX_TASK_JSON_CHARS) throw Error('one_bounded_task_JSON_required');
  return JSON.parse(matches[0][1]);
}
export function routeTask(task, issue, policy, now = Date.now()) {
  const controller = reason => ({route:'controller',reason,owner_confirmation_required:false});
  if (issue.repository !== policy.repository || issue.state !== 'open' || !Number.isSafeInteger(issue.number) || issue.number < 1 || !policy.trusted_issue_authors.includes(issue.author) || !issue.labels.includes('work:open')) return {route:'untrusted_or_not_open',owner_confirmation_required:false};
  if (!task || !ID.test(task.task_id || '') || !ID.test(task.step_id || '') || !text(task.goal) || !text(task.acceptance)) return controller('incomplete_task');
  const fields = ['task_id','step_id','goal','acceptance','risk','budget_usdc','deadline_at','source_kind','kind','read_paths','write_paths','requested_seat'];
  if (Object.keys(task).some(k => !fields.includes(k))) return controller('unknown_task_fields_cannot_grant_authority');
  if (typeof task.deadline_at !== 'string' || !/T.*(?:Z|[+-]\d\d:\d\d)$/.test(task.deadline_at) || !Number.isFinite(Date.parse(task.deadline_at))) return controller('deadline_unverified');
  if (Date.parse(task.deadline_at) <= now) return {route:'expired',owner_confirmation_required:false};
  if (task.source_kind !== 'internal') return controller('external_task_uses_its_existing_admission_policy');
  if (!(task.budget_usdc === 0 || /^0(?:\.0{1,6})?$/.test(task.budget_usdc || ''))) return controller('cash_scope_requires_existing_execution_policy');
  if (!['L0','L1'].includes(task.risk)) return controller('higher_risk_uses_existing_controller');
  if (!policy.seats.includes(task.requested_seat)) return controller('seat_not_in_current_pool');
  for (const field of ['read_paths','write_paths']) if (!Array.isArray(task[field]) || task[field].some(p => !safePath(p))) return controller('invalid_repository_paths');
  const readonly = task.kind === 'repo_readonly' && task.read_paths.length > 0 && task.write_paths.length === 0;
  const docs = task.kind === 'documentation' && task.write_paths.length > 0 && task.write_paths.every(p => p.startsWith('docs/') && p.endsWith('.md'));
  const sandbox = task.kind === 'sandbox_analysis' && task.risk === 'L1' && task.write_paths.length > 0 && task.write_paths.every(p => p.startsWith('knowledge/results/workpool/drafts/'));
  return readonly || docs || sandbox ? {route:'pool',owner_confirmation_required:false} : controller('outside_low_risk_pool_not_a_controller_prohibition');
}

export function leaseStatus(state, now = Date.now()) {
  if (!state) return 'available';
  if (state.status === 'submitted_waiting_independent_review') return 'submitted_do_not_repeat';
  if (state.status === 'released') return state.effect_state === 'not_started' ? 'available' : 'reconciliation_required';
  if (state.status !== 'leased' || !['not_started','started_unknown'].includes(state.effect_state)) return 'reconciliation_required';
  if (!Number.isFinite(Date.parse(state.expires_at))) return 'reconciliation_required';
  if (Date.parse(state.expires_at) > now) return 'leased';
  return state.effect_state === 'started_unknown' ? 'reconciliation_required' : 'available_expired';
}
export async function acquireLease({task,issue,policy,coreHash,sourceCommit,executor,store,now=Date.now()}) {
  const route = routeTask(task,issue,policy,now);
  if (route.route !== 'pool') return {...route,acquired:false};
  if (!HASH.test(coreHash) || !COMMIT.test(sourceCommit) || !text(executor.id)) throw Error('trusted_executor_context_required');
  if (!Number.isSafeInteger(policy.lease_seconds) || policy.lease_seconds < 1) throw Error('invalid_lease_configuration');
  const key = unitKey(task), snapshot = await store.read(key), old = snapshot?.state;
  if (old && (old.task_id !== task.task_id || old.step_id !== task.step_id || old.task_digest !== taskDigest(task))) return {acquired:false,status:'task_changed_reconcile',owner_confirmation_required:false};
  const status = leaseStatus(old,now);
  if (!['available','available_expired'].includes(status)) return {acquired:false,status,lease:old,owner_confirmation_required:false};
  const expires = Math.min(now + policy.lease_seconds * 1000,Date.parse(task.deadline_at));
  if (!Number.isFinite(expires)) throw Error('invalid_lease_expiry');
  const state = {task_id:task.task_id,step_id:task.step_id,issue_number:issue.number,task_digest:taskDigest(task),lease_id:randomUUID(),status:'leased',effect_state:'not_started',executor_id:executor.id,logical_seat:task.requested_seat,actual_provider:null,model:null,metadata_source:'authenticated_receipt_transport_not_model_generation',at_utc:new Date(now).toISOString(),expires_at:new Date(expires).toISOString(),core_view_sha256:coreHash,source_commit:sourceCommit,attempt:(old?.attempt||0)+1,decision_record:{kind:'deterministic_routing_not_model_reasoning',goal:task.goal,touches_core:[1,3,7],impulse_check:'No arbitrary command execution; preserve existing admission for higher risk work',unverified:['Independent review and business acceptance remain pending'],stop_if:['Trusted context changed','Prior result or side effect is unknown'],independent_check:'Different actual provider before acceptance',approval_kind:'none',core_view_sha256:coreHash,source_commit:sourceCommit},paid:false,tx_hash:null,accepted:false};
  const ok = await store.compareAndSwap(key,snapshot,state);
  return {acquired:ok,status:ok?'leased':'claim_conflict_no_effect',...(ok?{lease:state}:{}),owner_confirmation_required:false};
}
export async function updateLease({key,leaseId,executorId,action,artifact,store,now=Date.now()}) {
  const snapshot = await store.read(key), old = snapshot?.state;
  if (!old || old.lease_id !== leaseId || old.executor_id !== executorId) return {updated:false,status:'not_current_lease'};
  if (action === 'reconcile') return {updated:false,status:'use_existing_receipt_reconciliation_not_a_boolean_override'};
  const status = leaseStatus(old,now), lateResult = action === 'submit' && status === 'reconciliation_required' && old.status === 'leased' && old.effect_state === 'started_unknown' && Number.isFinite(Date.parse(old.expires_at)) && Date.parse(old.expires_at) <= now;
  if (status !== 'leased' && !lateResult) return {updated:false,status};
  let next = {...old,updated_at_utc:new Date(now).toISOString()};
  if (action === 'begin_effects' && old.effect_state === 'not_started') next.effect_state='started_unknown';
  else if (action === 'release' && old.effect_state === 'not_started') next.status='released';
  else if (action === 'submit' && safePath(artifact?.path) && HASH.test(artifact?.sha256) && typeof artifact.content==='string' && sha256(artifact.content)===artifact.sha256) next={...next,status:'submitted_waiting_independent_review',effect_state:'output_recorded',artifact:{path:artifact.path,sha256:artifact.sha256},late_submission:lateResult,accepted:false};
  else return {updated:false,status:'invalid_transition'};
  const updated=await store.compareAndSwap(key,snapshot,next,{artifact:action==='submit'?artifact:null});
  return {updated,status:updated?next.status:'lease_update_conflict',owner_confirmation_required:false};
}
