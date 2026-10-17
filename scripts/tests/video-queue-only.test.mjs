import test from 'node:test';
import assert from 'node:assert/strict';
import {queueOnlyVideo,sha256,validateVideoInput} from '../lib/video-queue-only.mjs';
import worker from '../../video-scheduler-worker.js';
import {SCHEDULER} from '../lib/video-queue-client.mjs';
const bytes=Buffer.from('approved local video'),meta={title:'No Self-Review',description:'Real project evidence',generation_method:'seedance-2-fast'},name='2026-10-17-no-self-review';
function fixture({lost=false,corrupt=false,existing=false,conflict=false,publication=false}={}){
 const objects=new Map();let writes=0,uploads=0,failOnce=lost;const saved=[];
 const VIDEOS={async get(key){const data=objects.get(key);return data?{arrayBuffer:async()=>new Uint8Array(data).buffer,json:async()=>JSON.parse(new TextDecoder().decode(data))}:null;},async put(key,value){writes++;const data=new Uint8Array(await new Response(value).arrayBuffer());objects.set(key,data);return {key};}};
 const seed=(data=bytes)=>{objects.set(`queue/${name}.mp4`,data);objects.set(`queue/${name}.meta.json`,Buffer.from(JSON.stringify({...meta,video_sha256:sha256(data),bytes:data.length,publication_policy:'public_ready'})));};
 if(existing||conflict)seed(conflict?Buffer.from('different'):bytes);
 if(publication)objects.set('receipts/youtube/'+sha256(bytes)+'.json',Buffer.from(JSON.stringify({state:'upload_uncertain',name})));
 const fetchImpl=async(url,init)=>{
  assert.ok(url.startsWith(SCHEDULER+'/'));assert.equal(init.redirect,'error');assert.equal(init.headers.Authorization,'Bearer fixture');
  if(init.method==='POST')uploads++;
  const response=await worker.fetch(new Request(url,init),{LTZZZ_AGENT_TOKEN:'fixture',VIDEOS});
  if(init.method==='POST'&&failOnce){failOnce=false;throw Error('lost response with secret not to print');}
  if(corrupt&&uploads&&new URL(url).pathname==='/queue/item')return Response.json({...(await response.json()),video_sha256:'0'.repeat(64)});
  return response;
 };
 return {args:{bytes,meta,name,token:'fixture',fetchImpl,save:r=>saved.push(r)},objects,saved,get writes(){return writes;},get uploads(){return uploads;}};
}
test('Seedance metadata uploads through Worker binding, reads exact bytes back, and never publishes',async()=>{const f=fixture(),r=await queueOnlyVideo(f.args);assert.equal(r.queue_readback_verified,true);assert.equal(r.uploaded_to_queue,true);assert.equal(r.published,false);assert.equal(r.model_calls,0);assert.equal(f.uploads,1);assert.equal(f.writes,2);assert.ok(f.saved.some(r=>r.phase==='queue_upload_started'&&!r.uploaded_to_queue));});
test('same local file reconciles an existing queue without writing again',async()=>{const f=fixture({existing:true});assert.equal((await queueOnlyVideo(f.args)).uploaded_to_queue,true);assert.equal(f.uploads,0);assert.equal(f.writes,0);});
test('lost upload response remains unconfirmed, next invocation reads back without another POST',async()=>{const f=fixture({lost:true});await assert.rejects(()=>queueOnlyVideo(f.args),/transport_uncertain/);assert.equal(f.saved.at(-1).uploaded_to_queue,false);assert.equal(f.saved.at(-1).error.includes('secret'),false);assert.equal((await queueOnlyVideo(f.args)).queue_readback_verified,true);assert.equal(f.uploads,1);});
test('different bytes under an occupied name fail without replacement or a second name',async()=>{const f=fixture({conflict:true});await assert.rejects(()=>queueOnlyVideo(f.args),/name_conflict/);assert.equal(f.uploads,0);assert.equal(f.writes,0);});
test('readback corruption fails acceptance even after HTTP upload success',async()=>{const f=fixture({corrupt:true});await assert.rejects(()=>queueOnlyVideo(f.args),/readback_mismatch/);assert.equal(f.saved.at(-1).uploaded_to_queue,false);});
test('known uncertain publication is never reuploaded',async()=>{const f=fixture({publication:true});await assert.rejects(()=>queueOnlyVideo(f.args),/reconcile_without_reupload/);assert.equal(f.uploads,0);assert.equal(f.writes,0);});
test('missing token, CF token, bad hash and invalid name all fail before network',async()=>{for(const change of [{token:''},{token:'cfut_fake_not_queue_identity'},{name:'../bad'},{meta:{...meta,video_sha256:'bad'}}]){let calls=0;await assert.rejects(()=>queueOnlyVideo({...fixture().args,...change,fetchImpl:async()=>{calls++;}}));assert.equal(calls,0);}});
test('metadata forwards only the documented fields',()=>{const clean=validateVideoInput({bytes,meta:{...meta,access_token:'do not forward',private_key:'do not forward'},name});assert.equal('access_token' in clean,false);assert.equal('private_key' in clean,false);assert.equal(clean.generation_method,'seedance-2-fast');});
test('queue item requires auth and accurately reports a missing file',async()=>{const f=fixture();const anon=await worker.fetch(new Request(SCHEDULER+'/queue/item?name='+name),{});assert.equal(anon.status,401);const result=await f.args.fetchImpl(SCHEDULER+'/queue/item?name='+name,{headers:{Authorization:'Bearer fixture'},redirect:'error'});assert.deepEqual(await result.json(),{ok:true,name,queued:false,video_exists:false,metadata_exists:false});});

