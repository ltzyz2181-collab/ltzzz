// Claude A0 re-review probe (synthetic data, throwaway in-memory Ed25519 keys, no network/secrets).
// Usage: node claude-a0-probe-rereview.mjs <checkout-root-of-PR-221-head-9d6c2685>
import fs from 'node:fs';
import {generateKeyPairSync,sign} from 'node:crypto';
const R=process.argv[2]||'.'; // checkout root of PR 221 head 9d6c2685
const L=await import(R+'/scripts/lib/patchgate.mjs');
const policy0=JSON.parse(fs.readFileSync(R+'/config/patch-policy.json','utf8'));
const policy={...policy0,canary_targets:[{url:'https://canary-x.sub.workers.dev'}]};
const kp=()=>generateKeyPairSync('ed25519');const K={a:kp(),d:kp(),r:kp(),n:kp()};
const pem=k=>k.publicKey.export({type:'spki',format:'pem'});
const W={not_before:'2026-01-01T00:00:00Z',not_after:'2027-01-01T00:00:00Z',enabled:true};
const mkTrust=(ex)=>({schema_version:1,enabled:true,keys:[
 {id:'a',provider:'openai',executor:'E-AUTHOR',roles:['author','notification'],public_key_pem:pem(K.a),...W},
 {id:'d',provider:'openai',executor:ex.d,roles:['deployment','checks'],public_key_pem:pem(K.d),...W},
 {id:'r',provider:'aliyun_dashscope',executor:'E-QWEN',roles:['review'],public_key_pem:pem(K.r),...W}]});
const base='a'.repeat(40),head='b'.repeat(40),now=Date.now();
const f=(p)=>({path:p,mode:'100644',old_mode:'100644',binary:false,diff:'@@ -0,0 +1 @@\n+x\n'});
function run(label,ex,paths,{selfNotify=false}={}){
 const trust=mkTrust(ex);
 const snap={repository:'ltzyz2181-collab/ltzzz',task_id:'PATCH-TEST-0001',base_sha:base,head_sha:head,policy_sha256:L.sha256(L.canonical(policy)),trust_sha256:L.sha256(L.canonical(trust)),files:paths.map(f)};
 const sub=L.subjectFor(snap);
 const A=(k,id,pl)=>{const p={...pl,subject:sub,at_utc:new Date(now-500).toISOString()};return {key_id:id,payload:p,signature:sign(null,Buffer.from(L.canonical(p)),K[k].privateKey).toString('base64')}};
 const body=L.canonical({schema:'ltzzz.patchgate.canary.v1',source_commit:head})+'\n';
 const t=new Date(now-1000).toISOString();
 const ev={head_sha:head,base_sha:base,target_environment:'canary',expected_version_id:'v1',observation:{url:'https://canary-x.sub.workers.dev',http_status:200,redirected:false,body_base64:Buffer.from(body).toString('base64'),body_sha256:L.sha256(Buffer.from(body)),header_source_commit:head,header_version_id:'v1',started_at_utc:new Date(now-3000).toISOString(),finished_at_utc:t,http_date:t},platform:{http_status:200,service_name:'canary-x',source:'cloudflare_current_deployment_api',observed_at_utc:t,versions:[{id:'v1',percentage:100}]}};
 const atts=[A('a','a',{role:'author'}),A('d','d',{role:'checks',passed:true,checker_base_sha:base,checks_sha256:'c'.repeat(64)}),A('d','d',{role:'deployment',evidence:ev}),
  A('r','r',{role:'review',verdict:'approve',generation_verified:true,model:'m',output_sha256:'d'.repeat(64),metadata_source:'provider_response',finish_reason:'stop'})];
 if(selfNotify)atts.push(A('a','a',{role:'notification',owner_notified:true,reference:'https://github.com/ltzyz2181-collab/ltzzz/pull/1'}));
 const r=L.evaluate({policy,trust,snapshot:snap,attestations:atts,now});
 console.log(label.padEnd(58),'risk',r.risk_class,'passed',r.validation_passed,r.reasons.join(',')||'-');
}
run('L2 worker, deployer == author executor',{d:'E-AUTHOR'},['workers/x/index.js']);
run('L2 worker, deployer independent executor',{d:'E-DEPLOY'},['workers/x/index.js']);
run('L3 config, author self-signs owner notification',{d:'E-DEPLOY'},['config/foo.json'],{selfNotify:true});
