import {beginExecution,finishExecution} from '../../lib/provider-execution.js';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dailyAssignment} from './daily-assignment.mjs';
import {pulseGate} from './pulse-client.mjs';
import {assessDelivery,requiredSectionsForAgent} from '../delivery-integrity.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const ledgerPath = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('invalid_date');
  return `knowledge/results/daily-board/${date}.json`;
};
export function readLedger(root, date) {
  const file = path.join(root, ledgerPath(date));
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
}
/**
 * Fail closed unless the day's reservation belongs to this exact run.
 *
 * runReservedSeat already refuses to spend on a foreign lease, but it reports
 * that as {ok:false} per seat, so a caller that keeps looping still writes a
 * results/reflections/reminders file that looks like a completed daily run even
 * though no seat executed. Re-running an old attempt must therefore abort
 * before the first provider request and before anything is written.
 */
export function assertRunKeyOwnership(ledger, runKey) {
  if (!ledger || typeof ledger !== 'object') throw Error('daily_reservation_missing');
  const owned = ledger.run_key;
  if (typeof owned !== 'string' || !owned) throw Error('daily_reservation_run_key_absent');
  if (owned !== runKey) throw Error('daily_reservation_run_key_mismatch');
  return true;
}
export function saveLedger(root, record) {
  const file = path.join(root, ledgerPath(record.date));
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, JSON.stringify(record, null, 2)+'\n');
}
const fresh = (snapshot, agent, now) => snapshot?.available === true && pulseGate(snapshot, agent, now).state === 'fresh' && pulseGate(snapshot, agent, now).allowed;
const taskFor = (snapshot, id) => snapshot?.task_board?.find(t => t.id === id);
const evidencePath = value => /^(knowledge|results|ops)\/[A-Za-z0-9_./\u4e00-\u9fff-]+$/.test(value || '') && !value.split('/').includes('..');
const keyed = (phase, record, agent) => `daily-${phase}-${record.date}-${agent}-${digest(record.run_key).slice(0,16)}`;
function claimProof(snapshot, record, agent, seat) {
  const task = taskFor(snapshot, seat.assignment?.id);
  const intent = seat.claim_intent;
  const event = snapshot?.events?.find(e => e.id === intent?.id && e.type === 'controller_claim_task');
  return intent?.run_key === record.run_key && intent.task_id === task?.id && task?.date === record.date && task.claimed_by === agent && ['claimed','submitted_pending_review','completed_draft_review','rejected_draft_review'].includes(task.status) && snapshot.command_ids?.includes(intent.id) && event?.actor === task.claim_actor && event.at === task.claimed_at;
}
function recordClaim(snapshot, record, agent, seat) {
  const task = taskFor(snapshot, seat.assignment.id);
  seat.claim_verified = true;
  seat.claim_receipt = {task_id:task.id, task_date:task.date, request_id:seat.claim_intent.id, run_key:record.run_key, claimed_by:task.claimed_by, actor:task.claim_actor, claimed_at:task.claimed_at, observed_at:snapshot.ran_at};
  seat.status = 'reserved';
  seat.reason = 'remote_claim_verified';
}

