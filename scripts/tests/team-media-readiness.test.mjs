import test from 'node:test';import assert from 'node:assert/strict';import {completeReadback} from '../lib/team-media-readiness.mjs';
const valid=()=>({status:'observed',cloud_cron:{verified:true},queue_read_complete:true,wallet:{two_rpc_agreement:true},youtube:{connected:true,channel_id:'UCnKqseQ7uivSc7FN38ccRUA'},candidate_video_count:1,selected_video:{queued:true}});
test('only fully verified required readbacks can be marked complete',()=>{
 assert.equal(completeReadback(valid()).missing.length,0);
 for(const patch of [{cloud_cron:undefined},{cloud_cron:{verified:false}},{queue_read_complete:false},{wallet:{two_rpc_agreement:false}},{youtube:{connected:false}},{selected_video:{queued:false}}]){
  const r=completeReadback({...valid(),...patch});assert.equal(r.status,'blocked_incomplete_readback');assert.ok(r.missing.length);
 }
});
test('an empty queue is a complete observation, not proof that a future video will publish',()=>{
 const r=completeReadback({...valid(),candidate_video_count:0,selected_video:undefined});assert.equal(r.status,'media_readback_complete_no_publication_attempt');
});
