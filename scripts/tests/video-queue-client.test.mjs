import test from 'node:test';
import assert from 'node:assert/strict';
import {publishQueuedVideo,CHANNEL,SCHEDULER,UPLOADER} from '../lib/video-queue-client.mjs';

const video_id='abcDEF12345',bytes=Buffer.from('test video'),meta={title:'Approved video',description:'Evidence only'};
function fixture({privacy='public',uploadStatus='processed',channel=CHANNEL,cached=false,uncertain=false,unknownReceipt=false,malformed=false}={}){
 let ingress=0,runs=0;const saved=[];
 const fetchImpl=async(url,init)=>{
  const u=new URL(url);
  if(url.startsWith(SCHEDULER))assert.equal(init.headers.Authorization,'Bearer fixture');
  if(url.startsWith(UPLOADER))assert.equal(init.headers.Authorization,undefined);
  if(u.pathname==='/youtube/status')return Response.json({connected:true,channel_id:CHANNEL});
  if(u.pathname.startsWith('/queue/upload/')){ingress++;assert.ok(init.body instanceof FormData);if(malformed)return new Response('Bad Gateway',{status:502});return Response.json({ok:true,status:cached?'already_public':'queued',name:'demo',...(cached?{video_id}:{})});}
  if(u.pathname==='/queue/run'){runs++;if(uncertain)throw Error('connection_reset');return Response.json({ok:privacy==='public',results:[]});}
  if(u.pathname==='/queue/status')return Response.json({ok:true,receipt:unknownReceipt?{state:'upload_uncertain'}:(cached||runs?{state:privacy==='public'?'published':'not_public',video_id}:null)});
  if(u.pathname==='/youtube/verify')return Response.json({published:privacy==='public'&&uploadStatus==='processed',privacyStatus:privacy,uploadStatus,channel_id:channel,video_id});
  throw Error('Unexpected destination '+u.pathname);
 };
 return {args:{bytes,meta,name:'demo',token:'fixture',fetchImpl,sleep:async()=>{},polls:1,save:r=>saved.push(structuredClone(r))},saved,get ingress(){return ingress;},get runs(){return runs;}};
}
test('ready file reaches only the queue and success requires fresh Google-backed verification',async()=>{const f=fixture(),r=await publishQueuedVideo(f.args);assert.equal(r.published,true);assert.equal(r.verification.channel_id,CHANNEL);assert.equal(f.ingress,1);assert.equal(f.runs,1);assert.ok(f.saved.some(r=>r.phase==='queue_upload_started'&&!r.published));});
test('private video ID is preserved and explicitly fails publication',async()=>{const f=fixture({privacy:'private'});await assert.rejects(()=>publishQueuedVideo(f.args),/public_not_verified/);const r=f.saved.at(-1);assert.equal(r.published,false);assert.equal(r.video_id,video_id);assert.equal(r.verification.privacyStatus,'private');assert.equal(f.ingress,1);});
test('cached public receipt is checked again and never runs another upload',async()=>{const f=fixture({cached:true});assert.equal((await publishQueuedVideo(f.args)).published,true);assert.equal(f.runs,0);const changed=fixture({cached:true,privacy:'private'});await assert.rejects(()=>publishQueuedVideo(changed.args),/public_not_verified/);assert.equal(changed.runs,0);});
test('wrong channel and unprocessed video cannot pass even when provider says published',async()=>{for(const overrides of [{channel:'OTHER'},{uploadStatus:'uploaded'}]){const f=fixture(overrides);await assert.rejects(()=>publishQueuedVideo(f.args),/public_not_verified/);assert.equal(f.saved.at(-1).published,false);}});
test('unknown upload and lost processing response never cause another ingress attempt',async()=>{for(const overrides of [{unknownReceipt:true},{uncertain:true}]){const f=fixture(overrides);await assert.rejects(()=>publishQueuedVideo(f.args));assert.equal(f.ingress,1);assert.equal(f.saved.at(-1).published,false);}});
test('missing identity and mismatched artifact hash fail before any network request',async()=>{for(const overrides of [{token:''},{meta:{...meta,video_sha256:'bad'}}]){let requests=0;const f=fixture();await assert.rejects(()=>publishQueuedVideo({...f.args,...overrides,fetchImpl:async()=>{requests++;throw Error('must not call');}}));assert.equal(requests,0);}});
test('HTML proxy error is recorded without treating it as an upload success',async()=>{const f=fixture({malformed:true});await assert.rejects(()=>publishQueuedVideo(f.args),/non_json_http_502/);assert.equal(f.saved.at(-1).error,'non_json_http_502');assert.equal(f.saved.at(-1).published,false);});