// The reservation is committed before any provider request. Recovery may reconcile
// an existing claim, but never transfers the provider allowance to another run.
export async function prepareDailyBoard({root, date, runKey, sourceCommit, agents, control, snapshot, command, now=Date.now()}) {
  const prior = readLedger(root, date);
  if (prior) {
    if (prior.date !== date) throw Error('reservation_date_mismatch');
    for (const [agent, seat] of Object.entries(prior.seats)) {
      if (seat.claim_verified || !seat.claim_intent || !['blocked','claim_pending'].includes(seat.status)) continue;
      try {
        const observed = await snapshot();
        if (fresh(observed, agent, now) && claimProof(observed, prior, agent, seat)) recordClaim(observed, prior, agent, seat);
      } catch { /* Unknown claim is not permission to generate or to steal work. */ }
    }
    saveLedger(root, prior);
    return prior;
  }
  const record = {schema_version:2, date, run_key:runKey, source_commit:sourceCommit, seats:{}, paid:false, tx_hash:null};
  saveLedger(root, record);
  for (const agent of agents) {
    const seat = record.seats[agent] = {agent, status:'blocked', reason:'claim_not_verified', claim_verified:false, submission_verified:false, review_verified:false, accepted:false, paid:false, tx_hash:null, deployed:false};
    saveLedger(root, record);
    try {
      const before = await snapshot();
      if (!fresh(before, agent, now)) throw Error('snapshot_unavailable_or_paused');
      const assignment = dailyAssignment(agent, date, {control, pulse:before});
      seat.assignment = assignment;
      if (assignment) {
        const task = taskFor(before, assignment.id);
        if (!task || task.date !== date || assignment.execution_date !== date || !['assigned','available'].includes(task.status) || (task.assigned_to && task.assigned_to !== agent)) throw Error('task_not_available_for_date');
        seat.claim_intent = {id:keyed('claim',record,agent), task_id:assignment.id, run_key:runKey};
        seat.status = 'claim_pending';
        saveLedger(root, record);
        try { await command({...seat.claim_intent, action:'claim_task', agent}); } catch { /* Read back even when the response was lost. */ }
        const after = await snapshot();
        if (!fresh(after, agent, now) || !claimProof(after, record, agent, seat)) throw Error('claim_readback_failed');
        recordClaim(after, record, agent, seat);
      } else {
        seat.status = 'reserved';
        seat.reason = 'existing_role_without_board_assignment';
      }
    } catch {
      seat.status = 'blocked';
      // Remote exception text may include credentials; persist only a stable code.
      seat.reason = 'claim_or_snapshot_blocked';
    }
    saveLedger(root, record);
  }
  return record;
}

export async function runReservedSeat({root, date, runKey, agent, call}) {
  const record = readLedger(root, date), seat = record?.seats?.[agent];
  if (!seat || record.date !== date || record.run_key !== runKey || seat.status !== 'reserved' || (seat.assignment && (!seat.claim_verified || seat.assignment.execution_date !== date || seat.claim_receipt?.task_id !== seat.assignment.id || seat.claim_receipt?.run_key !== runKey))) {
    return {ok:false,status:'blocked_no_repurchase',error:'No unused verified reservation owned by this run'};
  }
  const execution=beginExecution(agent,null,seat.assignment?.id,'repository_executor_code');
  seat.execution_started_at=execution.started_at;
  seat.status = 'generation_started';
  saveLedger(root, record);
  let result;
  try { result = await call(); }
  catch { result = {ok:false,status:'generation_unknown',error:'provider_result_unknown'}; }
  const required_sections=requiredSectionsForAgent(agent);
  const integrity = assessDelivery({output:result.output, finish_reason:result.finish_reason,required_sections});
  const complete = result.ok === true && integrity.status === 'structurally_complete' && !/SPEND_PROPOSAL\s*[:：]/i.test(result.output || '');
  const artifact = {
    ...(result.skill?{skill:result.skill}:{}),
    execution:finishExecution(execution,{http:result.http??null,transportOk:result.ok===true,upstreamRequestId:result.upstream_request_id??null,upstreamRequestIdSource:result.upstream_request_id_source??null,data:{id:result.completion_id??null,model:result.model_source==='provider_response'?(result.returned_model||result.model):null,choices:[{message:{content:result.output},finish_reason:result.finish_reason}],usage:{total_tokens:result.tokens_used}}}),
    schema_version:1, date, task_id:seat.assignment?.id || null, logical_seat:agent,
    actual_provider:result.ok ? agent : null, actual_model:result.model_source === 'provider_response' ? (result.returned_model || result.model || null) : null,
    reported_model:result.model || null, model_source:result.model_source || null, source_commit:record.source_commit,
    run_key:runKey, output:String(result.output || ''), finish_reason:result.finish_reason || null,
    tokens_used:result.tokens_used ?? null, request_id:result.request_id || null,
    integrity,required_sections, status:complete?'complete':'incomplete_or_failed', provider_status:result.status || null,
    accepted:false, paid:false, tx_hash:null
  };
  const bytes = JSON.stringify(artifact, null, 2)+'\n';
  const hash = digest(bytes);
  const relative = `knowledge/results/daily-board/artifacts/${date}-${agent}-${hash}.json`;
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, bytes, {flag:'wx'});
  seat.artifact = {path:relative, sha256:hash};
  seat.status = complete ? 'generated_pending_sync' : integrity.status==='missing_required_section'?'missing_required_section':'generation_failed_no_repurchase';
  seat.integrity = integrity;
  saveLedger(root, record);
  return {...result,execution:artifact.execution};
}

