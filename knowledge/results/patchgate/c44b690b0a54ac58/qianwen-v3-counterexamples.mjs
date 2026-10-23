// Local counterexamples against the frozen A0 module, no provider/network calls.
import fs from 'node:fs';
import {generateKeyPairSync, sign, createPublicKey} from 'node:crypto';
import {TASK,canonical,sha256,subjectFor,classify,authenticate,verifyDeployment} from '../../../../scripts/lib/patchgate.mjs';
const policy=JSON.parse(fs.readFileSync(new URL('../../../../config/patch-policy.json',import.meta.url)));
const now=Date.now(),head='b'.repeat(40),base='a'.repeat(40),pair=generateKeyPairSync('ed25519');
const pem=pair.publicKey.export({type:'spki',format:'pem'}),variant=pem.replace(/\n/g,'\r\n');
const key={id:'counterexample',provider:'openai',executor:'in_memory_test_only',enabled:true,roles:['deployment','author'],
  public_key_pem:pem,not_before:new Date(now-10000).toISOString(),not_after:new Date(now+10000).toISOString()};
const trust={schema_version:1,enabled:true,keys:[key]};
const snapshot={repository:policy.repository,task_id:TASK,base_sha:base,head_sha:head,policy_sha256:sha256(canonical(policy)),trust_sha256:sha256(canonical(trust)),files:[{path:'workers/a.js',mode:'100644',old_mode:'100644',diff:'@@ -1 +1 @@\n-old\n+new\n'}]};
const subject=subjectFor(snapshot),bytes=Buffer.from(canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:head})+'\n');
const evidence={head_sha:head,base_sha:base,target_environment:'canary',expected_version_id:'v1',
  observation:{url:'https://test.example.workers.dev',http_status:200,redirected:false,started_at_utc:new Date(now-2000).toISOString(),finished_at_utc:new Date(now).toISOString(),http_date:new Date(now-1000).toUTCString(),body_base64:bytes.toString('base64'),body_sha256:sha256(bytes),header_source_commit:head,header_version_id:'v1'},
  platform:{source:'cloudflare_current_deployment_api',http_status:200,service_name:'test',observed_at_utc:new Date(now-1000).toISOString(),versions:[{id:'v1',percentage:100}]}};
const allowedTargets=[{url:evidence.observation.url}];
const payload={subject,role:'deployment',at_utc:new Date(now).toISOString(),evidence};
const proof={key_id:key.id,payload,signature:sign(null,Buffer.from(canonical(payload)),pair.privateKey).toString('base64')};
const args={trust,subject,role:'deployment',now,maxAge:300};
const changed=structuredClone(proof);changed.payload.evidence.expected_version_id='different';
let traversalRejected=false;try {subjectFor({...snapshot,files:[{...snapshot.files[0],path:'foo/../config/patch-policy.json'}]});} catch {traversalRejected=true;}
const reused={...trust,keys:[key,{...key,id:'same_key_second_label',provider:'anthropic',public_key_pem:variant}]};
const rows={
  baseline_well_formed_test_evidence_passes:verifyDeployment({subject,evidence,allowedTargets,now}).passed,
  expected_version_mismatch_fails:!verifyDeployment({subject,evidence:changed.payload.evidence,allowedTargets,now}).passed,
  baseline_signed_evidence_authenticates:!!authenticate(proof,args),
  altering_expected_version_invalidates_signature:authenticate(changed,args)===null,
  foo_dotdot_config_path_is_rejected:traversalRejected,
  own_workflow_prefix_is_blocked:classify(policy,[{path:'.github/workflows/patchgate.yml',mode:'100644'}]).modifies_own_checks,
  pem_whitespace_normalizes_to_same_DER:createPublicKey(pem).export({type:'spki',format:'der'}).equals(createPublicKey(variant).export({type:'spki',format:'der'})),
  reused_public_key_provider_labels_are_rejected:authenticate(proof,{...args,trust:reused})===null
};
const report={task_id:TASK,source_code_commit:'da8cc52b0ad47649ed781bdc945360ae89b25f53',bundle_sha256:'c44b690b0a54ac584363a3002cd8c84b634b0db8e04daff8389dc2ff459b5f05',
  at_utc:new Date().toISOString(),node:process.version,scope:'local_deterministic_counterexamples_not_an_independent_provider_verdict',checks:rows,
  passed:Object.values(rows).every(Boolean),native_model_calls:0,transactions:0,paid:false,tx_hash:null};
if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report,null,2));
if(!report.passed)process.exitCode=1;
