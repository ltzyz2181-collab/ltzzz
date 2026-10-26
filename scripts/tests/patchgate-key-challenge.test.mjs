import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {generateKeyPairSync,randomBytes} from 'node:crypto';
import worker from '../../patchgate-key-challenge-worker.js';
import {verifyChallenge,provision} from '../provision-patchgate-challenge-keys.mjs';
const pair=generateKeyPairSync('ed25519'),secret='fixture-auth-never-in-receipt';
const env={EXECUTOR_ID:'a2-qwen-challenge-executor',PROVIDER_BINDING:'aliyun_dashscope',SOURCE_SHA256:'a'.repeat(64),PUBLIC_KEY_SPKI:pair.publicKey.export({format:'der',type:'spki'}).toString('base64'),SIGNING_PKCS8:pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64'),CHALLENGE_AUTH:secret,DEPLOYMENT_MARKER:'c'.repeat(64)};
const target={id:env.EXECUTOR_ID,provider:env.PROVIDER_BINDING};
const req=(path,body,auth=secret)=>new Request('https://isolated-key/'+path,{method:body?'POST':'GET',headers:auth?{Authorization:'Bearer '+auth,'Content-Type':'application/json'}:{},body:body?JSON.stringify(body):undefined});
test('public identity never contains private key or bearer and cannot admit any A2 role',async()=>{const r=await worker.fetch(req('identity'),env),s=await r.text();assert.equal(r.status,200);assert.ok(!s.includes(secret));assert.ok(!s.includes(env.SIGNING_PKCS8));assert.equal(JSON.parse(s).A2_admission,false);});
test('anonymous/wrong authentication cannot request a challenge',async()=>{for(const auth of [null,'wrong'])assert.equal((await worker.fetch(req('challenge',{nonce:'a'.repeat(64)},auth),env)).status,401);});
test('challenge accepts nonce only and refuses arbitrary A2 signing payloads',async()=>{for(const body of [{nonce:'bad'},{nonce:'a'.repeat(64),role:'stage_review'},{subject:{},nonce:'a'.repeat(64)}])assert.equal((await worker.fetch(req('challenge',body),env)).status,400);assert.equal((await worker.fetch(req('attest',{nonce:'a'.repeat(64)}),env)).status,404);});
test('a fresh nonce binds actual private/public correspondence and static provider',async()=>{const nonce=randomBytes(32).toString('hex'),data=await (await worker.fetch(req('challenge',{nonce}),env)).json();assert.equal(verifyChallenge({data,nonce,target,publicKey:pair.publicKey,sourceHash:env.SOURCE_SHA256,deploymentMarker:env.DEPLOYMENT_MARKER}),true);for(const p of [{nonce:'f'.repeat(64)},{target:{...target,provider:'volcengine_ark'}},{sourceHash:'b'.repeat(64)},{deploymentMarker:'d'.repeat(64)},{publicKey:generateKeyPairSync('ed25519').publicKey}])assert.throws(()=>verifyChallenge({data,nonce,target,publicKey:pair.publicKey,sourceHash:env.SOURCE_SHA256,deploymentMarker:env.DEPLOYMENT_MARKER,...p}));});
test('opposite provider assignment and missing key fail closed',async()=>{assert.equal((await worker.fetch(req('identity'),{...env,PROVIDER_BINDING:'volcengine_ark'})).status,503);assert.equal((await worker.fetch(req('challenge',{nonce:'a'.repeat(64)}),{...env,SIGNING_PKCS8:''})).status,503);});
test('provision keeps keys in provider Secrets and verifies persistence across deployment without admission',async()=>{
  const states=new Map(),markers=new Map();let uploads=0,secretWrites=0;const forbiddenSharedAuth='fixture-shared-token-must-not-be-used',token='fixture-cloudflare-credential';
  const fake=async(input,options={})=>{
    const u=new URL(input);
    if(u.hostname==='api.cloudflare.com'){
      assert.equal(options.headers.Authorization,'Bearer '+token);
      if(u.pathname.endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain:'fixture'}});
      if(u.pathname.endsWith('/workers/scripts'))return Response.json({success:true,result:[...states.keys()].map(id=>({id}))});
      const m=/\/workers\/scripts\/([^/]+)(.*)$/.exec(u.pathname);assert.ok(m);const [_,name,suffix]=m;
      if(!suffix){uploads++;const metadata=JSON.parse(options.body.get('metadata'));assert.deepEqual(metadata.keep_bindings,['secret_text']);const s=states.get(name)||{};for(const b of metadata.bindings)s[b.name]=b.text;states.set(name,s);markers.set(name,[...(markers.get(name)||[]),s.DEPLOYMENT_MARKER]);return Response.json({success:true,result:{id:name}});}
      if(suffix==='/secrets'){secretWrites++;const b=JSON.parse(options.body);assert.equal(b.type,'secret_text');states.get(name)[b.name]=b.text;return Response.json({success:true,result:{name:b.name,type:b.type}});}
      if(suffix==='/subdomain')return Response.json({success:true,result:{enabled:true}});
      throw Error('unexpected_cloudflare_route');
    }
    assert.ok(u.hostname.endsWith('.fixture.workers.dev'));return worker.fetch(new Request(input,options),states.get(u.hostname.split('.')[0]));
  };
  const log=console.log;console.log=()=>{};
  try{
    const report=await provision({env:{CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_API_TOKEN:token,LTZZZ_AGENT_TOKEN:forbiddenSharedAuth,GITHUB_RUN_ID:'fixture-test'},fetchImpl:fake});
    assert.equal(report.status,'two_persistent_keys_verified_not_admitted');assert.equal(uploads,4);assert.equal(secretWrites,4);
    assert.equal([...markers.values()].every(a=>a.length===2&&a[0]!==a[1]&&a.every(x=>/^[a-f0-9]{64}$/.test(x))),true);
    assert.equal(report.workers.every(w=>w.persistence_verified&&w.signing_roles_enabled===false),true);
    const text=JSON.stringify(report);assert.ok(!text.includes(forbiddenSharedAuth));assert.ok(!text.includes(token));
    const saved=[...states.values()];assert.equal(new Set(saved.map(s=>s.CHALLENGE_AUTH)).size,2);
    for(const s of saved){assert.match(s.CHALLENGE_AUTH,/^[A-Za-z0-9_-]{43}$/);assert.notEqual(s.CHALLENGE_AUTH,forbiddenSharedAuth);assert.ok(!text.includes(s.SIGNING_PKCS8));assert.ok(!text.includes(s.CHALLENGE_AUTH));}
    assert.equal((await worker.fetch(req('challenge',{nonce:'a'.repeat(64)},saved[0].CHALLENGE_AUTH),saved[1])).status,401);
    const before=JSON.stringify(saved),second=await provision({env:{CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_API_TOKEN:token,GITHUB_RUN_ID:'fixture-test'},fetchImpl:fake});
    assert.equal(second.status,'blocked_or_partial_enrollment');assert.ok(second.workers.every(w=>w.error==='existing_executor_auth_not_exported_no_rotation'));
    assert.equal(uploads,4);assert.equal(secretWrites,4);assert.equal(JSON.stringify([...states.values()]),before);
  }finally{console.log=log;fs.rmSync('knowledge/results/patchgate/key-enrollment/fixture-test.json',{force:true});}
});

