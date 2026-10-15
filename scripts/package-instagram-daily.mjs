import fs from 'node:fs';import crypto from 'node:crypto';
const root='videos/instagram',manifest=JSON.parse(fs.readFileSync('video-output/manifest.json'));
if(!/^\d{4}-\d{2}-\d{2}$/.test(manifest.day||''))throw Error('invalid_video_day');
const folder=root+'/'+manifest.day,bytes=fs.readFileSync('video-output/youtube-daily.mp4');const hash=crypto.createHash('sha256').update(bytes).digest('hex');
if(hash!==manifest.video_sha256)throw Error('Video digest differs from verified renderer manifest');
fs.mkdirSync(folder,{recursive:true});
if(fs.existsSync(folder+'/manifest.json')){
 const prior=JSON.parse(fs.readFileSync(folder+'/manifest.json'));
 if(prior.sha256!==hash)throw Error('Daily immutable package already exists; do not replace content being published');
}
const isANS=String(manifest.source_file).includes('/ans-cycle/');
const caption=(isANS?'LTZZZ: the daily AI work loop.\nThe coordinator assigns work, DeepSeek creates an engineering draft, and Doubao reviews it independently. Hashed artifacts return to the live task board. Draft review does not mean production deployment.':'LTZZZ: AI hiring AI, with evidence.\nTasks, delivery, independent review and internal-credit settlement.')+'\nInternal credits are not cash wages. This is not proof of investment returns.\nProduct: https://ltzyz.gumroad.com/l/ugyhy?layout=profile\nProject: https://ltzzz.com\n#LTZZZ #AIAgents #AIHiringAI';
const prefix='https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/';
const packet={...manifest,sha256:hash,at:new Date().toISOString(),timezone:'America/Tijuana',account:'ltzyz2181',format:{video:'h264',audio:'aac',width:720,height:1280,fps:24,duration_seconds:30},video_file:folder+'/video.mp4',caption_file:folder+'/caption.txt',video_url:prefix+folder+'/video.mp4',caption_url:prefix+folder+'/caption.txt',manifest_url:prefix+folder+'/manifest.json',status:'ready_for_manus_publish',published:false,model_calls:0};
fs.writeFileSync(folder+'/video.mp4',bytes);fs.writeFileSync(folder+'/caption.txt',caption+'\n');fs.writeFileSync(folder+'/manifest.json',JSON.stringify(packet,null,2)+'\n');
fs.writeFileSync(root+'/latest.mp4',bytes);fs.writeFileSync(root+'/latest-caption.txt',caption+'\n');fs.writeFileSync(root+'/latest.json',JSON.stringify(packet,null,2)+'\n');
const task='# Manus Instagram publish · '+manifest.day+'\n\n'+
 'Publish exactly one Reel today to @ltzyz2181. Owner has authorized publication; do not ask for repeated content approval. Only publish, do not generate or remake the video. Do not touch YouTube, WeChat, TikTok or Channels.\n\n'+
 '1. Read the daily plan at ops/dispatch/MANUS-INSTAGRAM-DAILY.md and check whether this account already published today. If any post or publishing receipt is uncertain, inspect before uploading; never duplicate.\n'+
 '2. Download MP4: '+packet.video_url+'\nSHA256: '+hash+'\nCaption: '+packet.caption_url+'\nManifest: '+packet.manifest_url+'\n'+
 '3. Verify the exact account and SHA256, upload as a Reel, use the supplied English caption with product link, check preview/audio and publish. Do not create a second post for retries.\n'+
 '4. Read back the formal Instagram permalink. Write results/publishing/instagram-'+manifest.day+'.json with account, day, source_sha256, permalink, published_at, media_id if available and screenshot_path. Without a permalink, published=false. If repo write access is absent, return this receipt in the Manus task and say not committed.\n'+
 '5. Use the existing login only. If login/credits/permissions block publication, return the exact blocker without claiming success. This handoff does not establish that a remote recurring plan is enabled.\n';
fs.mkdirSync('ops/dispatch',{recursive:true});fs.writeFileSync('ops/dispatch/MANUS-INSTAGRAM-'+manifest.day+'.md',task);
console.log(JSON.stringify({day:packet.day,status:packet.status,sha256:hash,video_url:packet.video_url}));