export function validateArtifact(root, record, agent, seat) {
  const a = seat.artifact;
  if (!a || !/^[a-f0-9]{64}$/.test(a.sha256 || '') || a.path !== `knowledge/results/daily-board/artifacts/${record.date}-${agent}-${a.sha256}.json`) throw Error('artifact_path_invalid');
  const bytes = fs.readFileSync(path.join(root, a.path));
  if (digest(bytes) !== a.sha256) throw Error('artifact_hash_mismatch');
  const body = JSON.parse(bytes);
  if (body.date !== record.date || body.run_key !== record.run_key || body.task_id !== seat.assignment?.id || body.logical_seat !== agent || body.source_commit !== record.source_commit || body.status !== 'complete' || /SPEND_PROPOSAL\s*[:：]/i.test(body.output || '')) throw Error('artifact_binding_invalid');
  const integrity=assessDelivery({...body,required_sections:requiredSectionsForAgent(agent)});
  if(integrity.status!=='structurally_complete')throw Error('artifact_delivery_'+integrity.status);
  return bytes;
}

// Bounded, read-only recovery for a crash between immutable artifact write and
// ledger update. An absent/ambiguous artifact never causes another model call.
export function recoverArtifact(root, record, agent, seat) {
  if (!['generation_started','generation_unknown_no_repurchase'].includes(seat.status) || seat.artifact || !seat.assignment || !seat.claim_verified) return false;
  const directory = path.join(root,'knowledge/results/daily-board/artifacts');
  if (!fs.existsSync(directory)) return false;
  const prefix = `${record.date}-${agent}-`;
  const matches = [];
  for (const name of fs.readdirSync(directory).filter(n=>n.startsWith(prefix) && n.endsWith('.json'))) {
    const hash = name.slice(prefix.length,-5);
    const candidate = {...seat, artifact:{path:`knowledge/results/daily-board/artifacts/${name}`,sha256:hash}};
    try { validateArtifact(root,record,agent,candidate); matches.push(candidate.artifact); } catch { /* Not this reservation's complete artifact. */ }
  }
  if (matches.length !== 1) return false;
  seat.artifact = matches[0];
  seat.status = 'generated_pending_sync';
  seat.recovery = 'immutable_artifact_verified_no_model_replay';
  saveLedger(root,record);
  return true;
}

// Failed provider attempts are terminal, hash-bound feedback, never released for repurchase.
async function syncFailedSeat({root,record,agent,seat,snapshot,command,readRemote,now}) {
 try {
  const a=seat.artifact;
  if(!a||!/^[a-f0-9]{64}$/.test(a.sha256)||a.path!==`knowledge/results/daily-board/artifacts/${record.date}-${agent}-${a.sha256}.json`)throw Error('failure_artifact_required');
  const bytes=fs.readFileSync(path.join(root,a.path)),body=JSON.parse(bytes);
  if(digest(bytes)!==a.sha256||digest(await readRemote(a.path))!==a.sha256||body.status!=='incomplete_or_failed'||body.date!==record.date||body.run_key!==record.run_key||body.task_id!==seat.assignment.id||body.logical_seat!==agent||body.source_commit!==record.source_commit)throw Error('failure_binding_invalid');
  const matches=t=>t?.status==='failed_no_repurchase'&&t.claimed_by===agent&&t.failure?.evidence_path===a.path&&t.failure?.evidence_sha256===a.sha256;
  let observed=await snapshot();if(!fresh(observed,agent,now))throw Error('snapshot_unavailable');
  if(!matches(taskFor(observed,seat.assignment.id))){
   const task=taskFor(observed,seat.assignment.id);if(task?.status!=='claimed'||task.claimed_by!==agent||task.date!==record.date)throw Error('failure_owner_conflict');
   seat.failure_command_id||=keyed('failure',record,agent);seat.status='failure_sync_unknown';saveLedger(root,record);
   await command({id:seat.failure_command_id,action:'fail_task',agent,task_id:seat.assignment.id,evidence_path:a.path,evidence_sha256:a.sha256,failure_kind:'incomplete_or_failed_provider_output'});
   observed=await snapshot();
  }
  if(!matches(taskFor(observed,seat.assignment.id)))throw Error('failure_readback_unverified');
  seat.status='failed_no_repurchase';seat.failure_verified=true;seat.failure_receipt={...taskFor(observed,seat.assignment.id).failure,observed_at:observed.ran_at};seat.accepted=false;
 }catch{seat.status='failure_sync_unknown';seat.failure_verified=false;}
 saveLedger(root,record);
}

