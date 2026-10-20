/** Authenticated R2 queue. Uploaded, public and processed are separate states. */
const VERSION='v3-verified-queue',MAX_BYTES=25*1024*1024;
const NAME=/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/;
const EXPECTED_CHANNEL='UCnKqseQ7uivSc7FN38ccRUA';
const json=(body,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
const digest=async value=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',value))).map(x=>x.toString(16).padStart(2,'0')).join('');
const receiptKey=hash=>'receipts/youtube/'+hash+'.json';
const read=async(env,key)=>{const item=await env.VIDEOS.get(key);return item?item.json():null;};
const write=async(env,key,value,options={})=>env.VIDEOS.put(key,JSON.stringify(value),{httpMetadata:{contentType:'application/json'},...options});
function authorized(request,env){return (!!env.LTZZZ_AGENT_TOKEN&&request.headers.get('Authorization')===`Bearer ${env.LTZZZ_AGENT_TOKEN}`)||(!!env.WEBHOOK_SECRET&&request.headers.get('X-Webhook-Secret')===env.WEBHOOK_SECRET);}
async function youtube(env,path,body,publicationKey){
 const init={method:body?'POST':'GET',headers:{Authorization:`Bearer ${env.LTZZZ_AGENT_TOKEN}`}};
 if(body){init.body=body;if(!(body instanceof FormData))init.headers['Content-Type']='application/json';}
 if(publicationKey)init.headers['Idempotency-Key']=publicationKey;
 const url='https://youtube-upload.internal'+path;
 const response=env.YOUTUBE_UPLOADER?await env.YOUTUBE_UPLOADER.fetch(new Request(url,init)):
  await fetch((env.YOUTUBE_UPLOAD_WORKER_URL||'https://ltzzz-youtube-upload.ltzyz2181.workers.dev')+path,{...init,signal:AbortSignal.timeout(180000)});
 let data;try{data=await response.json();}catch{return {ok:false,http:response.status,error:'uploader_non_json_response'};}
 return {...data,http:response.status};
}
async function enqueue(request,env,name){
 if(!env.VIDEOS)return json({ok:false,error:'r2_binding_missing'},503);
 if(!NAME.test(name))return json({ok:false,error:'invalid_name'},400);
 const form=await request.formData(),video=form.get('video');let meta;
 try{meta=JSON.parse(String(form.get('meta')||''));}catch{return json({ok:false,error:'invalid_metadata'},400);}
 if(!video||typeof video.arrayBuffer!=='function'||!video.size||video.size>MAX_BYTES)return json({ok:false,error:'video_missing_or_exceeds_25MB'},400);
 if(typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>100||typeof meta.description!=='string'||meta.description.length>4900)return json({ok:false,error:'invalid_title_or_description'},400);
 const bytes=await video.arrayBuffer(),hash=await digest(bytes),key=receiptKey(hash);
 if(meta.video_sha256&&meta.video_sha256!==hash)return json({ok:false,error:'video_hash_mismatch'},422);
 const prior=await read(env,key);
 if(prior?.state==='published')return json({ok:true,status:'already_public',video_sha256:hash,video_id:prior.video_id,url:prior.url,verification:prior.verification});
 if(prior)return json({ok:true,status:'reconciliation_required',name:prior.name,video_sha256:hash,video_id:prior.video_id||null});
 const metaKey=`queue/${name}.meta.json`,existing=await read(env,metaKey);
 if(existing&&existing.video_sha256!==hash)return json({ok:false,error:'queue_name_conflict'},409);
 await env.VIDEOS.put(`queue/${name}.mp4`,bytes,{httpMetadata:{contentType:'video/mp4'},customMetadata:{verified_sha256:hash}});
 // Publish the pointer only after the complete video write succeeds.
 await write(env,metaKey,{...meta,title:meta.title.trim(),name,video_sha256:hash,bytes:bytes.byteLength,publication_policy:'public_ready',queued_at:new Date().toISOString()});
 return json({ok:true,status:'queued',name,video_sha256:hash,bytes:bytes.byteLength});
}
async function queueItem(env,name){
 if(!env.VIDEOS)return json({ok:false,error:'r2_binding_missing'},503);
 if(!NAME.test(name||''))return json({ok:false,error:'invalid_name'},400);
 const meta=await read(env,`queue/${name}.meta.json`),object=await env.VIDEOS.get(`queue/${name}.mp4`);
 if(!meta||!object)return json({ok:true,name,queued:false,video_exists:!!object,metadata_exists:!!meta});
 const bytes=await object.arrayBuffer(),hash=await digest(bytes);
 return json({ok:true,name,queued:meta.video_sha256===hash&&meta.bytes===bytes.byteLength&&meta.publication_policy==='public_ready',
  video_exists:true,metadata_exists:true,video_sha256:hash,bytes:bytes.byteLength,
  metadata:{title:meta.title,description:meta.description,video_sha256:meta.video_sha256,bytes:meta.bytes,publication_policy:meta.publication_policy}});
}
async function queueList(env,cursor){
 if(!env.VIDEOS)return json({ok:false,error:'r2_binding_missing'},503);
 const page=await env.VIDEOS.list({prefix:'queue/',limit:40,...(cursor?{cursor}:{})}),items=[];
 for(const entry of page.objects.filter(x=>x.key.endsWith('.meta.json'))){
  const name=entry.key.slice(6,-10);if(!NAME.test(name))continue;
  const meta=await read(env,entry.key),object=await env.VIDEOS.head(`queue/${name}.mp4`);
  const candidate=!!object&&meta?.publication_policy==='public_ready'&&/^[a-f0-9]{64}$/.test(meta.video_sha256||'')&&object.size===meta.bytes;
  const prior=meta?.video_sha256?await read(env,receiptKey(meta.video_sha256)):null;
  items.push({name,video_exists:!!object,metadata_exists:!!meta,video_sha256:meta?.video_sha256||null,bytes:object?.size||null,
   title:meta?.title||null,full_content_verified:false,metadata_candidate:candidate,
   enqueue_hash_matches:!!object?.customMetadata?.verified_sha256&&object.customMetadata.verified_sha256===meta?.video_sha256,
   publication_state:prior?.state||null,video_id:prior?.video_id||null,new_upload_candidate:candidate&&!prior,read_only:true});
 }
 return json({ok:true,read_only:true,items,truncated:page.truncated===true,cursor:page.truncated?page.cursor:null});
}
async function processVideo(env,name){
 const metaKey=`queue/${name}.meta.json`,meta=await read(env,metaKey);
 if(!meta)return {ok:false,status:'metadata_missing',name};
 if(meta.publication_policy!=='public_ready'||!/^([a-f0-9]{64})$/.test(meta.video_sha256||''))return {ok:false,status:'legacy_metadata_not_validated',name};
 const key=receiptKey(meta.video_sha256),publicationKey='queue-'+meta.video_sha256;
 let receipt=await read(env,key);
 if(!receipt){
  const claim={state:'upload_started',name,video_sha256:meta.video_sha256,publication_key:publicationKey,at:new Date().toISOString(),published:false};
  const acquired=await write(env,key,claim,{onlyIf:{etagDoesNotMatch:'*'}});
  if(!acquired)return {ok:false,status:'another_execution_claimed',name};
  receipt=claim;
  try{
   const object=await env.VIDEOS.get(`queue/${name}.mp4`);
   if(!object)throw Error('video_missing');
   const bytes=await object.arrayBuffer();
   if(bytes.byteLength>MAX_BYTES||await digest(bytes)!==meta.video_sha256)throw Error('video_hash_or_size_changed');
   const form=new FormData();form.set('video',new Blob([bytes],{type:'video/mp4'}),name+'.mp4');
   form.set('title',meta.title);form.set('description',meta.description);form.set('privacyStatus','public');form.set('categoryId','28');
   const uploaded=await youtube(env,'/youtube/upload',form,publicationKey);
   if(!uploaded.video_id)throw Error('upload_unconfirmed');
   receipt={...receipt,state:'uploaded_pending_verification',video_id:uploaded.video_id,url:'https://www.youtube.com/watch?v='+uploaded.video_id};
   await write(env,key,receipt);
  }catch{
   // The upstream may already have accepted the video. Never buy a second upload.
   receipt={...receipt,state:'upload_uncertain',error:'reconcile_publication_before_retry'};await write(env,key,receipt);
   return {ok:false,status:receipt.state,name,video_sha256:meta.video_sha256};
  }
 }
 if(!receipt.video_id){
  const prior=await youtube(env,'/youtube/publication?key='+publicationKey);
  if(!prior.receipt?.video_id)return {ok:false,status:'upload_uncertain',name,video_sha256:meta.video_sha256};
  receipt={...receipt,state:'uploaded_pending_verification',video_id:prior.receipt.video_id,url:'https://www.youtube.com/watch?v='+prior.receipt.video_id};await write(env,key,receipt);
 }
 if(receipt.state!=='published'){
  let verification=await youtube(env,'/youtube/verify?video_id='+encodeURIComponent(receipt.video_id));
  if(verification.ok&&verification.channel_id===EXPECTED_CHANNEL&&['private','unlisted'].includes(verification.privacyStatus)&&(!receipt.public_update_attempted_at||Date.now()-Date.parse(receipt.public_update_attempted_at)>3600000)){
   receipt.public_update_attempted_at=new Date().toISOString();await write(env,key,receipt);
   await youtube(env,'/youtube/update-status',JSON.stringify({video_id:receipt.video_id,privacyStatus:'public'}));
   verification=await youtube(env,'/youtube/verify?video_id='+encodeURIComponent(receipt.video_id));
  }
  if(!verification.published||verification.channel_id!==EXPECTED_CHANNEL){
   receipt={...receipt,state:verification.privacyStatus==='public'?'processing':'not_public',published:false,verification};await write(env,key,receipt);
   return {ok:false,status:receipt.state,name,video_id:receipt.video_id,url:receipt.url,verification};
  }
  receipt={...receipt,state:'published',published:true,verification,verified_at:new Date().toISOString()};
  // Persist confirmation BEFORE archiving, so a cleanup failure cannot reupload.
  await write(env,key,receipt);
 }
 const object=await env.VIDEOS.get(`queue/${name}.mp4`);
 if(object)await env.VIDEOS.put(`published/${name}.mp4`,object.body,{httpMetadata:{contentType:'video/mp4'}});
 await write(env,`published/${name}.meta.json`,{...meta,publication:receipt});
 await env.VIDEOS.delete(`queue/${name}.mp4`);await env.VIDEOS.delete(metaKey);
 return {ok:true,status:'published',name,video_id:receipt.video_id,url:receipt.url,verification:receipt.verification};
}
async function legacyPublish(request,env){
 const body=await request.json();if(body.privacyStatus&&body.privacyStatus!=='public')return json({ok:false,error:'use_youtube_uploader_for_explicit_private_upload'},400);
 let source;try{source=new URL(body.video_url);}catch{return json({ok:false,error:'missing_or_invalid_video_url'},400);}
 if(source.protocol!=='https:'||!['videos.ltzzz.com','raw.githubusercontent.com','ltzyz2181-collab.github.io'].includes(source.hostname))return json({ok:false,error:'video_source_not_allowed'},400);
 if(source.hostname==='raw.githubusercontent.com'&&!source.pathname.startsWith('/ltzyz2181-collab/ltzzz/'))return json({ok:false,error:'video_source_not_in_project'},400);
 const response=await fetch(source,{signal:AbortSignal.timeout(30000),redirect:'error'});
 if(!response.ok)return json({ok:false,error:'video_source_unavailable',http:response.status},502);
 const data=await response.arrayBuffer();if(data.byteLength>MAX_BYTES)return json({ok:false,error:'video_exceeds_25MB'},413);
 const name='legacy-'+(await digest(data)).slice(0,24),form=new FormData();form.set('video',new Blob([data],{type:'video/mp4'}),name+'.mp4');form.set('meta',JSON.stringify({title:String(body.title||name).slice(0,100),description:String(body.description||'').slice(0,4900)}));
 const queued=await (await enqueue(new Request(request.url,{method:'POST',body:form}),env,name)).json();
 if(!queued.ok)return json(queued,400);
 const publication=queued.status==='already_public'?{ok:true,status:'published',video_id:queued.video_id,url:queued.url}:await processVideo(env,queued.name||name);
 return json({ok:publication.ok,task_id:'queue-'+queued.video_sha256,results:{youtube:{...publication,status:publication.ok?'published':publication.status}}});
}
async function processQueue(env,selected){
 if(!env.VIDEOS||!env.LTZZZ_AGENT_TOKEN)return {ok:false,error:'queue_or_upload_auth_missing'};
 const names=[];
 if(selected){if(!NAME.test(selected))return {ok:false,error:'invalid_name'};names.push(selected);}
 else{
  let cursor;
  do{const page=await env.VIDEOS.list({prefix:'queue/',limit:100,cursor});names.push(...page.objects.filter(x=>x.key.endsWith('.meta.json')).map(x=>x.key.slice(6,-10)).filter(x=>NAME.test(x)));cursor=page.truncated?page.cursor:undefined;}while(cursor&&names.length<100);
 }
 const results=[];let newUploadAttempts=0;
 // One real upload per invocation; already-started items can reconcile first.
 for(const name of names.slice(0,20)){
  try{
   const meta=await read(env,`queue/${name}.meta.json`);
   const previouslyStarted=meta?.video_sha256?await read(env,receiptKey(meta.video_sha256)):null;
   const result=await processVideo(env,name);results.push(result);
   if(!previouslyStarted&&!['metadata_missing','legacy_metadata_not_validated','another_execution_claimed'].includes(result.status)){
    // A lost response is still a real upload attempt; stop after it. Already
    // started items only reconcile and cannot consume today's new-upload slot.
    newUploadAttempts++;break;
   }
  }
  catch{results.push({ok:false,status:'queue_processing_failed',name});break;}
 }
 const report={at:new Date().toISOString(),ok:results.every(x=>x.ok),scanned:names.length,new_upload_attempts:newUploadAttempts,results};
 await write(env,'logs/latest-publish.json',report);return report;
}
export default{
 async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return json({ok:true,service:'ltzzz-video-scheduler',version:VERSION,cron_configured:!!env.VIDEOS,platforms:{youtube:!!(env.YOUTUBE_UPLOADER||env.YOUTUBE_UPLOAD_WORKER_URL),tiktok:false},privacy_default:'public',public_requires_verification:true,queue_upload_authenticated:true,queue_readback:true,queue_listing:true,queue_listing_format:'metadata_v2'});
  if(!authorized(request,env))return json({ok:false,error:'unauthorized'},401);
  try{
   if(url.pathname.startsWith('/queue/upload/')&&request.method==='POST')return enqueue(request,env,url.pathname.slice('/queue/upload/'.length));
   if(url.pathname==='/queue/item'&&request.method==='GET')return await queueItem(env,url.searchParams.get('name'));
   if(url.pathname==='/queue/list'&&request.method==='GET')return await queueList(env,url.searchParams.get('cursor'));
   if(url.pathname==='/queue/run'&&request.method==='POST'){const input=await request.json().catch(()=>({}));return json(await processQueue(env,input.name));}
   if(url.pathname==='/queue/status'&&request.method==='GET'){
    const sha=url.searchParams.get('sha256');if(!/^[a-f0-9]{64}$/.test(sha||''))return json({ok:false,error:'invalid_hash'},400);
    return json({ok:true,receipt:await read(env,receiptKey(sha))});
   }
   if(url.pathname==='/status'&&request.method==='GET')return json({ok:true,latest:await read(env,'logs/latest-publish.json')});
   if((url.pathname==='/schedule/publish'||url.pathname==='/webhook/video-ready')&&request.method==='POST')return legacyPublish(request,env);
   return json({ok:false,error:'not_found'},404);
  }catch{return json({ok:false,error:'queue_request_failed'},500);}
 },
 async scheduled(event,env,ctx){return processQueue(env);}
};
