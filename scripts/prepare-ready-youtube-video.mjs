import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {preparedVideoPolicy} from './lib/prepared-video-policy.mjs';

const day=process.env.VIDEO_DATE||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_video_day');
const file='videos/ltzzz-daily-'+day+'.mp4',metaFile=file.replace('.mp4','.meta.json');
const ready=fs.existsSync(file)&&fs.existsSync(metaFile);
const finish=(allowed,status)=>{if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'ready='+allowed+'\n');if(!allowed){fs.mkdirSync('results/publishing',{recursive:true});const run=/^\d+$/.test(process.env.GITHUB_RUN_ID||'')?process.env.GITHUB_RUN_ID:'local';const attempt=/^\d+$/.test(process.env.GITHUB_RUN_ATTEMPT||'')?process.env.GITHUB_RUN_ATTEMPT:'1';fs.writeFileSync('results/publishing/youtube-daily-skip-'+run+'-'+attempt+'.json',JSON.stringify({task_id:'YOUTUBE-AUTOMATION-20261013',day,timezone:'America/Tijuana',status,source_commit:process.env.GITHUB_SHA||null,run_id:process.env.GITHUB_RUN_ID||null,run_attempt:Number(attempt),at_utc:new Date().toISOString(),published:false,uploaded:false,model_calls:0,fallback_rendered:false},null,2)+'\n');}console.log(status);};
if(ready){
 const meta=JSON.parse(fs.readFileSync(metaFile,'utf8')),bytes=fs.readFileSync(file);
 const hash=crypto.createHash('sha256').update(bytes).digest('hex'),receipts=[];
 if(fs.existsSync('results/publishing'))for(const p of fs.readdirSync('results/publishing').filter(p=>/^youtube-.*\.json$/.test(p))){try{receipts.push(JSON.parse(fs.readFileSync('results/publishing/'+p)));}catch{}}
 const policy=preparedVideoPolicy({day,hash,meta,receipts});if(policy!=='ready'){finish(false,policy);process.exit(0);}
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
 if(!probe.streams.some(s=>s.codec_type==='video')||!probe.streams.some(s=>s.codec_type==='audio'))throw Error('ready_video_missing_audio_or_video');
 fs.mkdirSync('video-output',{recursive:true});fs.copyFileSync(file,'video-output/youtube-daily.mp4');
 fs.writeFileSync('video-output/manifest.json',JSON.stringify({day,source_file:file,metadata_file:metaFile,source_commit:process.env.GITHUB_SHA||null,video_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),duration:probe.format.duration,title:meta.title,description:meta.description,reused_ready_asset:true,model_calls:0},null,2)+'\n');
 finish(true,'ready_verified_fresh_prepared_asset');console.log('Reusing ready video; no render: '+file);
}else finish(false,'blocked_no_prepared_video_no_template_fallback');
