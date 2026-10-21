// Piggyback one small candidate on the existing ANS author/reviewer calls.
// No new call, paid timer or automatic approval of a generic engineering draft.
import fs from 'node:fs';
import path from 'node:path';
import {memorySubject} from '../../tools/reviewed-memory.mjs';
import {reviewSubjectHash, sha256, reviewApproval} from './review-approval.mjs';
import {substantiveClaim} from '../../tools/memory-candidate-quality.mjs';

export function nextSupervision(rootDir = process.cwd()) {
  try {
    const queue = JSON.parse(fs.readFileSync(path.join(rootDir, 'memory/promote/queue.json')));
    for (const item of queue.items || []) {
      try {
      if (item.status !== 'candidate' || item.eligible_for_promotion === false || item.review_reference
        || !substantiveClaim(item.claim || '') || !Array.isArray(item.conflicts) || item.conflicts.length
        || !/^memory\/daily\/[A-Za-z0-9_.-]+\.md$/.test(item.source || '')) continue;
      const root = fs.realpathSync(rootDir), file = fs.realpathSync(path.join(root, item.source));
      if (!file.startsWith(root + path.sep)) continue;
      const source = fs.readFileSync(file, 'utf8'), fullHash = sha256(source);
      if (source.length > 5000 || !source.includes(item.claim)
        || (item.source_sha256 ? item.source_sha256 !== fullHash : item.snapshot_hash !== fullHash.slice(0, 12))) continue;
      const subject = memorySubject({...item, source_sha256: fullHash}), operation = 'memory_promotion';
      return {operation, subject, subject_sha256: reviewSubjectHash(operation, subject), source_text: source};
      } catch { continue; }
    }
  } catch { /* No eligible complete source: keep ANS engineering unchanged. */ }
  return null;
}

export function persistSupervision(record, rootDir = process.cwd()) {
  if (!record.supervisory_worker || !record.supervisory_reviewer) return null;
  if (!/^\d{4}-\d\d-\d\d$/.test(record.date || '')) throw Error('supervision_date_invalid');
  const body = {run_id: record.run_id, source_commit: record.source_commit,
    scope: 'explicit_operational_review_separate_from_engineering_acceptance',
    calls: record.calls, artifacts: [record.supervisory_worker, record.supervisory_reviewer],
    model_calls_added_for_supervision: 0, paid: false, tx_hash: null};
  const bytes = JSON.stringify(body, null, 2) + '\n';
  const relative = 'knowledge/results/ans-cycle/' + record.date + '-supervision-' + sha256(bytes) + '.json';
  const file = path.join(rootDir, relative); fs.mkdirSync(path.dirname(file), {recursive: true});
  if (!fs.existsSync(file)) fs.writeFileSync(file, bytes, {flag: 'wx'});
  return {path: relative, sha256: sha256(bytes)};
}

export function attachSupervision(queue, rootDir = process.cwd()) {
  const directory = path.join(rootDir, 'knowledge/results/ans-cycle');
  if (!fs.existsSync(directory)) return;
  for (const file of fs.readdirSync(directory).filter(f => /^\d{4}-\d\d-\d\d-supervision-[a-f0-9]{64}\.json$/.test(f)).sort()) {
    try {
      const relative = 'knowledge/results/ans-cycle/' + file, bytes = fs.readFileSync(path.join(directory, file));
      const reference = {path: relative, sha256: sha256(bytes)}, r = JSON.parse(bytes);
      const worker = r.artifacts?.find(a => a.role === 'worker'), input = JSON.parse(worker.text);
      if (input.operation !== 'memory_promotion') continue;
      const item = queue.items.find(i => i.status === 'candidate' && i.id === input.subject?.candidate_id);
      if (!item || item.review_reference) continue;
      const sourceHash = input.subject.source_sha256;
      if (item.source_sha256 ? item.source_sha256 !== sourceHash : item.snapshot_hash !== sourceHash?.slice(0, 12)) continue;
      const subject = memorySubject({...item, source_sha256: sourceHash});
      const approval = reviewApproval({rootDir, operation: 'memory_promotion', subject, reference});
      // Preserve a rejected review as a revision task, not a human approval task.
      if (approval.status === 'pending_review') continue;
      item.source_sha256 = sourceHash; item.review_reference = reference;
    } catch { /* Invalid records do not authorize candidate transitions. */ }
  }
}
