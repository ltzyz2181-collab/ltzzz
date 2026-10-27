// Read-only provisioning/preflight. Does not discover or generate private keys,
// write GitHub Secrets, sign, invoke a model, merge a PR or activate a switch.
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {canonical,sha256,TASK} from './lib/patchgate.mjs';
import {validateA2Config,validateExecutorRegistry,rolloutApproved,sourceBindingsVerified} from './lib/patchgate-a2.mjs';

import {A2_REVIEW_FILES} from '../patchgate-a2-manifest.mjs';
export const A2_BUNDLE_FILES=A2_REVIEW_FILES;
export function bundleDigest({read}){
  const entries=A2_BUNDLE_FILES.map(name=>{
    let bytes=Buffer.from(read(name));
    if(name==='config/patchgate-a2.json'){
      const config=JSON.parse(bytes.toString('utf8'));
      // Exclude only the evidence that authenticates this bundle. All authority
      // bits, identities, policy and source files are inside the commitment.
      delete config.runtime_bundle_sha256;delete config.stage_audits;delete config.external_stage_audits;
      bytes=Buffer.from(canonical(config));
    }
    return {path:name,sha256:sha256(bytes)};
  });
  return {sha256:sha256(canonical(entries)),files:entries};
}
export function preflightA2({read,sourceCommit,now=Date.now()}){
  const config=JSON.parse(read('config/patchgate-a2.json')),registry=JSON.parse(read('config/patchgate-executors.json')),trust=JSON.parse(read('config/patchgate-trust.json'));
  validateA2Config(config);
  const bundle=bundleDigest({read}),blockers=[];
  if(config.enabled!==true)blockers.push('A2_switch_disabled');
  if(!sourceBindingsVerified({registry,trust}))blockers.push('signer_source_deployment_bindings_not_verified');
  if(!validateExecutorRegistry({registry,trust}))blockers.push('registered_real_signers_not_provisioned');
  if(config.production_signing_keys_provisioned!==true)blockers.push('production_signing_transport_not_verified');
  // B2/PR248: only L0 docs use mandatory post-merge tree verification plus a
  // persistent pre-merge stop latch. No atomic expected-base API is claimed.
  if(config.postmerge_readback_enforced!==true)blockers.push('L0_postmerge_controls_missing');
  if(config.runtime_bundle_sha256!==bundle.sha256)blockers.push('exact_runtime_bundle_not_approved');
  if(!rolloutApproved({config,registry,trust,runnerSha:sourceCommit,runtimeBundleSha256:bundle.sha256,now}))blockers.push('Qwen_Doubao_stage_signatures_missing_or_invalid');
  return {task_id:TASK,phase:'A2_preflight_only',status:blockers.length?'blocked_not_activated':'configuration_preflight_only_live_acceptance_still_required',source_commit:sourceCommit||null,
    runtime_bundle:bundle,signing_executor_ids:registry.executors.filter(e=>e.signing_enabled===true).map(e=>e.id),blockers,
    native_model_calls:0,automatic_merge:false,automatic_deploy:false,financial_execution:false,paid:false,tx_hash:null};
}
if(import.meta.url===`file://${process.argv[1]}`){
  if(process.argv.length!==2)throw Error('usage_node_scripts_patchgate_a2_preflight_mjs');
  const root=fs.realpathSync(process.cwd());
  const read=name=>{if(!A2_BUNDLE_FILES.includes(name))throw Error('fixed_bundle_file_required');const target=path.join(root,name),real=fs.realpathSync(target);if(real!==target||!real.startsWith(root+path.sep)||!fs.statSync(real).isFile())throw Error('regular_trusted_bundle_file_required');return fs.readFileSync(real);};
  const sourceCommit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const out=preflightA2({read,sourceCommit});console.log(JSON.stringify(out,null,2));
  if(out.blockers.length)process.exitCode=1;
}
