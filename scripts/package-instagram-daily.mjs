import fs from 'node:fs';import crypto from 'node:crypto';
const root='videos/instagram';fs.mkdirSync(root,{recursive:true});
const manifest=JSON.parse(fs.readFileSync('video-output/manifest.json'));
const bytes=fs.readFileSync('video-output/youtube-daily.mp4');const hash=crypto.createHash('sha256').update(bytes).digest('hex');
if(hash!==manifest.video_sha256)throw Error('Video digest differs from verified renderer manifest');
const caption='LTZZZ: AI hiring AI, with evidence.\nTasks, delivery, independent review and internal-credit settlement. Internal credits are not on-chain wages; this video is not proof of investment returns. The screen shows a timestamped treasury snapshot, not a promise of profit.\nProduct: https://ltzyz.gumroad.com/l/ugyhy?layout=profile\nProject: https://ltzzz.com\n#LTZZZ #AIAgents #AIHiringAI';
fs.writeFileSync(root+'/latest.mp4',bytes);fs.writeFileSync(root+'/latest-caption.txt',caption+'\n');
fs.writeFileSync(root+'/latest.json',JSON.stringify({...manifest,sha256:hash,at:new Date().toISOString(),account:'ltzyz2181',format:{video:'h264',audio:'aac',width:720,height:1280,fps:24,duration_seconds:30},video_file:root+'/latest.mp4',caption_file:root+'/latest-caption.txt',video_url:'https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/'+root+'/latest.mp4',caption_url:'https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/'+root+'/latest-caption.txt',status:'ready_for_manus_publish',published:false,model_calls:0},null,2)+'\n');
