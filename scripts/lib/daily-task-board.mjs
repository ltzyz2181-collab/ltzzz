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

// Commit this reservation before any model request. A different run/attempt can
// reconcile artifacts but cannot spend again, even after an ambiguous crash.
export async function prepareDailyBoard({root, date, runKey, sourceCommit, agents, control, snapshot, command, now=Date.now()}) {
  const prior = readLedger(root, date);
  if (prior) return prior;
  const record = {schema_version:1, date, run_key:runKey, source_commit:sourceCommit, seats:{}, paid:false, tx_hash:null};
  saveLedger(root, record);
  for (const agent of agents) {
    const seat = record.seats[agent] = {agent, status:'blocked', reason:'claim_not_verified', claim_verified:false, paid:false, tx_hash:null};
    saveLedger(root, record);
    try {
      const before = await snapshot();
      if (!fresh(before, agent, now)) throw Error('snapshot_unavailable_or_paused');
      const assignment = dailyAssignment(agent, date, {control, pulse:before});
      seat.assignment = assignment;
      if (assignment) {
        const task = taskFor(before, assignment.id);
        // An already-claimed task could belong to a different executor; never
        // adopt it merely because it uses the same logical seat.
        if (!task || !['assigned','available'].includes(task.status) || (task.assigned_to && task.assigned_to !== agent)) throw Error('task_not_available');
        await command({id:`daily-claim-${date}-${agent}`, action:'claim_task', agent, task_id:assignment.id});
        const after = await snapshot();
        const claimed = taskFor(after, assignment.id);
        if (!fresh(after, agent, now) || claimed?.status !== 'claimed' || claimed.claimed_by !== agent) throw Error('claim_readback_failed');
        seat.claim_verified = true;
      }
      seat.status = 'reserved';
      seat.reason = assignment ? 'remote_claim_verified' : 'existing_role_without_board_assignment';
    } catch {
      // Never persist remote exception text (it may contain authentication data).
      seat.reason = 'claim_or_snapshot_blocked';
    }
    saveLedger(root, record);
  }
  return record;
}

export async function runReservedSeat({root, date, runKey, agent, call}) {
  const record = readLedger(root, date), seat = record?.seats?.[agent];
  if (!seat || record.run_key !== runKey || seat.status !== 'reserved' || (seat.assignment && !seat.claim_verified)) {
    return {ok:false,status:'blocked_no_repurchase',error:'No unused reservation owned by this run'};
  }
  seat.status = 'generation_started';
  saveLedger(root, record);
  let result;
  try { result = await call(); }
  catch { result = {ok:false,status:'generation_unknown',error:'provider_result_unknown'}; }
  const integrity = assessDelivery({output:result.output, finish_reason:result.finish_reason});
  const complete = result.ok === true && integrity.status === 'structurally_complete' && !/SPEND_PROPOSAL\s*[:：]/i.test(result.output || '');
  const artifact = {
    schema_version:1, date, task_id:seat.assignment?.id || null, logical_seat:agent,
    actual_provider:result.ok ? agent : null, actual_model:result.model_source === 'requested_model' ? null : (result.model || null),
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
  return result;
}

export function validateArtifact(root, record, agent, seat) {
  const a = seat.artifact;
  if (!a || !/^[a-f0-9]{64}$/.test(a.sha256 || '') || a.path !== `knowledge/results/daily-board/artifacts/${record.date}-${agent}-${a.sha256}.json`) throw Error('artifact_path_invalid');
  const bytes = fs.readFileSync(path.join(root, a.path));
  if (digest(bytes) !== a.sha256) throw Error('artifact_hash_mismatch');
  const body = JSON.parse(bytes);
  if (body.task_id !== seat.assignment?.id || body.logical_seat !== agent || body.source_commit !== record.source_commit || body.status !== 'complete' || assessDelivery(body).status !== 'structurally_complete') throw Error('artifact_binding_invalid');
  return bytes;
}

export async function syncDailyBoard({root, date, snapshot, command, readRemote, now=Date.now()}) {
  const record = readLedger(root, date);
  if (!record) return null;
  for (const [agent, seat] of Object.entries(record.seats)) {
    if (!seat.assignment || !seat.claim_verified || !seat.artifact || !['generated_pending_sync','sync_unknown','submitted_pending_review'].includes(seat.status)) continue;
    try {
      const bytes = validateArtifact(root, record, agent, seat);
      if (digest(await readRemote(seat.artifact.path)) !== digest(bytes)) throw Error('remote_artifact_not_persisted');
      const before = await snapshot(), task = taskFor(before, seat.assignment.id);
      if (!fresh(before, agent, now) || task?.claimed_by !== agent) throw Error('board_unavailable_or_wrong_owner');
      const matches = t => t?.status === 'submitted_pending_review' && t.claimed_by === agent && t.evidence_path === seat.artifact.path && t.evidence_sha256 === seat.artifact.sha256 && t.paid === false;
      if (!matches(task)) {
        if (task?.status !== 'claimed') throw Error('board_conflict');
        // Persist uncertain intent before POST; on timeout, next sync reads state
        // first and uses the same id and hash rather than buying output again.
        seat.status = 'sync_unknown'; saveLedger(root, record);
        await command({id:`daily-submit-${date}-${agent}`, action:'submit_task', agent, task_id:seat.assignment.id, evidence_path:seat.artifact.path, evidence_sha256:seat.artifact.sha256});
        const after = await snapshot();
        if (!fresh(after, agent, now) || !matches(taskFor(after, seat.assignment.id))) throw Error('submission_readback_failed');
      }
      seat.status = 'submitted_pending_review';
      seat.sync_reason = 'remote_artifact_and_board_hash_verified';
      seat.accepted = false;
    } catch {
      seat.status = 'sync_unknown';
      seat.sync_reason = 'remote_submission_or_evidence_unverified';
    }
    saveLedger(root, record);
  }
  return record;
}
