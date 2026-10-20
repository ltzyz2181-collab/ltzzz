import {beginExecution,finishExecution} from '../../lib/provider-execution.js';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {dailyAssignment} from './daily-assignment.mjs';
import {pulseGate} from './pulse-client.mjs';
import {assessDelivery} from '../delivery-integrity.mjs';

export const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export const ledgerPath = date => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw Error('invalid_date');
  return `knowledge/results/daily-board/${date}.json`;
};
export function readLedger(root, date) {
  const file = path.join(root, ledgerPath(date));
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : null;
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
  const integrity = assessDelivery({output:result.output, finish_reason:result.finish_reason});
  const complete = result.ok === true && integrity.status === 'structurally_complete' && !/SPEND_PROPOSAL\s*[:：]/i.test(result.output || '');
  const artifact = {
    execution:finishExecution(execution,{http:result.http??null,transportOk:result.ok===true,data:{model:result.model_source==='provider_response'?(result.returned_model||result.model):null,choices:[{message:{content:result.output},finish_reason:result.finish_reason}],usage:{total_tokens:result.tokens_used}}}),
    schema_version:1, date, task_id:seat.assignment?.id || null, logical_seat:agent,
    actual_provider:result.ok ? agent : null, actual_model:result.model_source === 'provider_response' ? (result.returned_model || result.model || null) : null,
    reported_model:result.model || null, model_source:result.model_source || null, source_commit:record.source_commit,
    run_key:runKey, output:String(result.output || ''), finish_reason:result.finish_reason || null,
    tokens_used:result.tokens_used ?? null, request_id:result.request_id || null,
    integrity, status:complete?'complete':'incomplete_or_failed', provider_status:result.status || null,
    accepted:false, paid:false, tx_hash:null
  };
  const bytes = JSON.stringify(artifact, null, 2)+'\n';
  const hash = digest(bytes);
  const relative = `knowledge/results/daily-board/artifacts/${date}-${agent}-${hash}.json`;
  const file = path.join(root, relative);
  fs.mkdirSync(path.dirname(file), {recursive:true});
  fs.writeFileSync(file, bytes, {flag:'wx'});
  seat.artifact = {path:relative, sha256:hash};
  seat.status = complete ? 'generated_pending_sync' : 'generation_failed_no_repurchase';
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
  if (body.date !== record.date || body.run_key !== record.run_key || body.task_id !== seat.assignment?.id || body.logical_seat !== agent || body.source_commit !== record.source_commit || body.status !== 'complete' || assessDelivery(body).status !== 'structurally_complete' || /SPEND_PROPOSAL\s*[:：]/i.test(body.output || '')) throw Error('artifact_binding_invalid');
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

export async function syncDailyBoard({root, date, snapshot, command, readRemote, now=Date.now()}) {
  const record = readLedger(root, date);
  if (!record) return null;
  if (record.date !== date) throw Error('reservation_date_mismatch');
  for (const [agent, seat] of Object.entries(record.seats)) {
    recoverArtifact(root,record,agent,seat);
    if (seat.status === 'generation_started') {
      seat.status = 'generation_unknown_no_repurchase';
      seat.sync_reason = 'no_unique_complete_artifact_outcome_unknown';
      saveLedger(root,record);
    }
    if (!seat.assignment || !seat.claim_verified || !seat.artifact || !['generated_pending_sync','sync_unknown','submitted_pending_review','review_unknown','completed_draft_review','rejected_draft_review'].includes(seat.status)) continue;
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
      }
    } catch {
      seat.status = seat.status === 'review_unknown' ? 'review_unknown' : 'sync_unknown';
      seat.sync_reason = 'remote_submission_or_evidence_unverified';
    }
    saveLedger(root, record);
  }
  return record;
}

export const hasUnverifiedBoard = record => Object.values(record?.seats || {}).some(seat => ['blocked','claim_pending','generation_started','generation_unknown_no_repurchase','sync_unknown','review_unknown'].includes(seat.status));
