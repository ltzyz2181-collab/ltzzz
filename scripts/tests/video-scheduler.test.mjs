import test from 'node:test';import assert from 'node:assert/strict';import {webcrypto} from 'node:crypto';
import worker from '../../video-scheduler-worker.js';import uploader from '../../youtube-upload-worker.js';
globalThis.crypto??=webcrypto;
const CHANNEL='UCnKqseQ7uivSc7FN38ccRUA',ID='abcDEF12345',bytes=new Uint8Array([0,0,0,24,102,116,121,112]);
function fixture({publicNow=true,processing=false,uncertain=false,archiveFailure=false}={}){
 const objects=new Map();let uploadCalls=0,verifyCalls=0,remoteId=null,failArchive=archiveFailure;
 const VIDEOS={
  async get(key){if(!objects.has(key))return null;const data=objects.get(key);return {body:data,arrayBuffer:async()=>data.slice().buffer,json:async()=>JSON.parse(new TextDecoder().decode(data))};},
  async put(key,value,options={}){if(failArchive&&key.startsWith('published/')){failArchive=false;throw Error('archive failure')};const data=new Uint8Array(await new Response(value).arrayBuffer());if(options.onlyIf&&objects.has(key))return null;objects.set(key,data);return {key};},
  async head(key){return objects.has(key)?{size:objects.get(key).byteLength}:null;},
  async delete(key){objects.delete(key);},async list({prefix}){return {objects:[...objects.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key})),truncated:false};}
 };
 const YOUTUBE_UPLOADER={async fetch(request){assert.equal(request.headers.get('Authorization'),'Bearer fixture');const u=new URL(request.url);
  if(u.pathname==='/youtube/upload'){uploadCalls++;assert.match(request.headers.get('Idempotency-Key'),/^queue-[a-f0-9]{64}$/);assert.equal((await request.formData()).get('privacyStatus'),'public');remoteId=ID;if(uncertain)throw Error('response lost');return Response.json({ok:true,video_id:ID,privacyStatus:publicNow?'public':'private'});}
  if(u.pathname==='/youtube/publication')return Response.json({ok:true,receipt:remoteId?{video_id:remoteId}:null});
  if(u.pathname==='/youtube/update-status')return Response.json({ok:false,http:403});
  if(u.pathname==='/youtube/verify'){verifyCalls++;return Response.json({ok:true,channel_id:CHANNEL,video_id:ID,privacyStatus:publicNow?'public':'private',uploadStatus:processing&&verifyCalls===1?'uploaded':'processed',published:publicNow&&(!processing||verifyCalls>1)});}
  throw Error('unexpected upload route');
 }};
 return {env:{LTZZZ_AGENT_TOKEN:'fixture',VIDEOS,YOUTUBE_UPLOADER},objects,get uploads(){return uploadCalls;}};
}
async function call(f,path,body){const r=await worker.fetch(new Request('https://scheduler'+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer fixture',...(body&&!(body instanceof FormData)?{'Content-Type':'application/json'}:{})},body:body instanceof FormData?body:body?JSON.stringify(body):undefined}),f.env);return {http:r.status,...await r.json()};}
async function queue(f,name='demo'){const form=new FormData();form.set('video',new Blob([bytes],{type:'video/mp4'}),'demo.mp4');form.set('meta',JSON.stringify({title:'owner-approved demo',description:'evidence, no cash claims'}));return call(f,'/queue/upload/'+name,form);}
const receipt=f=>[...f.objects].filter(([k])=>k.startsWith('receipts/')).map(([,v])=>JSON.parse(new TextDecoder().decode(v)))[0];
test('queue writes and run require the existing identity; a missing configured secret fails closed',async()=>{for(const path of ['/queue/upload/demo','/queue/run','/status']){const r=await worker.fetch(new Request('https://scheduler'+path,{method:'POST',body:'{}'}),{});assert.equal(r.status,401);}});
test('authenticated enqueue writes the complete video before the metadata pointer',async()=>{const f=fixture(),r=await queue(f);assert.equal(r.status,'queued');assert.match(r.video_sha256,/^[a-f0-9]{64}$/);assert.deepEqual([...f.objects.keys()],['queue/demo.mp4','queue/demo.meta.json']);assert.equal(f.uploads,0);});
test('queue discovery is authenticated, verifies real bytes and performs no upload or writes',async()=>{
 const f=fixture();await queue(f);const before=[...f.objects.keys()];
 const denied=await worker.fetch(new Request('https://scheduler/queue/list'),f.env);assert.equal(denied.status,401);
 const listed=await call(f,'/queue/list');assert.equal(listed.read_only,true);assert.equal(listed.items.length,1);assert.equal(listed.items[0].new_upload_candidate,true);assert.equal(listed.items[0].metadata_candidate,true);assert.equal(listed.items[0].full_content_verified,false);assert.equal(f.uploads,0);assert.deepEqual([...f.objects.keys()],before);
 f.objects.set('queue/demo.mp4',new Uint8Array([1,2,3]));const corrupt=await call(f,'/queue/list');assert.equal(corrupt.items[0].metadata_candidate,false);assert.equal(corrupt.items[0].new_upload_candidate,false);assert.equal(f.uploads,0);
});
test('an existing queue name cannot be replaced with different video content',async()=>{const f=fixture();await queue(f);const form=new FormData();form.set('video',new Blob(['different']),'demo.mp4');form.set('meta',JSON.stringify({title:'changed',description:''}));assert.equal((await call(f,'/queue/upload/demo',form)).http,409);});
test('a video ID and private upload are not a public success; queue is retained',async()=>{const f=fixture({publicNow:false});await queue(f);const r=await call(f,'/queue/run',{name:'demo'});assert.equal(r.ok,false);assert.equal(r.results[0].status,'not_public');assert.equal(receipt(f).published,false);assert.ok(f.objects.has('queue/demo.mp4'));assert.equal(f.uploads,1);});
test('only verified public processed video removes media and retains publication proof',async()=>{const f=fixture();await queue(f);const r=await call(f,'/queue/run',{name:'demo'});assert.equal(r.ok,true);assert.equal(r.results[0].status,'published');assert.equal(receipt(f).verification.channel_id,CHANNEL);assert.ok(!f.objects.has('published/demo.mp4'));assert.ok(f.objects.has('published/demo.meta.json'));assert.ok(!f.objects.has('queue/demo.mp4'));assert.ok(!f.objects.has('queue/demo.meta.json'));});
test('processing video resumes verification without buying another upload',async()=>{const f=fixture({processing:true});await queue(f);assert.equal((await call(f,'/queue/run',{name:'demo'})).results[0].status,'processing');assert.equal((await call(f,'/queue/run',{name:'demo'})).results[0].status,'published');assert.equal(f.uploads,1);});
test('same content cannot be enqueued again after confirmed publication',async()=>{const f=fixture();await queue(f);await call(f,'/queue/run',{name:'demo'});assert.equal((await queue(f,'another-name')).status,'already_public');assert.equal(f.uploads,1);assert.ok(!f.objects.has('queue/another-name.mp4'));});
test('concurrent executions claim content once',async()=>{const f=fixture();await queue(f);await Promise.all([call(f,'/queue/run',{name:'demo'}),call(f,'/queue/run',{name:'demo'})]);assert.equal(f.uploads,1);});
test('lost response reconciles the upstream receipt without another upload',async()=>{const f=fixture({uncertain:true});await queue(f);assert.equal((await call(f,'/queue/run',{name:'demo'})).results[0].status,'upload_uncertain');assert.equal((await call(f,'/queue/run',{name:'demo'})).results[0].status,'published');assert.equal(f.uploads,1);});
test('archive failure cannot erase confirmation or cause another upload',async()=>{const f=fixture({archiveFailure:true});await queue(f);await call(f,'/queue/run',{name:'demo'});assert.equal(receipt(f).state,'published');assert.equal((await call(f,'/queue/run',{name:'demo'})).results[0].status,'published');assert.equal(f.uploads,1);});
test('cron uses private service binding and handles at most one new video',async()=>{const f=fixture();await queue(f);await queue(f,'second');await worker.scheduled({},f.env,{});assert.equal(f.uploads,1);});
test('upstream receipt endpoint is authenticated and whitelists metadata without tokens',async()=>{const env={LTZZZ_AGENT_TOKEN:'fixture',KV:{get:async()=>({video_id:ID,access_token:'must-not-leak',refresh_token:'must-not-leak'})}};assert.equal((await uploader.fetch(new Request('https://upload/youtube/publication?key=queue-fixture'),env)).status,401);const r=await uploader.fetch(new Request('https://upload/youtube/publication?key=queue-fixture',{headers:{Authorization:'Bearer fixture'}}),env);const data=await r.json();assert.equal(data.receipt.video_id,ID);assert.equal(JSON.stringify(data).includes('must-not-leak'),false);});
test('uploader reports provider privacy and pending verification instead of declaring publication',async()=>{const original=globalThis.fetch,saved=new Map([['yt:default',{access_token:'fixture',channel_id:CHANNEL,connected_at:new Date().toISOString(),expires_in:3600}]]);let count=0;
 globalThis.fetch=async()=>++count===1?new Response(null,{headers:{location:'https://upload-session'}}):Response.json({id:ID,status:{privacyStatus:'private'}});
 try{const form=new FormData();form.set('video',new Blob([bytes]),'demo.mp4');form.set('privacyStatus','public');const r=await uploader.fetch(new Request('https://u/youtube/upload',{method:'POST',headers:{Authorization:'Bearer fixture','Idempotency-Key':'fixture-key'},body:form}),{LTZZZ_AGENT_TOKEN:'fixture',GOOGLE_CLIENT_ID:'fixture',GOOGLE_CLIENT_SECRET:'fixture',KV:{get:async k=>saved.get(k),put:async(k,v)=>saved.set(k,JSON.parse(v))}});const data=await r.json();assert.equal(data.privacyStatus,'private');assert.equal(data.published,false);assert.equal(saved.get('yt:default').publish_status,'uploaded_pending_verification');}finally{globalThis.fetch=original;}
});
test('a held original source cannot be uploaded by the normal queue cron',async()=>{const f=fixture();await queue(f);const h=await crypto.subtle.digest('SHA-256',bytes),hash=Buffer.from(h).toString('hex');f.objects.set('receipts/youtube/'+hash+'.json',new TextEncoder().encode(JSON.stringify({state:'source_normalized_not_for_publication',normalized_sha256:'b'.repeat(64)})));const r=await call(f,'/queue/run',{name:'demo'});assert.equal(r.results[0].status,'original_preserved_normalized_replacement_queued');assert.equal(f.uploads,0);assert.ok(f.objects.has('queue/demo.mp4'));});

test('historical cleanup requires authentication and exact published-byte proof; current availability is recorded separately',async()=>{
 const f=fixture();await queue(f);await call(f,'/queue/run',{name:'demo'});f.objects.set('published/demo.mp4',bytes);
 assert.equal((await worker.fetch(new Request('https://scheduler/queue/prune-published',{method:'POST',body:'{}'}),f.env)).status,401);
 const old=f.env.YOUTUBE_UPLOADER,prior=f.uploads;
 f.env.YOUTUBE_UPLOADER={fetch:async()=>Response.json({ok:true,published:true,channel_id:CHANNEL,video_id:'wrongID1234',privacyStatus:'public',uploadStatus:'processed'})};
 const gone=await call(f,'/queue/prune-published',{});assert.equal(gone.results[0].status,'removed');assert.equal(gone.results[0].currently_public,false);assert.ok(!f.objects.has('published/demo.mp4'));
 f.objects.set('published/demo.mp4',bytes);
 f.env.YOUTUBE_UPLOADER=old;f.objects.set('published/demo.mp4',new Uint8Array([1,2,3]));
 assert.equal((await call(f,'/queue/prune-published',{})).results[0].status,'asset_hash_mismatch');assert.ok(f.objects.has('published/demo.mp4'));
 f.objects.set('published/demo.mp4',bytes);assert.equal((await call(f,'/queue/prune-published',{})).results[0].status,'removed');
 assert.ok(!f.objects.has('published/demo.mp4'));assert.ok(f.objects.has('published/demo.meta.json'));assert.equal(receipt(f).state,'published');assert.equal(f.uploads,prior);
 assert.equal((await call(f,'/queue/prune-published',{})).results[0].status,'already_removed');
});
test('public=true with a different ID or unprocessed status cannot remove queued media',async()=>{
 for(const patch of [{video_id:'wrongID1234'},{uploadStatus:'uploaded'}]){
  const f=fixture(),old=f.env.YOUTUBE_UPLOADER;f.env.YOUTUBE_UPLOADER={fetch:async r=>{const x=await old.fetch(r);return new URL(r.url).pathname==='/youtube/verify'?Response.json({...await x.json(),...patch}):x;}};
  await queue(f);assert.equal((await call(f,'/queue/run',{name:'demo'})).ok,false);assert.ok(f.objects.has('queue/demo.mp4'));
 }
});

test('an unverified historical receipt cannot delete an archive even when current video exists',async()=>{
 const f=fixture();await queue(f);await call(f,'/queue/run',{name:'demo'});f.objects.set('published/demo.mp4',bytes);
 const key=[...f.objects.keys()].find(k=>k.startsWith('receipts/')),r=JSON.parse(new TextDecoder().decode(f.objects.get(key)));
 r.verification.uploadStatus='uploaded';f.objects.set(key,new TextEncoder().encode(JSON.stringify(r)));
 assert.equal((await call(f,'/queue/prune-published',{})).results[0].status,'publication_proof_missing');assert.ok(f.objects.has('published/demo.mp4'));
});
