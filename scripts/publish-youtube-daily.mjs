import fs from 'node:fs';
const day=new Date().toISOString().slice(0,10),path='results/publishing/youtube-daily-'+day+'.json',base='https://ltzzz-youtube-upload.ltzyz2181.workers.dev';
fs.mkdirSync('results/publishing',{recursive:true});
let prior;try{prior=JSON.parse(fs.readFileSync(path));}catch{}
if(prior?.video_id){const v=await fetch(base+'/youtube/verify?video_id='+prior.video_id).then(r=>r.json());if(v.published){console.log('Already public: '+v.url);process.exit(0);}if(prior.uploaded)throw Error('Previous upload needs verification, do not duplicate');}
const manifest=JSON.parse(fs.readFileSync('video-output/manifest.json'));
const receipt={...manifest,run_id:process.env.GITHUB_RUN_ID,published:false,uploaded:false};
try {
 const status=await fetch(base+'/youtube/status').then(r=>r.json());if(!status.connected||status.channel_id!=='UCnKqseQ7uivSc7FN38ccRUA')throw Error('Expected LTZZZ channel not connected');
 const form=new FormData();form.set('video',new Blob([fs.readFileSync('video-output/youtube-daily.mp4')],{type:'video/mp4'}),'youtube-daily.mp4');
 form.set('title','LTZZZ: AI Hiring AI — Evidence First | '+day);
 form.set('description','AI-generated workflow explainer using repository delivery evidence: '+manifest.source_file+'\nInternal-credit settlement only. paid=false; tx_hash=null. This video is not proof of on-chain wages or external revenue.\nProduct: https://ltzyz.gumroad.com/l/ugyhy?layout=profile\nProject: https://ltzzz.com\nSource: https://github.com/ltzyz2181-collab/ltzzz/blob/'+process.env.GITHUB_SHA+'/'+manifest.source_file);
 form.set('privacyStatus','public');form.set('categoryId','28');form.set('tags','LTZZZ,AI agents,AI hiring AI');
 const response=await fetch(base+'/youtube/upload',{method:'POST',headers:{Authorization:'Bearer '+process.env.LTZZZ_AGENT_TOKEN,'Idempotency-Key':'daily-'+day},body:form,signal:AbortSignal.timeout(600000)});
 const data=await response.json();if(!response.ok||!data.video_id)throw Error('Upload failed: '+JSON.stringify(data));
 Object.assign(receipt,{uploaded:true,video_id:data.video_id,url:data.url});fs.writeFileSync(path,JSON.stringify(receipt,null,2));
 for(let i=0;i<18;i++){const v=await fetch(base+'/youtube/verify?video_id='+data.video_id).then(r=>r.json());receipt.verification=v;if(v.published&&v.channel_id===status.channel_id){receipt.published=true;receipt.verified_at=new Date().toISOString();break;}await new Promise(r=>setTimeout(r,10000));}
 if(!receipt.published)throw Error('Uploaded but public processing not yet verified');
 console.log(receipt.url);
}catch(e){receipt.error=String(e.message).slice(0,700);process.exitCode=1;}finally{fs.writeFileSync(path,JSON.stringify(receipt,null,2));}
