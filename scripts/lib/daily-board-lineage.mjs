import fs from 'node:fs';
import path from 'node:path';
import {readLedger,ledgerPath} from './daily-task-board.mjs';

const resultRunKey = result => {
  const match = /^gha-(.+)-attempt-(\d+)$/.exec(result?.execution_id || '');
  return match ? `${match[1]}:${match[2]}` : null;
};
export function projectDailyBoard(result,record) {
  if (!record || record.date !== result?.date || resultRunKey(result) !== record.run_key) return result;
  const projected = structuredClone(result);
  projected.board_workflow = {ledger_path:ledgerPath(record.date),run_key:record.run_key,source_commit:record.source_commit,scope:'daily_run_only_not_independent_ans_or_production_deployment'};
  for (const task of projected.tasks || []) {
    const seat = record.seats?.[task.agent];
    if (!seat?.assignment || task.assignment?.task_id !== seat.assignment.id) continue;
    const claim = seat.claim_verified === true && seat.claim_receipt?.task_id === seat.assignment.id && seat.claim_receipt?.run_key === record.run_key && seat.claim_receipt?.task_date === record.date;
    const generated = Boolean(seat.artifact) && !['generation_started','generation_failed_no_repurchase'].includes(seat.status);
    const submitted = seat.submission_verified === true && seat.submission_receipt?.task_id === seat.assignment.id && seat.submission_receipt?.evidence_path === seat.artifact?.path && seat.submission_receipt?.evidence_sha256 === seat.artifact?.sha256;
    const reviewed = seat.review_verified === true && seat.review_receipt?.task_id === seat.assignment.id && seat.review_receipt?.reviewed_sha256 === seat.artifact?.sha256 && seat.review_receipt?.scope === 'engineering_draft_only';
    task.board_lifecycle = {
      date:record.date,task_id:seat.assignment.id,source_task_id:seat.assignment.source_task_id || null,
      run_key:record.run_key,source_commit:record.source_commit,board_status:seat.status,
      claim_verified:claim,claim_receipt:seat.claim_receipt || null,
      artifact:seat.artifact || null,submission_verified:submitted,submission_receipt:seat.submission_receipt || null,
      independent_review_verified:reviewed,review_receipt:seat.review_receipt || null,
      lifecycle_complete:claim && generated && submitted && reviewed,
      draft_accepted:reviewed && seat.accepted === true,
      review_scope:reviewed?'engineering_draft_only':null,
      production_deployment_accepted:false,deployed:false,paid:false,tx_hash:null,
    };
    task.assignment = {...task.assignment,status:seat.status,claim_verified:claim,evidence_path:seat.artifact?.path || null,evidence_sha256:seat.artifact?.sha256 || null};
    // task.status/output remain the historical provider execution result.
  }
  return projected;
}
export function reconcileDailyResult(root,date) {
  const file = path.join(root,`data/results/${date}.json`);
  const record = readLedger(root,date);
  if (!record || !fs.existsSync(file)) return false;
  const result = JSON.parse(fs.readFileSync(file,'utf8'));
  const projected = projectDailyBoard(result,record);
  if (projected === result) return false;
  fs.writeFileSync(file,JSON.stringify(projected,null,2)+'\n');
  return true;
}