// ANS P1-01: 已绑定最终评审的席位必须先把"当前核验状态"与"历史结论"分开，
// 不得在重新校验前无条件清空本地已验证结论。
// 只读复核三种出口：verified（当前仍成立）/ unavailable（瞬时不可读，保留历史结论并标注待核）/ conflict（证据真实不符，明确降级）。
const FINAL_STATUSES = ['completed_draft_review','rejected_draft_review'];
const REVALIDATION_CONFLICT_ERRORS = new Set([
  'remote_artifact_not_persisted',
  'review_artifact_hash_mismatch',
  'review_artifact_semantic_mismatch',
  'review_artifact_unparsable',
  'review_binding_invalid',
  'review_status_mismatch',
  'board_conflict'
]);
// Fixed additional codes emitted by this module only.
const REVALIDATION_FINAL_CONFLICT_CODES = new Set(['final_review_state_conflict','final_review_evidence_conflict']);
// Transient loss of readability: network/timeout/429/5xx or an observation that
// is simply absent. These keep the historical conclusion and mark it unre-checked.
const REVALIDATION_UNAVAILABLE_ERRORS = new Set(['snapshot_unavailable','remote_io_unavailable','board_observation_unavailable','rate_limited']);
const REVALIDATION_AUTH_ERRORS = new Set(['auth_blocked','unauthorized','forbidden']);
class RevalidationFailure extends Error {
  constructor(code, cause) { super(code); this.code = code; if (cause) this.cause = cause; }
}
// ANS P1-01 boundary: only fixed, enumerated codes may reach the ledger. Any
// unexpected exception collapses to `internal_error` so raw error text (which can
// carry URLs, payload fragments or secrets) never lands in a receipt or log.
export function classifyRevalidationFailure(error) {
  const code = typeof error?.code === 'string' && /^[a-z0-9_]{1,80}$/.test(error.code) ? error.code : '';
  const message = typeof error?.message === 'string' ? error.message : '';
  const token = code || message;
  if (REVALIDATION_CONFLICT_ERRORS.has(token)) return { outcome: 'conflict', reason: token };
  if (REVALIDATION_FINAL_CONFLICT_CODES.has(token)) return { outcome: 'conflict', reason: token };
  if (REVALIDATION_UNAVAILABLE_ERRORS.has(token)) return { outcome: 'unavailable', reason: token };
  if (REVALIDATION_AUTH_ERRORS.has(token)) return { outcome: 'auth_blocked', reason: 'auth_blocked' };
  const status = error?.status;
  if (status === 401 || status === 403) return { outcome: 'auth_blocked', reason: 'auth_blocked' };
  if (status === 429 || error?.name === 'TimeoutError' || error?.name === 'AbortError') return { outcome: 'unavailable', reason: 'remote_io_unavailable' };
  if (Number.isInteger(status) && status >= 500 && status < 600) return { outcome: 'unavailable', reason: 'remote_io_unavailable' };
  return { outcome: 'internal_error', reason: 'internal_error' };
}
async function readBoundRemote(readRemote, target) {
  let bytes;
  try { bytes = await readRemote(target); }
  catch (error) {
    const status = error?.status;
    if (status === 401 || status === 403) throw new RevalidationFailure('auth_blocked', error);
    throw new RevalidationFailure('remote_io_unavailable', error);
  }
  if (bytes == null) throw new RevalidationFailure('remote_artifact_not_persisted');
  return bytes;
}
async function recheckBoundFinalReview({root,record,agent,seat,snapshot,readRemote,now}){
  try{
    const bytes = validateArtifact(root, record, agent, seat);
    if (digest(await readBoundRemote(readRemote, seat.artifact.path)) !== digest(bytes)) throw new RevalidationFailure('remote_artifact_not_persisted');
    const observed = await snapshot();
    if (observed?.available !== true) throw new RevalidationFailure('snapshot_unavailable');
    const task = taskFor(observed, seat.assignment.id);
    if (!task) throw new RevalidationFailure('snapshot_unavailable');
    if (task.date !== record.date || task.claimed_by !== agent) throw new RevalidationFailure('board_conflict');
    if (!fresh(observed, agent, now)) throw new RevalidationFailure('snapshot_unavailable');
    if (!FINAL_STATUSES.includes(task.status)) throw new RevalidationFailure('final_review_state_conflict');
    if (task.evidence_path !== seat.artifact.path || task.evidence_sha256 !== seat.artifact.sha256) throw new RevalidationFailure('final_review_evidence_conflict');
    const review = task.review;
    if (!review || !evidencePath(review.evidence_path) || !/^[a-f0-9]{64}$/.test(review.evidence_sha256 || '')) throw new RevalidationFailure('review_binding_invalid');
    const reviewBytes = await readBoundRemote(readRemote, review.evidence_path);
    if (digest(reviewBytes) !== review.evidence_sha256) throw new RevalidationFailure('review_artifact_hash_mismatch');
    let verdict;
    try { verdict = JSON.parse(Buffer.from(reviewBytes).toString('utf8')); }
    catch { throw new RevalidationFailure('review_artifact_unparsable'); }
    if (verdict.accepted !== seat.accepted || (verdict.artifact_sha256 || verdict.reviewed_sha256) !== seat.artifact.sha256 || verdict.task_id !== seat.assignment.id || verdict.date !== record.date || verdict.run_key !== record.run_key) throw new RevalidationFailure('review_artifact_semantic_mismatch');
    if ((task.status === 'completed_draft_review') !== verdict.accepted) throw new RevalidationFailure('review_status_mismatch');
    return {outcome:'verified', reason:'final_review_revalidated_stable'};
  }catch(error){
    // Fail-closed: an unexpected exception can never be read as "verified", and
    // its raw text is replaced by a fixed code before persistence.
    return classifyRevalidationFailure(error);
  }
}

