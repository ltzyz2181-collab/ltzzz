import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {hash, verifyAnsEvidence, verifyOriginalHire} from './lib/claude-team-verification.mjs';
import {observeSafe} from './lib/safe-observation.mjs';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--observe-safe')) throw Error('only_fixed_readonly_mode_supported');
const root = fs.realpathSync('.');
const read = file => {
  if (!file.startsWith('knowledge/results/') || file.split('/').includes('..')) throw Error('evidence_path_invalid');
  const absolute = path.join(root, file);
  if (fs.lstatSync(absolute).isSymbolicLink() || !fs.realpathSync(absolute).startsWith(root + path.sep)) throw Error('evidence_symlink_rejected');
  return fs.readFileSync(absolute);
};
const json = file => JSON.parse(read(file));
const latestDay = dir => fs.readdirSync(dir).filter(name => /^\d{4}-\d{2}-\d{2}\.json$/.test(name)).sort().at(-1);
const dailyPath = 'knowledge/results/daily-board/' + latestDay('knowledge/results/daily-board');
const ansPath = 'knowledge/results/ans-cycle/' + latestDay('knowledge/results/ans-cycle');
const config = JSON.parse(fs.readFileSync('config/claude-team.json'));
if (config.repository !== 'ltzyz2181-collab/ltzzz') throw Error('repository_mismatch');
const inspections = fs.readdirSync('knowledge/results/funded-invest').filter(name => /^inspection-\d+-attempt-\d+\.json$/.test(name))
  .map(name => {const file = 'knowledge/results/funded-invest/' + name; return {file, body: json(file)};})
  .sort((a, b) => Date.parse(b.body.at) - Date.parse(a.body.at));
// Never silently fall back to an older rejected order if the newest inspection is unavailable or has changed status.
const inspection = inspections[0];
const order = inspection?.body.inspections?.find(item => item.label === 'external_order')?.result?.order;
const envelope = {at: new Date().toISOString(), source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  verifier_sha256: hash(fs.readFileSync('scripts/verify-claude-team.mjs')),
  source_worktree_clean: execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim() === '',
  run_id: process.env.GITHUB_RUN_ID || null, executor: 'fixed_rules_verifier_not_Claude_or_Qianwen_native_model',
  model_calls: 0, financial_execution: false, paid: false, tx_hash: null};
const ans = {...envelope, ...verifyAnsEvidence({daily: json(dailyPath), ans: json(ansPath), read}),
  evidence: [dailyPath, ansPath].map(file => ({path: file, sha256: hash(read(file))}))};
let hire;
try { hire = {...envelope, ...verifyOriginalHire(order, {inspectionPath: inspection.file, inspectionHash: hash(read(inspection.file))})}; }
catch (error) { hire = {...envelope, task_id: 'AI-HIRE-CLOSEOUT-EXT-AI-20261017-001', status: 'blocked_original_order_evidence', error: error.message}; }
const safe = args.includes('--observe-safe') ? await observeSafe() : {status: 'not_replayed_in_this_environment', verified: false, transactions_submitted: 0, tx_hash: null};
const latest = {...envelope, team_id: config.team_id, status: 'verification_executor_ready_external_team_acceptance_pending',
  app: config.github, external_team_acceptance: 'not_attested_by_this_executor',
  ans: {status: ans.status, production_deployment_verified: ans.production_deployment_verified},
  hire: {status: hire.status, order_id: hire.order_id},
  governance: {formal_five_sign_setup: 'deferred_by_owner_until_autonomy_matures', replacement_transaction_prepared: false, safe_observation: safe},
  wallet_use_enabled: config.finance.wallet_use_enabled};
const outputs = {'ans-closeout.json': ans, 'hire-closeout.json': hire, 'verification.json': latest};
fs.mkdirSync('work/claude-team-verification', {recursive: true});
for (const [name, value] of Object.entries(outputs)) fs.writeFileSync('work/claude-team-verification/' + name, JSON.stringify(value, null, 2) + '\n');
console.log(JSON.stringify(outputs, null, 2));
if (ans.failures.length || hire.status === 'blocked_original_order_evidence') process.exitCode = 1;
