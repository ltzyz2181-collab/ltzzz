// Executes only the single explicitly authorized removal; never uploads a video.
import fs from 'node:fs';
import {OWNER_REMOVAL} from '../youtube-owner-removal.mjs';
const base='https://ltzzz-youtube-upload.ltzyz2181.workers.dev',scheduler='https://ltzzz-video-scheduler.ltzyz2181.workers.dev';
const run=process.env.GITHUB_RUN_ID,attempt=process.env.GITHUB_RUN_ATTEMPT||'1';
if(!/^\d+$/.test(run||'')||!/^\d+$/.test(attempt))throw Error('actions_run_identity_required');
const receipt={...OWNER_REMOVAL,at_utc:new Date().toISOString(),run_id:run,run_attempt:Number(attempt),source_commit:process.env.GITHUB_SHA,event:process.env.GITHUB_EVENT_NAME,deleted:false,absence_verified:false,model_calls:0,uploads:0,paid:false,tx_hash:null};
const save=()=>{fs.mkdirSync('results/publishing',{recursive:true});fs.writeFileSync('results/publishing/youtube-removal-'+run+'-'+attempt+'.json',JSON.stringify(receipt,null,2)+'\n');};
try{
 if(!process.env.LTZZZ_AGENT_TOKEN)throw Error('LTZZZ_AGENT_TOKEN_missing');
 const request=JSON.parse(fs.readFileSync('ops/dispatch/YOUTUBE-AUTOMATION-20261013-REMOVE-6FZYG2_TLzE.json'));
 if(request.video_id!==OWNER_REMOVAL.video_id||request.operation_id!==OWNER_REMOVAL.operation_id||request.expected_channel_id!==OWNER_REMOVAL.expected_channel_id||request.owner_requested!==true)throw Error('exact_owner_request_required');
 const status=await fetch(base+'/youtube/status',{redirect:'error',signal:AbortSignal.timeout(30000)}).then(r=>r.json());
 if(status.connected!==true||status.channel_id!==OWNER_REMOVAL.expected_channel_id)throw Error('expected_LTZZZ_channel_not_connected');
 const r=await fetch(base+'/youtube/delete',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+process.env.LTZZZ_AGENT_TOKEN},body:JSON.stringify({video_id:OWNER_REMOVAL.video_id,expected_channel_id:OWNER_REMOVAL.expected_channel_id,operation_id:OWNER_REMOVAL.operation_id}),redirect:'error',signal:AbortSignal.timeout(60000)});
 const removed=await r.json();receipt.removal_http=r.status;receipt.removal=removed;receipt.deleted=removed.deleted===true;receipt.absence_verified=removed.absence_verified===true;save();
 if(!r.ok||!removed.ok||!receipt.absence_verified)throw Error('owner_removal_not_verified');
 try{const q=await fetch(scheduler+'/queue/item?name=ltzzz-daily-2026-10-29',{headers:{Authorization:'Bearer '+process.env.LTZZZ_AGENT_TOKEN},redirect:'error',signal:AbortSignal.timeout(30000)});const item=await q.json();receipt.workbuddy_candidate={readback_http:q.status,queue_name:'ltzzz-daily-2026-10-29',queued:q.ok&&item.queued===true,video_exists:item.video_exists===true,metadata_exists:item.metadata_exists===true,video_sha256:item.video_sha256||null,bytes:item.bytes||null,publication_not_triggered:true};}catch{receipt.workbuddy_candidate={status:'queue_readback_unavailable',publication_not_triggered:true};}
}catch(e){receipt.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'owner_removal_failed';process.exitCode=1;}finally{save();console.log(JSON.stringify(receipt));}