export async function syncDailyBoard({root, date, snapshot, command, readRemote, now=Date.now()}) {
  const record = readLedger(root, date);
  if (!record) return null;
  if (record.date !== date) throw Error('reservation_date_mismatch');
  for (const [agent, seat] of Object.entries(record.seats)) {
    recoverArtifact(root,record,agent,seat);
    if(seat.assignment&&seat.claim_verified&&['missing_required_section','generation_failed_no_repurchase','failure_sync_unknown','failed_no_repurchase'].includes(seat.status)){await syncFailedSeat({root,record,agent,seat,snapshot,command,readRemote,now});continue;}
    if (seat.status === 'generation_started') {
      seat.status = 'generation_unknown_no_repurchase';
      seat.sync_reason = 'no_unique_complete_artifact_outcome_unknown';
      saveLedger(root,record);
    }
    if (!seat.assignment || !seat.claim_verified || !seat.artifact || !['generated_pending_sync','sync_unknown','submitted_pending_review','review_unknown','completed_draft_review','rejected_draft_review'].includes(seat.status)) continue;
    if (FINAL_STATUSES.includes(seat.status) && seat.review_verified === true && seat.review_receipt) {
      const {outcome, reason} = await recheckBoundFinalReview({root,record,agent,seat,snapshot,readRemote,now});
      seat.revalidation = outcome;
      seat.revalidation_reason = reason;
      if (outcome === 'verified') {
        seat.sync_reason = reason;
        saveLedger(root, record);
        continue;
      }
      if (outcome !== 'conflict') {
        // 瞬时不可读 / 鉴权被拒 / 未知内部异常：历史结论与原 review_receipt 原样保留，
        // 但当前不再计为已核验（hasUnverifiedBoard 依据 revalidation !== 'verified' 暴露）。
        // 异常原文一律不落账，只写固定枚举码。
        seat.sync_reason = outcome === 'unavailable'
          ? 'final_review_revalidation_unavailable'
          : outcome === 'auth_blocked'
            ? 'final_review_revalidation_auth_blocked'
            : 'final_review_revalidation_internal_error';
        saveLedger(root, record);
        continue;
      }
      // 真实证据冲突：明确降级，旧证据保留在 review_receipt 中备查。
      seat.review_conflict = true;
      seat.review_verified = false;
      seat.accepted = false;
      seat.status = 'review_unknown';
      seat.sync_reason = `final_review_evidence_conflict:${reason}`;
      saveLedger(root, record);
      continue;
    }
    seat.revalidation = undefined;
    seat.revalidation_reason = undefined;
    seat.submission_verified = false;
    seat.review_verified = false;
    seat.accepted = false;
    try {
      const bytes = validateArtifact(root, record, agent, seat);
      if (digest(await readRemote(seat.artifact.path)) !== digest(bytes)) throw Error('remote_artifact_not_persisted');
      const before = await snapshot(), task = taskFor(before, seat.assignment.id);
      if (!fresh(before, agent, now) || task?.date !== date || task?.claimed_by !== agent) throw Error('board_unavailable_or_wrong_owner');
      const finalStatuses = ['completed_draft_review','rejected_draft_review'];
      const matches = t => ['submitted_pending_review',...finalStatuses].includes(t?.status) && t.date === date && t.claimed_by === agent && t.evidence_path === seat.artifact.path && t.evidence_sha256 === seat.artifact.sha256 && t.paid === false;
      let observed = before;
      if (!matches(task)) {
        if (task?.status !== 'claimed') throw Error('board_conflict');
        seat.submission_intent ||= {id:keyed('submit',record,agent),task_id:seat.assignment.id,path:seat.artifact.path,sha256:seat.artifact.sha256};
        seat.status = 'sync_unknown'; saveLedger(root, record);
        await command({id:seat.submission_intent.id, action:'submit_task', agent, task_id:seat.assignment.id, evidence_path:seat.artifact.path, evidence_sha256:seat.artifact.sha256});
        observed = await snapshot();
        if (!fresh(observed, agent, now) || !matches(taskFor(observed, seat.assignment.id))) throw Error('submission_readback_failed');
      }
      const submitted = taskFor(observed,seat.assignment.id);
      seat.submission_verified = true;
      seat.submission_receipt = {task_id:submitted.id,evidence_path:submitted.evidence_path,evidence_sha256:submitted.evidence_sha256,submitted_at:submitted.submitted_at,observed_at:observed.ran_at};
      seat.status = 'submitted_pending_review';
      seat.sync_reason = 'remote_artifact_and_board_hash_verified';
      seat.accepted = false;
      seat.review_verified = false;
      if (finalStatuses.includes(submitted.status)) {
        const review = submitted.review;
        seat.status = 'review_unknown'; saveLedger(root,record);
        const body = JSON.parse(bytes);
        if (review?.scope !== 'engineering_draft_only' || typeof review.accepted !== 'boolean' || review.reviewed_sha256 !== seat.artifact.sha256 || review.worker_actual_provider !== body.actual_provider || !review.reviewer_actual_provider || review.worker_actual_provider === review.reviewer_actual_provider || !evidencePath(review.evidence_path) || !/^[a-f0-9]{64}$/.test(review.evidence_sha256 || '')) throw Error('review_binding_invalid');
        const reviewBytes = await readRemote(review.evidence_path);
        if (digest(reviewBytes) !== review.evidence_sha256) throw Error('review_artifact_hash_mismatch');
        const verdict = JSON.parse(Buffer.from(reviewBytes).toString('utf8'));
        if (verdict.accepted !== review.accepted || (verdict.artifact_sha256 || verdict.reviewed_sha256) !== seat.artifact.sha256 || verdict.task_id !== seat.assignment.id || verdict.date !== record.date || verdict.run_key !== record.run_key || verdict.source_commit !== record.source_commit || verdict.actual_provider !== review.reviewer_actual_provider) throw Error('review_artifact_semantic_mismatch');
        if ((submitted.status === 'completed_draft_review') !== review.accepted) throw Error('review_status_mismatch');
        seat.review_receipt = {...review,task_id:submitted.id,observed_at:observed.ran_at};
        seat.review_verified = true;
        seat.accepted = review.accepted;
        seat.status = submitted.status;
        seat.sync_reason = 'bound_independent_draft_review_verified_not_deployment';
        // 本轮已完成完整只读核验（产物哈希+评审回执哈希+语义+状态一致性），
        // 当前核验状态即为 verified，避免下游把刚核验通过的终态误判为待核。
        seat.revalidation = 'verified';
        seat.revalidation_reason = 'final_review_revalidated_stable';
      }
    } catch (error) {
      seat.status = seat.status === 'review_unknown' ? 'review_unknown' : 'sync_unknown';
      // A committed historical draft can fail a newer delivery rule before any
      // network read. Keep the reservation and report that boundary accurately.
      const localFailure=['artifact_delivery_missing_required_section','artifact_delivery_incomplete','artifact_delivery_unverified','artifact_delivery_invalid_delivery_requirements'];
      seat.sync_reason = localFailure.includes(error?.message)?error.message:'remote_submission_or_evidence_unverified';
    }
    saveLedger(root, record);
  }
  return record;
}