function cronFixture({uncertain=false,old=false}={}){
 const objects=new Map();let uploads=0;
 const add=(name,data)=>{const hash=sha256(data);objects.set(`queue/${name}.mp4`,Buffer.from(data));objects.set(`queue/${name}.meta.json`,Buffer.from(JSON.stringify({title:name,description:'Evidence only',video_sha256:hash,bytes:Buffer.byteLength(data),publication_policy:'public_ready'})));return hash;};
 if(old){const hash=add('old','old video');objects.set(`receipts/youtube/${hash}.json`,Buffer.from(JSON.stringify({name:'old',state:'processing',video_sha256:hash,video_id:'oldVIDEO123',published:false})));}
 add('fresh','new video');add('another','another video');
 const VIDEOS={async get(k){const b=objects.get(k);return b?{arrayBuffer:async()=>new Uint8Array(b).buffer,body:b,json:async()=>JSON.parse(b.toString())}:null;},async put(k,v,o={}){if(o.onlyIf&&objects.has(k))return null;objects.set(k,Buffer.from(await new Response(v).arrayBuffer()));return {key:k};},async delete(k){objects.delete(k);},async list(){return {objects:[...objects.keys()].filter(k=>k.startsWith('queue/')).map(key=>({key})),truncated:false};}};
 const YOUTUBE_UPLOADER={async fetch(request){const u=new URL(request.url);if(u.pathname==='/youtube/upload'){uploads++;if(uncertain)throw Error('lost upload reply');return Response.json({ok:true,video_id:'newVIDEO123'});}if(u.pathname==='/youtube/verify')return Response.json({ok:true,published:true,channel_id:'UCnKqseQ7uivSc7FN38ccRUA',privacyStatus:'public',uploadStatus:'processed'});throw Error('unexpected upstream path');}};
 return {env:{VIDEOS,YOUTUBE_UPLOADER,LTZZZ_AGENT_TOKEN:'fixture'},objects,get uploads(){return uploads;}};
}
test('cron reconciles old processing receipt then allows exactly one fresh upload',async()=>{const f=cronFixture({old:true}),r=await worker.scheduled({},f.env,{});assert.equal(f.uploads,1);assert.equal(r.new_upload_attempts,1);assert.deepEqual(r.results.map(x=>x.name),['old','fresh']);assert.ok(f.objects.has('published/old.meta.json'));assert.ok(f.objects.has('queue/another.mp4'));});
test('uncertain first upload consumes the slot and cannot trigger a second fresh upload',async()=>{const f=cronFixture({uncertain:true}),r=await worker.scheduled({},f.env,{});assert.equal(f.uploads,1);assert.equal(r.new_upload_attempts,1);assert.equal(r.results[0].status,'upload_uncertain');assert.ok(f.objects.has('queue/another.mp4'));});
