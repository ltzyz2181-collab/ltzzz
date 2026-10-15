import fs from 'node:fs';
import {publishQueuedVideo,isPublic,UPLOADER} from './lib/video-queue-client.mjs';
const day=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
const path='results/publishing/youtube-daily-'+day+'.json';
fs.mkdirSync('results/publishing',{recursive:true});
let prior;try{prior=JSON.parse(fs.readFileSync(path));}catch{}
if(prior?.video_id){
 const response=await fetch(UPLOADER+'/youtube/verify?video_id='+encodeURIComponent(prior.video_id),{signal:AbortSignal.timeout(30000)}),v=await response.json();
 if(response.ok&&isPublic(v)){Object.assign(prior,{published:true,verification:v,verified_at:new Date().toISOString()});fs.writeFileSync(path,JSON.stringify(prior,null,2)+'\n');console.log('Already public: '+v.url);process.exit(0);}
 if(prior.uploaded&&!prior.queue)throw Error('Legacy upload needs reconciliation; do not create a duplicate');
}
const manifest=JSON.parse(fs.readFileSync('video-output/manifest.json','utf8'));
if(manifest.day!==day)throw Error('Prepared video date differs from publication date');
const receipt={...manifest,run_id:process.env.GITHUB_RUN_ID,published:false,uploaded:false};
const save=value=>fs.writeFileSync(path,JSON.stringify(value,null,2)+'\n');
const meta={title:manifest.title||'LTZZZ: AI Hiring AI — Evidence First | '+day,
 description:manifest.description||'AI-generated workflow explainer using repository delivery evidence: '+manifest.source_file+'\nInternal-credit settlement only. paid=false; tx_hash=null. This video is not proof of on-chain wages or external revenue.\nProduct: https://ltzyz.gumroad.com/l/ugyhy?layout=profile\nProject: https://ltzzz.com\nSource: https://github.com/ltzyz2181-collab/ltzzz/blob/'+process.env.GITHUB_SHA+'/'+manifest.source_file,
 video_sha256:manifest.video_sha256};
try{await publishQueuedVideo({bytes:fs.readFileSync('video-output/youtube-daily.mp4'),meta,name:'ltzzz-daily-'+day,token:process.env.LTZZZ_AGENT_TOKEN,receipt,save});console.log(receipt.url);}
catch(e){console.error(e.message);process.exitCode=1;}