export async function syncReviewedSeats({root, date, snapshot, command, readRemote, now=Date.now()}) {
  const record = readLedger(root, date);
  if (!record) return null;
  if (record.date !== date) throw Error('reservation_date_mismatch');
  for (const [agent, seat] of Object.entries(record.seats)) {
    if (!seat.assignment || !seat.claim_verified || !seat.artifact) continue;
    if (!['submitted_pending_review','review_unknown','completed_draft_review','rejected_draft_review'].includes(seat.status)) continue;
    // Post-review readback only: never re-submits and never clears a verified
    // submission; a review that is not yet on the board is left pending.
    try {
      const bytes = validateArtifact(root, record, agent, seat);
      if (digest(await readRemote(seat.artifact.path)) !== digest(bytes)) throw Error('remote_artifact_not_persisted');
      const before = await snapshot(), task = taskFor(before, seat.assignment.id);
      if (!fresh(before, agent, now) || task?.date !== date || task?.claimed_by !== agent) throw Error('board_unavailable_or_wrong_owner');
      const finalStatuses = ['completed_draft_review','rejected_draft_review'];
      const matches = t => ['submitted_pending_review',...finalStatuses].includes(t?.status) && t.date === date && t.claimed_by === agent && t.evidence_path === seat.artifact.path && t.evidence_sha256 === seat.artifact.sha256 && t.paid === false;
      if (!matches(task) || !finalStatuses.includes(task.status)) {
        seat.status = 'submitted_pending_review';
        seat.sync_reason = 'review_not_yet_on_board_no_resubmit';
        seat.review_verified = false;
        saveLedger(root, record);
        continue;
      }
      const review = task.review;
      const body = JSON.parse(bytes);
      if (review?.scope !== 'engineering_draft_only' || typeof review.accepted !== 'boolean' || review.reviewed_sha256 !== seat.artifact.sha256 || review.worker_actual_provider !== body.actual_provider || !review.reviewer_actual_provider || review.worker_actual_provider === review.reviewer_actual_provider || !evidencePath(review.evidence_path) || !/^[a-f0-9]{64}$/.test(review.evidence_sha256 || '')) throw Error('review_binding_invalid');
      const reviewBytes = await readRemote(review.evidence_path);
      if (digest(reviewBytes) !== review.evidence_sha256) throw Error('review_artifact_hash_mismatch');
      const verdict = JSON.parse(Buffer.from(reviewBytes).toString('utf8'));
      if (verdict.accepted !== review.accepted || (verdict.artifact_sha256 || verdict.reviewed_sha256) !== seat.artifact.sha256 || verdict.task_id !== seat.assignment.id || verdict.date !== record.date || verdict.run_key !== record.run_key || verdict.source_commit !== record.source_commit || verdict.actual_provider !== review.reviewer_actual_provider) throw Error('review_artifact_semantic_mismatch');
      if ((task.status === 'completed_draft_review') !== review.accepted) throw Error('review_status_mismatch');
      seat.review_receipt = {...review,task_id:task.id,observed_at:before.ran_at};
      seat.review_verified = true;
      seat.accepted = review.accepted;
      seat.status = task.status;
      seat.sync_reason = 'bound_independent_draft_review_readback_no_resubmit';
    } catch (error) {
      seat.status = 'review_unknown';
      seat.review_verified = false;
      seat.accepted = false;
      seat.sync_reason = error?.message || 'review_readback_unverified';
    }
    saveLedger(root, record);
  }
  return record;
}

export const hasUnverifiedBoard = record => Object.values(record?.seats || {}).some(seat => ['blocked','claim_pending','generation_started','generation_unknown_no_repurchase','missing_required_section','failure_sync_unknown','sync_unknown','review_unknown'].includes(seat.status) || (FINAL_STATUSES.includes(seat.status) && seat.revalidation !== 'verified'));
