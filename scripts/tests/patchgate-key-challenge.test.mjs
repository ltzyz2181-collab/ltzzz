import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import {createChallengeWorker} from '../../patchgate-key-challenge-worker.js';
import {challengeAudience} from '../../patchgate-oidc.mjs';
import {verifyChallenge,provision} from '../provision-patchgate-challenge-keys.mjs';
import {fixtureJwt,fixtureJwksFetch,fixtureEnv} from './fixtures/patchgate-oidc-fixture.mjs';
const worker=createChallengeWorker({fetchImpl:fixtureJwksFetch}),pair=generateKeyPairSync('ed25519');
const env={EXECUTOR_ID:'a2-qwen-challenge-executor',PROVIDER_BINDING:'aliyun_dashscope',SOURCE_SHA256:'a'.repeat(64),DEPLOYMENT_MARKER:'d'.repeat(64),PUBLIC_KEY_SPKI:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),SIGNING_PKCS8:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')};
const target={id:env.EXECUTOR_ID,provider:env.PROVIDER_BINDING},requester={run_id:fixtureEnv.GITHUB_RUN_ID,run_attempt:1,source_commit:fixtureEnv.GITHUB_SHA,workflow_ref:fixtureEnv.GITHUB_WORKFLOW_REF};
const req=(path,body,auth=fixtureJwt(challengeAudience(env.EXECUTOR_ID)))=>new Request('https://isolated-key/'+path,{method:body?'POST':'GET',headers:auth?{Authorization:'Bearer '+auth,'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
test('public identity is credential-free, no auth secret needed, no A2 role admission',async()=>{const r=await worker.fetch(req('identity'),env),s=await r.text();assert.equal(r.status,200);assert.ok(!s.includes(env.SIGNING_PKCS8));assert.equal(JSON.parse(s).key_configured,true);assert.equal(JSON.parse(s).authentication,'github_actions_oidc');assert.equal(JSON.parse(s).A2_admission,false);});
test('missing stale wrong-provider and static legacy tokens cannot request challenges',async()=>{for(const a of [null,'old-shared-token',fixtureJwt(challengeAudience('a2-doubao-challenge-executor')),fixtureJwt(challengeAudience(env.EXECUTOR_ID),{exp:1})])assert.equal((await worker.fetch(req('challenge',{nonce:'a'.repeat(64)},a),env)).status,401);});
test('nonce-only challenge refuses arbitrary signing roles or unconfigured keys',async()=>{for(const b of [{nonce:'bad'},{nonce:'a'.repeat(64),role:'review'}])assert.equal((await worker.fetch(req('challenge',b),env)).status,400);assert.equal((await worker.fetch(req('attest',{}),env)).status,404);assert.equal((await worker.fetch(req('challenge',{nonce:'a'.repeat(64)}),{...env,SIGNING_PKCS8:''})).status,503);});
test('signed challenge binds nonce, key, provider, deployment and OIDC requester',async()=>{const nonce=randomBytes(32).toString('hex'),data=await(await worker.fetch(req('challenge',{nonce}),env)).json(),args={data,nonce,target,publicKey:pair.publicKey,sourceHash:env.SOURCE_SHA256,deploymentMarker:env.DEPLOYMENT_MARKER,requester};assert.equal(verifyChallenge(args),true);for(const p of [{nonce:'0'.repeat(64)},{deploymentMarker:'0'.repeat(64)},{requester:{...requester,run_id:'1'}},{target:{...target,provider:'volcengine_ark'}},{publicKey:generateKeyPairSync('ed25519').publicKey}])assert.throws(()=>verifyChallenge({...args,...p}));});
function transport({stale=false,failSubdomain=false}={}){
 const states=new Map(),old=new Map(),uploads=new Map();let writes=0,once=failSubdomain;
 const fake=async(input,o={})=>{const u=new URL(input);
  if(u.hostname==='oidc.actions.githubusercontent.com')return Response.json({value:fixtureJwt(u.searchParams.get('audience'))});
  if(u.hostname==='api.cloudflare.com'){
   assert.equal(o.headers.Authorization,'Bearer '+fixtureEnv.CLOUDFLARE_API_TOKEN);
   if(u.pathname.endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain:'fixture'}});
   if(u.pathname.endsWith('/workers/scripts'))return Response.json({success:true,result:[...states.keys()].map(id=>({id}))});
   const m=/\/workers\/scripts\/([^/]+)(.*)$/.exec(u.pathname);assert.ok(m);const[,name,suffix]=m;
   if(!suffix){const metadata=JSON.parse(o.body.get('metadata'));assert.deepEqual(metadata.keep_bindings,['secret_text']);assert.ok(o.body.get('patchgate-oidc.mjs'));const s=states.get(name)||{};if(s.SIGNING_PKCS8)old.set(name,{...s});for(const b of metadata.bindings)s[b.name]=b.text;states.set(name,s);uploads.set(name,(uploads.get(name)||0)+1);return Response.json({success:true,result:{id:name}});}
   if(suffix==='/secrets'&&o.method==='PUT'){writes++;const b=JSON.parse(o.body);assert.equal(b.name,'SIGNING_PKCS8');states.get(name)[b.name]=b.text;return Response.json({success:true,result:{name:b.name}});}
   if(suffix==='/settings')return Response.json({success:true,result:{bindings:Object.entries(states.get(name)).map(([name,text])=>name==='SIGNING_PKCS8'?{name,type:'secret_text'}:{name,type:'plain_text',text})}});
   if(suffix==='/subdomain'){if(once){once=false;return Response.json({success:false},{status:503});}return Response.json({success:true,result:{enabled:true}});}
   throw Error('unexpected_provider_route');
  }
  assert.ok(u.hostname.endsWith('.fixture.workers.dev'));const name=u.hostname.split('.')[0],s=stale&&uploads.get(name)>=3?old.get(name):states.get(name);return worker.fetch(new Request(input,o),s);
 };return {fake,states,secretWrites:()=>writes};
}
async function run(t){const log=console.log;console.log=()=>{};try{return await provision({env:fixtureEnv,fetchImpl:t.fake,pause:async()=>{}});}finally{console.log=log;fs.rmSync('knowledge/results/patchgate/key-enrollment/'+fixtureEnv.GITHUB_RUN_ID+'.json',{force:true});}}
test('new and restarted enrollment authenticate by renewable OIDC without key rotation or auth exports',async()=>{const t=transport(),r=await run(t);assert.equal(r.status,'two_persistent_keys_verified_not_admitted');assert.equal(t.secretWrites(),2);const keys=[...t.states.values()].map(s=>s.SIGNING_PKCS8),s=JSON.stringify(r);for(const key of keys)assert.ok(!s.includes(key));assert.ok(!s.includes(fixtureEnv.CLOUDFLARE_API_TOKEN));assert.ok(!s.includes(fixtureEnv.ACTIONS_ID_TOKEN_REQUEST_TOKEN));assert.ok([...t.states.values()].every(s=>!s.CHALLENGE_AUTH));const second=await run(t);assert.equal(second.status,r.status);assert.equal(t.secretWrites(),2);assert.deepEqual([...t.states.values()].map(s=>s.SIGNING_PKCS8),keys);assert.ok(second.workers.every(w=>w.reused_existing_key));});
test('accepted upload with stale serving edge cannot claim deployment persistence',async()=>{const r=await run(transport({stale:true}));assert.equal(r.status,'blocked_or_partial_enrollment');assert.ok(r.workers.every(w=>!w.persistence_verified));});
test('partial subdomain provisioning recovers through provider settings without rotating key',async()=>{const t=transport({failSubdomain:true});assert.equal((await run(t)).status,'blocked_or_partial_enrollment');const keys=[...t.states.values()].map(s=>s.SIGNING_PKCS8);assert.equal((await run(t)).status,'two_persistent_keys_verified_not_admitted');assert.equal(t.secretWrites(),2);assert.deepEqual([...t.states.values()].map(s=>s.SIGNING_PKCS8),keys);});
test('existing worker with missing private key remains blocked instead of overwriting',async()=>{const t=transport();await run(t);delete [...t.states.values()][0].SIGNING_PKCS8;const r=await run(t);assert.equal(r.workers[0].error,'existing_executor_missing_key_or_binding_no_rotation');assert.equal(t.secretWrites(),2);});