// A successful upload is not proof the serving edge has switched versions.
// The old instance still has the same public key, provider, source hash and
// Secrets, but must never satisfy a fresh deployment-marker challenge.
test('stale edge cannot claim persistent keys for a deployment not serving yet',async()=>{
  const states=new Map(),uploadCounts=new Map();
  const fake=async(input,options={})=>{
    const u=new URL(input);
    if(u.hostname==='api.cloudflare.com'){
      if(u.pathname.endsWith('/workers/subdomain'))return Response.json({success:true,result:{subdomain:'fixture'}});
      if(u.pathname.endsWith('/workers/scripts'))return Response.json({success:true,result:[...states.keys()].map(id=>({id}))});
      const m=/\\/workers\\/scripts\\/([^/]+)(.*)$/.exec(u.pathname);assert.ok(m);
      const [,name,suffix]=m;
      if(!suffix){
        const count=(uploadCounts.get(name)||0)+1;uploadCounts.set(name,count);
        const metadata=JSON.parse(options.body.get('metadata'));
        if(count===1){const state={};for(const b of metadata.bindings)state[b.name]=b.text;states.set(name,state);}
        // The second PUT succeeds, but requests still reach the old instance.
        return Response.json({success:true,result:{id:name}});
      }
      if(suffix==='/secrets'){const b=JSON.parse(options.body);states.get(name)[b.name]=b.text;return Response.json({success:true,result:{name:b.name}});}
      if(suffix==='/subdomain')return Response.json({success:true,result:{enabled:true}});
      throw Error('unexpected_cloudflare_route');
    }
    return worker.fetch(new Request(input,options),states.get(u.hostname.split('.')[0]));
  };
  const oldLog=console.log;console.log=()=>{};
  try{
    const report=await provision({env:{CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_API_TOKEN:'fixture',GITHUB_RUN_ID:'fixture-stale'},fetchImpl:fake,sleepImpl:async()=>{}});
    assert.equal(report.status,'blocked_or_partial_enrollment');
    assert.equal(uploadCounts.size,2);
    assert.equal([...uploadCounts.values()].every(n=>n===2),true);
    assert.equal(report.workers.every(w=>w.persistence_verified!==true&&w.error==='bound_challenge_required'),true);
  }finally{console.log=oldLog;fs.rmSync('knowledge/results/patchgate/key-enrollment/fixture-stale.json',{force:true});}
});
