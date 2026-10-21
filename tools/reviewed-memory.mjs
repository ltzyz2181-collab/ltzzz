// Apply to derived memory, preserving six originals and historical confirmations.
import fs from 'node:fs';
import path from 'node:path';
import {reviewApproval, sha256} from '../scripts/lib/review-approval.mjs';
import {substantiveClaim} from './memory-candidate-quality.mjs';

export const memorySubject = item => ({candidate_id: item.id, claim: item.claim, source: item.source, source_sha256: item.source_sha256});
export function applyReviewedMemory(queue, {rootDir = process.cwd()} = {}) {
  const applied = [];
  for (const item of queue.items || []) {
    if (item.status !== 'candidate' || !item.review_reference) continue;
    item.human_confirmation_required = false;
    try {
      if (item.eligible_for_promotion === false || item.content_quality === 'operational_metadata'
        || !substantiveClaim(item.claim || '') || !Array.isArray(item.conflicts) || item.conflicts.length) throw Error('candidate_quality_or_conflict_unresolved');
      if (typeof item.id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(item.id)) throw Error('candidate_id_invalid');
      if (!/^memory\/daily\/[A-Za-z0-9_.-]+\.md$/.test(item.source || '')) throw Error('candidate_source_invalid');
      const root = fs.realpathSync(rootDir), source = fs.realpathSync(path.join(root, item.source));
      if (!source.startsWith(root + path.sep) || sha256(fs.readFileSync(source)) !== item.source_sha256 || !fs.readFileSync(source,'utf8').includes(item.claim)) throw Error('candidate_source_changed');
      const approval = reviewApproval({rootDir, operation: 'memory_promotion', subject: memorySubject(item), reference: item.review_reference});
      item.review_status = approval.status;
      if (!approval.ok) { item.review_reason = approval.reason || 'review_rejected'; continue; }
      const relative = 'memory/long-term/' + item.id + '.json', file = path.join(root, relative);
      fs.mkdirSync(path.dirname(file), {recursive: true});
      if (!fs.realpathSync(path.dirname(file)).startsWith(root + path.sep)) throw Error('derived_memory_path_outside_repository');
      const bytes = JSON.stringify({schema_version: 1, ...memorySubject(item), confirmation_source: 'independent_executor_review', approval}, null, 2) + '\n';
      if (fs.existsSync(file)) {
        if (fs.readFileSync(file, 'utf8') !== bytes) throw Error('immutable_promoted_memory_differs');
      } else fs.writeFileSync(file, bytes, {flag: 'wx'});
      item.status = 'applied'; item.applied_to = relative; item.applied_sha256 = sha256(bytes);
      item.confirmation_provenance = 'independent_executor_review_not_human_confirmation';
      item.review_proof = approval.proof; delete item.review_reason; applied.push(item.id);
    } catch (error) {
      item.review_status = 'revision_required';
      item.review_reason = /^[a-z_]+$/.test(error.message) ? error.message : 'candidate_source_unavailable';
    }
  }
  queue.applied = (queue.items || []).filter(item => item.status === 'applied').map(item => item.id);
  return {applied};
}
