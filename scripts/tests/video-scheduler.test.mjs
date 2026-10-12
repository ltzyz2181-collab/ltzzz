import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../video-scheduler-worker.js';

test('missing configured webhook secret cannot authorize empty header', async()=>{
  const r=await worker.fetch(new Request('https://worker/schedule/publish',{method:'POST',body:'{}'}),{});
  assert.equal(r.status,401);
});
test('cron sends upload authentication and records confirmed video only', async()=>{
  const original=globalThis.fetch;const saved=new Map();let deleted=[];
  globalThis.fetch=async(url,options)=>{
    assert.equal(options.headers.Authorization,'Bearer upload-key');
    return Response.json({video_id:'confirmed'});
  };
  const env={LTZZZ_AGENT_TOKEN:'upload-key',YOUTUBE_UPLOAD_WORKER_URL:'https://upload',VIDEOS:{
    list:async()=>({objects:[{key:'queue/demo.mp4'},{key:'queue/demo.meta.json'}]}),
    get:async()=>({json:async()=>({title:'demo'}),body:'video'}),
    put:async(k,v)=>saved.set(k,v),delete:async k=>deleted.push(k)
  }};
  try{await worker.scheduled({},env,{});assert.equal(deleted.length,2);assert.ok(saved.has('published/demo.mp4'));}
  finally{globalThis.fetch=original;}
});
test('cron keeps queue when upload key is missing',async()=>{
  const original=globalThis.fetch;let calls=0,deletes=0;
  globalThis.fetch=async()=>{calls++;throw Error('must not upload');};
  const env={YOUTUBE_UPLOAD_WORKER_URL:'https://upload',VIDEOS:{list:async()=>({objects:[{key:'queue/demo.mp4'},{key:'queue/demo.meta.json'}]}),get:async()=>({json:async()=>({})}),put:async()=>{},delete:async()=>{deletes++;}}};
  try{await worker.scheduled({},env,{});assert.equal(calls,0);assert.equal(deletes,0);}finally{globalThis.fetch=original;}
});
