import fs from 'node:fs';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';

const day=process.env.VIDEO_DATE||new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('invalid_video_day');
const file='videos/ltzzz-daily-'+day+'.mp4',metaFile=file.replace('.mp4','.meta.json');
const ready=fs.existsSync(file)&&fs.existsSync(metaFile);
if(process.env.GITHUB_OUTPUT)fs.appendFileSync(process.env.GITHUB_OUTPUT,'ready='+ready+'\n');
if(ready){
 const meta=JSON.parse(fs.readFileSync(metaFile,'utf8')),bytes=fs.readFileSync(file);
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
 if(!probe.streams.some(s=>s.codec_type==='video')||!probe.streams.some(s=>s.codec_type==='audio'))throw Error('ready_video_missing_audio_or_video');
 fs.mkdirSync('video-output',{recursive:true});fs.copyFileSync(file,'video-output/youtube-daily.mp4');
 fs.writeFileSync('video-output/manifest.json',JSON.stringify({day,source_file:file,metadata_file:metaFile,source_commit:process.env.GITHUB_SHA||null,video_sha256:crypto.createHash('sha256').update(bytes).digest('hex'),duration:probe.format.duration,title:meta.title,description:meta.description,reused_ready_asset:true,model_calls:0},null,2)+'\n');
 console.log('Reusing ready video; no render: '+file);
}else console.log('No prepared video for '+day+'; existing free renderer may run');
