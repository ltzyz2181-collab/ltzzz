import fs from 'node:fs';
import path from 'node:path';
import {spawnSync, execFileSync} from 'node:child_process';
import {sha256} from './lib/review-approval.mjs';
const files = ['review-delegation', 'ans-cycle', 'claude-review', 'promotion-queue', 'memory-candidate-quality', 'panel-shadow', 'rentahuman-stage1', 'internal-daily-hire', 'ans-board-sync', 'ans-task-review'].map(name => 'scripts/tests/' + name + '.test.mjs');
const result = spawnSync(process.execPath, ['--test', '--test-reporter=tap', ...files], {encoding: 'utf8', timeout: 120000, maxBuffer: 12e6});
process.stdout.write(result.stdout || ''); process.stderr.write(result.stderr || '');
const count = name => Number((result.stdout || '').match(new RegExp('^# ' + name + ' (\\d+)$', 'm'))?.[1] || 0);
const ok = result.status === 0 && count('pass') > 0 && count('fail') === 0;
const inputs = [...files, 'config/review-delegation.json', 'config/autonomy-authority.json', 'scripts/lib/review-approval.mjs', 'scripts/lib/pending-supervision.mjs', 'scripts/lib/ans-cycle.mjs', 'scripts/lib/claude-review.mjs', 'scripts/run-ans-cycle.mjs', 'tools/reviewed-memory.mjs', 'tools/promote-memory.mjs', 'scripts/scan-muse-assets.js'];
const proof = {schema_version: 1, at: new Date().toISOString(), run_id: process.env.GITHUB_RUN_ID || null,
  source_commit: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(),
  working_tree_clean_before_receipt: !execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim(),
  status: ok ? 'review_delegation_code_verified' : 'review_delegation_verification_failed',
  tests: count('tests'), passed: count('pass'), failed: count('fail'),
  inputs: inputs.map(file => ({path: file, sha256: sha256(fs.readFileSync(file))})),
  actual_native_supervisory_generation_verified: false, actual_video_published: false,
  actual_memory_promotion_from_native_call_verified: false, controller_permissions_reduced: false,
  model_calls: 0, new_paid_schedules: 0, paid: false, tx_hash: null};
const args = process.argv.slice(2);
if (args.length) {
  if (args.length !== 2 || args[0] !== '--report' || !/^knowledge\/results\/review-delegation\/[A-Za-z0-9_.-]+\.json$/.test(args[1])) throw Error('invalid_report_path');
  fs.mkdirSync(path.dirname(args[1]), {recursive: true}); fs.writeFileSync(args[1], JSON.stringify(proof, null, 2) + '\n');
}
console.log(JSON.stringify({status: proof.status, passed: proof.passed, failed: proof.failed, model_calls: 0}));
if (!ok) process.exitCode = 1;
