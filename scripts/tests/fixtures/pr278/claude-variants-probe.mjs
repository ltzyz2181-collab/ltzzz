// Inert public strings only. This report is a bounded lexical comparison,
// not production coverage, execution, deployment or an authorization decision.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {scanFinancialSource} from './financial-exit-inventory.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const repaired = [
  ['optional_call', 'w?.sendTransaction?.(tx)'],
  ['optional_sdk_call', 'client.writeContract?.(args)'],
  ['method_call', 'w.sendTransaction.call(w,tx)'],
  ['method_apply', 'w.sendTransaction.apply(w,args)'],
  ['multiline_bracket', "w[\n'sendTransaction'\n](tx)"],
  ['destructured_alias', 'const {transfer:t}=token; t(a,b)'],
  ['destructured_shorthand', 'const {sendTransaction}=w; sendTransaction(tx)']
];
const unresolved = [
  ['reflection', "Reflect.get(w,'transfer')(a,b)"],
  ['array_join', "w[['send','Transaction'].join('')](tx)"],
  ['variable_key', 'token[k](a,b)'],
  ['character_codes', 'w[String.fromCharCode(116,114,97,110,115,102,101,114)](a,b)'],
  ['template_expression', 'token[`${n}`](a,b)'],
  ['abi_lookup', "contract.getFunction('transfer')(a,b)"],
  ['python_raw_transaction', 'client.eth.send_raw_transaction(raw)']
];
const inspect = ([id, source]) => ({
  id, source, source_sha256: sha(source), matches: scanFinancialSource(source),
  sample_executed: false
});
const repairedResults = repaired.map(inspect);
const unresolvedResults = unresolved.map(inspect);
const report = {
  schema: 'ltzzz.m1.claude-variant-probe.v1',
  task_id: 'PLAN-EXTERNAL-MARKETS-20261024',
  step_id: 'M1-PR278-SANDBOX-AND-BACKLOG',
  original_head: '86b8c8f2a9b20282ae20bfc8d00bb21cf330b8f1',
  advisory_audit_PR: 288,
  at_utc: new Date().toISOString(), runtime: process.version,
  candidate_source_sha256: sha(fs.readFileSync(new URL('./financial-exit-inventory.mjs', import.meta.url))),
  repaired: repairedResults,
  unresolved: unresolvedResults,
  repaired_detected: repairedResults.filter(x => x.matches.length > 0).length,
  unresolved_still_missed: unresolvedResults.filter(x => x.matches.length === 0).length,
  full_semantic_coverage_verified: false,
  production_scanner_modified: false,
  production_deployed: false,
  native_provider_review_of_this_revision: false,
  model_calls: 0, network_calls: 0, paid: false, tx_hash: null, income: 0
};
process.stdout.write(JSON.stringify(report, null, 2) + '\n');
if (report.repaired_detected !== repaired.length) process.exitCode = 1;
