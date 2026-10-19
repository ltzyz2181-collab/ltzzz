import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';
import {execFileSync} from 'node:child_process';
import {queueOnlyVideo} from './lib/video-queue-only.mjs';

// Config-driven: job file (default videos/_queue-job.json) selects video/meta/name;
// precedence CLI --video/--meta/--name > job config > env VIDEO_FILE/VIDEO_META.
const {values}=parseArgs({options:{video:{type:'string'},meta:{type:'string'},name:{type:'string'},job:{type:'string'}},strict:true});
const jobPath=values.job||process.env.QUEUE_JOB_CONFIG||'videos/_queue-job.json';
const job=fs.existsSync(jobPath)?JSON.parse(fs.readFileSync(jobPath,'utf8')):{};
const file=values.video||job.video||process.env.VIDEO_FILE;
const metaFile=values.meta||job.meta||process.env.VIDEO_META||file.replace(/\.mp4$/i,'.meta.json');
const name=values.name||job.name||path.basename(file,path.extname(file));
if(!file||!name)throw Error('video_or_name_missing');
if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(name))throw Error('invalid_queue_name');
const receiptPath=`results/publishing/video-queue-upload-${name}.json`;
const receipt={name,file,meta_file:metaFile,uploaded_to_queue:false,published:false,model_calls:0,owner_no_vpn_verified:false,
 network_context:process.env.VIDEO_NETWORK_CONTEXT||'not_independently_verified',at:new Date().toISOString()};
const save=value=>{fs.mkdirSync(path.dirname(receiptPath),{recursive:true});fs.writeFileSync(receiptPath,JSON.stringify(value,null,2)+'\n');};
try{
 if(!process.env.LTZZZ_AGENT_TOKEN)throw Error('LTZZZ_AGENT_TOKEN_missing');
 if(!fs.existsSync(file)||!fs.existsSync(metaFile))throw Error('video_or_metadata_missing');
 const size=fs.statSync(file).size;if(!size||size>25*1024*1024)throw Error('invalid_video_size');
 const bytes=fs.readFileSync(file);let meta;try{meta=JSON.parse(fs.readFileSync(metaFile,'utf8'));}catch{throw Error('invalid_metadata_json');}
 let probe;try{probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8',timeout:30000,stdio:['ignore','pipe','pipe']}));}catch{throw Error('ffprobe_unavailable_or_media_invalid');}
 const video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio'),duration=Number(probe.format.duration);
 if(!video||!audio||video.width*16!==video.height*9||!Number.isFinite(duration)||duration<15||duration>30)throw Error('video_specs_invalid');
 receipt.media={width:video.width,height:video.height,duration_seconds:duration,audio:true};
 await queueOnlyVideo({bytes,meta,name,token:process.env.LTZZZ_AGENT_TOKEN,receipt,save});
 console.log(JSON.stringify({uploaded_to_queue:receipt.uploaded_to_queue,queue_readback_verified:receipt.queue_readback_verified,published:false,queue_keys:receipt.queue_keys,receipt:receiptPath}));
}catch(error){receipt.error=String(error.message).slice(0,200);receipt.failed_at=new Date().toISOString();save(receipt);console.error(receipt.error);process.exitCode=1;}
