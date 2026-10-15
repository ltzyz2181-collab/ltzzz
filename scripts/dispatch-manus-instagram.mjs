import fs from 'node:fs';import path from 'node:path';import {admission,localDay,pushManus} from './lib/manus-handoff.mjs';
const day=localDay(),phase=process.argv[2],file='results/publishing/manus-dispatch/'+day+'.json';
const save=r=>{fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n');};
const read=p=>fs.existsSync(p)?JSON.parse(fs.readFileSync(p)):null;
const packet=read('videos/instagram/latest.json');let record=read(file);
if(phase==='prepare'){
 const publication=read('results/publishing/instagram-'+day+'.json');
 let status='blocked_package_missing';try{status=admission({day,packet,video:fs.readFileSync(packet.video_file),caption:fs.readFileSync(packet.caption_file,'utf8'),publication});}catch{}
 let download_verified=false;
 if(status==='ready')try{const r=await fetch(packet.video_url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('download');const {sha}=await import('./lib/manus-handoff.mjs');const bytes=Buffer.from(await r.arrayBuffer());if(sha(bytes)!==packet.sha256)throw Error('hash');const c=await fetch(packet.caption_url,{signal:AbortSignal.timeout(15000)});if(!c.ok||await c.text()!==fs.readFileSync(packet.caption_file,'utf8'))throw Error('caption');download_verified=true;}catch{status='blocked_public_download';}
 const credentials=!!(process.env.MANUS_API_KEY||process.env.MANUS_ACCESS_TOKEN);
 const send=status==='ready'&&credentials&&!record?.request_reserved_at&&!record?.request_started_at&&!record?.remote_task_id;
 if(!record||!record.request_reserved_at&&!record.request_started_at){record={day,account:'ltzyz2181',at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,source_commit:process.env.GITHUB_SHA,status:send?'durable_request_reserved':status==='ready'?'blocked_manus_api_not_configured':status,sha256:packet?.sha256||null,video_url:packet?.video_url||null,public_download_verified:download_verified,remote_task_created:false,publication_verified:false,remote_daily_plan:'unverified',model_calls:0,paid_browser_calls:0,...(send?{request_reserved_at:new Date().toISOString()}:{} )};save(record);}
 if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'send='+send+'\n');console.log(day,record.status);
}else if(phase==='send'){
 if(!record||record.status!=='durable_request_reserved'||record.run_id!==process.env.GITHUB_RUN_ID)throw Error('durable_handoff_required');
 const task=fs.readFileSync('ops/dispatch/MANUS-INSTAGRAM-'+day+'.md','utf8');
 await pushManus(record,{key:process.env.MANUS_API_KEY,token:process.env.MANUS_ACCESS_TOKEN,prompt:task,save});console.log(day,record.status);
}else throw Error('phase_required');
