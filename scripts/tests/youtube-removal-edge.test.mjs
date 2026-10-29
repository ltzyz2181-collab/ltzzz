// Real workerd regression: Node's fetch supports redirect:error, Workers does not.
import test from 'node:test';import assert from 'node:assert/strict';import path from 'node:path';
if(!process.env.MINIFLARE_MODULE)throw Error('pinned_miniflare_module_required');
const {Miniflare,createFetchMock}=await import(process.env.MINIFLARE_MODULE);
test('actual Worker runtime completes exact-video removal and Google absent readback',async()=>{
 const id='6FZYG2_TLzE',channel='UCnKqseQ7uivSc7FN38ccRUA',api=createFetchMock();api.disableNetConnect();
 const google=api.get('https://www.googleapis.com'),lookup='/youtube/v3/videos?part=snippet,status&id='+id;
 google.intercept({path:lookup,method:'GET'}).reply(200,{items:[{id,snippet:{channelId:channel}}]});
 google.intercept({path:'/youtube/v3/videos?id='+id,method:'DELETE'}).reply(204,'');
 google.intercept({path:lookup,method:'GET'}).reply(200,{items:[]});
 const mf=new Miniflare({modules:true,scriptPath:path.resolve('youtube-upload-worker.js'),modulesRules:[{type:'ESModule',include:['**/*.mjs']}],kvNamespaces:['KV'],bindings:{LTZZZ_AGENT_TOKEN:'synthetic-agent',GOOGLE_CLIENT_ID:'synthetic-client',GOOGLE_CLIENT_SECRET:'synthetic-secret'},fetchMock:api});
 try{
  const kv=await mf.getKVNamespace('KV');await kv.put('yt:default',JSON.stringify({access_token:'synthetic-google',channel_id:channel,connected_at:new Date().toISOString(),expires_in:3600}));
  const r=await mf.dispatchFetch('https://worker.invalid/youtube/delete',{method:'POST',headers:{Authorization:'Bearer synthetic-agent','Content-Type':'application/json'},body:JSON.stringify({video_id:id,expected_channel_id:channel,operation_id:'YOUTUBE-AUTOMATION-20261013-REMOVE-'+id})});
  const result=await r.json();assert.equal(r.status,200,JSON.stringify(result));assert.equal(result.deleted,true);assert.equal(result.absence_verified,true);assert.equal(result.delete_http_status,204);
 }finally{await mf.dispose();}
});
