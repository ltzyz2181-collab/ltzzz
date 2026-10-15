import crypto from 'node:crypto';

export const SCHEDULER='https://ltzzz-video-scheduler.ltzyz2181.workers.dev';
export const UPLOADER='https://ltzzz-youtube-upload.ltzyz2181.workers.dev';
export const CHANNEL='UCnKqseQ7uivSc7FN38ccRUA';
export const isPublic=v=>v?.published===true&&v?.privacyStatus==='public'&&v?.uploadStatus==='processed'&&v?.channel_id===CHANNEL;

// Resume the same content receipt on every retry. Never fall back to a new
// direct YouTube upload when a queue response is uncertain.
export async function publishQueuedVideo({bytes,meta,name,token,receipt={},save=()=>{},fetchImpl=fetch,sleep=ms=>new Promise(r=>setTimeout(r,ms)),polls=24}){
 const hash=crypto.createHash('sha256').update(bytes).digest('hex');
 Object.assign(receipt,{name,video_sha256:hash,bytes:bytes.length,published:false,model_calls:0,at:new Date().toISOString()});save(receipt);
 const request=async(path,{body,publicRead=false,timeout=240000}={})=>{
  const headers=publicRead?{}:{Authorization:'Bearer '+token};
  if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
  const r=await fetchImpl((publicRead?UPLOADER:SCHEDULER)+path,{method:body?'POST':'GET',headers,body,signal:AbortSignal.timeout(timeout)});
  let j;try{j=await r.json();}catch{throw Error('non_json_http_'+r.status);}
  if(!r.ok)throw Error('queue_http_'+r.status+'_'+String(j.error||'request_failed').replace(/[^a-zA-Z0-9_:-]/g,'').slice(0,100));
  return j;
 };
 try{
  if(!token)throw Error('LTZZZ_AGENT_TOKEN_missing');
  if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(name))throw Error('invalid_queue_name');
  if(!bytes.length||bytes.length>25*1024*1024)throw Error('invalid_video_size');
  if(meta.video_sha256&&meta.video_sha256!==hash)throw Error('video_hash_mismatch');
  const status=await request('/youtube/status',{publicRead:true,timeout:30000});
  if(!status.connected||status.channel_id!==CHANNEL)throw Error('expected_LTZZZ_channel_not_connected');
  const form=new FormData();form.set('video',new Blob([bytes],{type:'video/mp4'}),name+'.mp4');form.set('meta',JSON.stringify({...meta,video_sha256:hash}));
  receipt.phase='queue_upload_started';save(receipt);
  const queued=await request('/queue/upload/'+name,{body:form});
  receipt.queue=queued;receipt.phase='queued_or_reconciling';save(receipt);
  if(!queued.ok)throw Error('queue_rejected');
  if(queued.video_id){receipt.uploaded=true;receipt.video_id=queued.video_id;receipt.url='https://www.youtube.com/watch?v='+queued.video_id;save(receipt);}
  for(let attempt=0;attempt<polls;attempt++){
   let known=await request('/queue/status?sha256='+hash,{timeout:30000});
   if(known.receipt?.video_id){receipt.uploaded=true;receipt.video_id=known.receipt.video_id;receipt.url='https://www.youtube.com/watch?v='+receipt.video_id;}
   if(known.receipt?.state!=='published'&&queued.status!=='already_public'){
    receipt.phase='processing_or_verifying';save(receipt);
    const run=await request('/queue/run',{body:JSON.stringify({name:queued.name||name})});receipt.last_queue_run=run;
    known=await request('/queue/status?sha256='+hash,{timeout:30000});
    if(known.receipt?.video_id){receipt.uploaded=true;receipt.video_id=known.receipt.video_id;receipt.url='https://www.youtube.com/watch?v='+receipt.video_id;}
   }
   receipt.queue_receipt=known.receipt||null;
   if(receipt.video_id){
    // Fresh Google-backed verification, in addition to the queue receipt.
    const v=await request('/youtube/verify?video_id='+encodeURIComponent(receipt.video_id),{publicRead:true,timeout:30000});receipt.verification=v;
    if(isPublic(v)){Object.assign(receipt,{published:true,phase:'public_verified',verified_at:new Date().toISOString()});save(receipt);return receipt;}
   }
   save(receipt);
   if(['upload_uncertain','upload_started'].includes(known.receipt?.state)&&!receipt.video_id)throw Error('upload_uncertain_reconcile_without_reupload');
   if(attempt+1<polls)await sleep(10000);
  }
  throw Error(receipt.video_id?'uploaded_but_public_not_verified':'queue_did_not_confirm_upload');
 }catch(e){receipt.error=String(e.message).slice(0,250);receipt.failed_at=new Date().toISOString();save(receipt);throw e;}
}
