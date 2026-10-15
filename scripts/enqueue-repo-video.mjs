import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {publishQueuedVideo} from './lib/video-queue-client.mjs';

const file=process.env.VIDEO_FILE||'videos/ltzzz-daily-2026-10-15.mp4';
const metaFile=process.env.VIDEO_META||file.replace(/\.mp4$/,'.meta.json');
const name=path.basename(file,'.mp4');
const run=(process.env.GITHUB_RUN_ID||'local')+'-attempt-'+(process.env.GITHUB_RUN_ATTEMPT||'1');
const receiptPath='results/publishing/video-queue-'+run+'.json';
const receipt={file,meta_file:metaFile,source_commit:process.env.GITHUB_SHA||null,run_id:process.env.GITHUB_RUN_ID||null,run_attempt:process.env.GITHUB_RUN_ATTEMPT||null,published:false,uploaded:false,model_calls:0};
fs.mkdirSync(path.dirname(receiptPath),{recursive:true});
const save=value=>fs.writeFileSync(receiptPath,JSON.stringify(value,null,2)+'\n');
save(receipt);
try{
 const root=process.cwd()+path.sep;
 if(!path.resolve(file).startsWith(root)||!path.resolve(metaFile).startsWith(root))throw Error('asset_outside_repository');
 const probe=JSON.parse(execFileSync('ffprobe',['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'}));
 const video=probe.streams.find(s=>s.codec_type==='video'),audio=probe.streams.find(s=>s.codec_type==='audio');
 if(!video||!audio||!Number.isFinite(Number(probe.format.duration))||Number(probe.format.duration)<=0)throw Error('video_audio_or_duration_missing');
 receipt.media={width:video.width,height:video.height,duration_seconds:Number(probe.format.duration),video_codec:video.codec_name,audio_codec:audio.codec_name};save(receipt);
 await publishQueuedVideo({bytes:fs.readFileSync(file),meta:JSON.parse(fs.readFileSync(metaFile,'utf8')),name,token:process.env.LTZZZ_AGENT_TOKEN,receipt,save});
 console.log(JSON.stringify({published:receipt.published,url:receipt.url,video_sha256:receipt.video_sha256,receipt:receiptPath,verification:receipt.verification}));
}catch(e){receipt.error=String(e.message).slice(0,250);save(receipt);console.error(receipt.error);process.exitCode=1;}
