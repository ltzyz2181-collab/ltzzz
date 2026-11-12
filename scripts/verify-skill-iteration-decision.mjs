import fs from 'node:fs';
import {verifyDecision, readDecisionFile, proposalHash} from './lib/skill-iteration-decision.mjs';

const [decisionPath, proposalPath] = process.argv.slice(2);
if (!decisionPath) {
  console.error(JSON.stringify({ok: false, errors: ['decision_path_required']}));
  process.exit(1);
}

let decision, proposalText = null;
try {
  decision = readDecisionFile(decisionPath);
  if (proposalPath) proposalText = fs.readFileSync(proposalPath, 'utf8');
} catch (e) {
  console.error(JSON.stringify({ok: false, errors: ['decision_or_proposal_unreadable']}));
  process.exit(1);
}

const result = verifyDecision(decision, {proposalText: proposalText ?? undefined});
const payload = {
  ...result,
  proposal_sha256: proposalText ? proposalHash(proposalText) : null,
  approved_scope: result.ok ? decision.approved_scope : null,
  next: result.ok
    ? 'decision_verified_auto_review_then_deploy_allowed'
    : 'deploy_blocked_no_gpt_approval'
};
console.log(JSON.stringify(payload));
process.exit(result.ok ? 0 : 1);
