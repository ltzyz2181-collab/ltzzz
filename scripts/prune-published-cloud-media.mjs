import fs from 'node:fs';
import {SCHEDULER,UPLOADER,isPublic} from './lib/video-queue-client.mjs';
const report={task_id:'YOUTUBE-AUTOMATION-20261013',step_id:'PUBLISHED-CLOUD-MEDIA-RETENTION',at_utc:new Date().toISOString(),source_commit:process.env.GITHUB_SHA||null,run_id:process.env.GITHUB_RUN_ID||null,run_attempt:Number(process.env.GITHUB_RUN_ATTEMPT||1),pages:[],legacy_publication_checks:[],uploads:0,model_calls:0,paid:false,tx_hash:null};
const file=`results/publishing/video-retention-cloud-${process.env.GITHUB_RUN_ID||'local'}-${process.env.GITHUB_RUN_ATTEMPT||1}.json`;
try{
 if(!process.env.LTZZZ_AGENT_TOKEN)throw Error('upload_identity_missing');
 let cursor;
 for(let i=0;i<10;i++){
  const response=await fetch(SCHEDULER+'/queue/prune-published',{method:'POST',headers:{Authorization:'Bearer '+process.env.LTZZZ_AGENT_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({cursor}),redirect:'error',signal:AbortSignal.timeout(240000)});
  if(!response.ok)throw Error('retention_http_'+response.status);
  const page=await response.json();if(!page.ok)throw Error('retention_failed');report.pages.push(page);
  cursor=page.cursor;if(!page.truncated)break;
 }
 report.more_pages_pending=!!cursor;
 // Legacy upload receipts lack processed/channel confirmation. Read, never upload
 // or change visibility. These observations alone do not delete repository files.
 for(const source of ['youtube-38085038656.json','youtube-38230747166.json','youtube-38659197058.json']){
  const old=JSON.parse(fs.readFileSync('results/publishing/'+source));const id=old.response.video_id;
  const response=await fetch(UPLOADER+'/youtube/verify?video_id='+encodeURIComponent(id),{headers:{Authorization:'Bearer '+process.env.LTZZZ_AGENT_TOKEN},redirect:'error',signal:AbortSignal.timeout(30000)});
  const v=await response.json();report.legacy_publication_checks.push({source_receipt:'results/publishing/'+source,source_file:old.file,video_id:id,http:response.status,published:response.ok&&v.video_id===id&&isPublic(v),verification:{ok:v.ok,video_id:v.video_id,channel_id:v.channel_id,privacyStatus:v.privacyStatus,uploadStatus:v.uploadStatus,published:v.published,url:v.url},checked_at:new Date().toISOString()});
 }
 report.assets_retained=report.pages.flatMap(p=>p.results).filter(r=>!['removed','already_removed'].includes(r.status));
 report.status=report.more_pages_pending?'partial_more_pages_pending':report.assets_retained.length?'partial_assets_retained':'completed';
}catch(e){report.status='blocked';report.error=/^[a-zA-Z0-9_]+$/.test(e.message)?e.message:'retention_transport_or_protocol_failure';process.exitCode=1;}
fs.mkdirSync('results/publishing',{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
