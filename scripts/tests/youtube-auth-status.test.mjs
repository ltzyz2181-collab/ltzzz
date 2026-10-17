import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../../youtube-upload-worker.js';

const secret='fixture-must-not-appear';
const expired={access_token:secret,refresh_token:secret,connected_at:'2020-01-01T00:00:00Z',expires_in:3600,
 channel_id:'UCnKqseQ7uivSc7FN38ccRUA',channel_name:'LTZZZ',last_video:{video_id:'xO8jmKy_120'}};
async function status(record,response){
 const original=globalThis.fetch;let calls=0,writes=0;
 globalThis.fetch=async()=>{calls++;return Response.json(response.body,{status:response.status});};
 try{
  const env={GOOGLE_CLIENT_ID:'fixture-client',GOOGLE_CLIENT_SECRET:secret,KV:{get:async()=>structuredClone(record),put:async()=>{writes++;}}};
  const r=await worker.fetch(new Request('https://upload/youtube/status'),env);
  const data=await r.json();assert.equal(JSON.stringify(data).includes(secret),false);
  return {data,calls,writes};
 }finally{globalThis.fetch=original;}
}
test('valid access token remains connected without a refresh request',async()=>{
 const result=await status({...expired,connected_at:new Date().toISOString()});
 assert.equal(result.data.connected,true);assert.equal(result.data.reauth_required,false);assert.equal(result.calls,0);
});
test('invalid grant reports reauthentication instead of a false connected status',async()=>{
 const result=await status(expired,{status:400,body:{error:'invalid_grant',error_description:secret}});
 assert.equal(result.data.connected,false);assert.equal(result.data.reauth_required,true);
 assert.equal(result.data.auth_error,'GOOGLE_OAUTH_INVALID_GRANT');assert.equal(result.data.last_video.video_id,'xO8jmKy_120');assert.equal(result.writes,0);
});
test('invalid client is a configuration failure and does not invite endless reauthentication',async()=>{
 const result=await status(expired,{status:400,body:{error:'invalid_client',error_description:secret}});
 assert.equal(result.data.connected,false);assert.equal(result.data.configuration_required,true);assert.equal(result.data.reauth_required,false);
});
test('an expired access token without refresh credentials is not treated as connected',async()=>{
 const result=await status({...expired,refresh_token:null});
 assert.equal(result.data.connected,false);assert.equal(result.data.reauth_required,true);assert.equal(result.calls,0);
});
test('unknown token issuance time requires refresh and an unavailable provider stays unverified',async()=>{
 const result=await status({...expired,connected_at:null},{status:503,body:{error:'server_error',error_description:secret}});
 assert.equal(result.data.connected,false);assert.equal(result.data.auth_error,'GOOGLE_OAUTH_REFRESH_UNAVAILABLE');assert.equal(result.calls,1);
});
test('successful refresh preserves channel and publication identity without returning credentials',async()=>{
 const result=await status(expired,{status:200,body:{access_token:secret,expires_in:3600}});
 assert.equal(result.data.connected,true);assert.equal(result.data.channel_id,expired.channel_id);assert.equal(result.data.last_video.video_id,'xO8jmKy_120');assert.equal(result.writes,1);
});
