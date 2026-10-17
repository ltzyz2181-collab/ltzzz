import crypto from 'node:crypto';
import {SCHEDULER} from './video-queue-client.mjs';

export const sha256=bytes=>crypto.createHash('sha256').update(bytes).digest('hex');
export function validateVideoInput({bytes,meta,name}){
 if(!/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(name||''))throw Error('invalid_queue_name');
 if(!bytes?.length||bytes.length>25*1024*1024)throw Error('invalid_video_size');
 if(!meta||typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>100||typeof meta.description!=='string'||meta.description.length>4900)throw Error('invalid_title_or_description');
 const hash=sha256(bytes);
 if(meta.video_sha256&&meta.video_sha256!==hash)throw Error('video_hash_mismatch');
 // Never forward unrelated JSON fields or credentials from a local metadata file.
 return {title:meta.title.trim(),description:meta.description,video_sha256:hash,
  ...(typeof meta.created==='string'?{created:meta.created}:{}),
  ...(typeof meta.generation_method==='string'?{generation_method:meta.generation_method}:{})};
}
export async function queueOnlyVideo({bytes,meta,name,token,receipt={},save=()=>{},fetchImpl=fetch}){
 Object.assign(receipt,{name,uploaded_to_queue:false,queue_readback_verified:false,published:false,model_calls:0,at:new Date().toISOString()});
 const saveNow=()=>save(structuredClone(receipt));
 try{
  if(!token)throw Error('LTZZZ_AGENT_TOKEN_missing');
  if(/^cfut_/i.test(token))throw Error('Cloudflare_token_is_not_queue_identity');
  const clean=validateVideoInput({bytes,meta,name}),hash=clean.video_sha256;
  Object.assign(receipt,{video_sha256:hash,bytes:bytes.length});saveNow();
  const request=async(path,body)=>{
   let r;try{r=await fetchImpl(SCHEDULER+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+token},body,signal:AbortSignal.timeout(body?180000:30000),redirect:'error'});}catch{throw Error(body?'queue_upload_transport_uncertain_reconcile_before_retry':'queue_read_transport_failed');}
   let data;try{data=await r.json();}catch{throw Error('queue_non_json_http_'+r.status);}
   if(!r.ok)throw Error('queue_http_'+r.status+'_'+String(data.error||'request_failed').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,80));
   if(!data.ok)throw Error('queue_response_not_ok');return data;
  };
  const check=()=>request('/queue/item?name='+encodeURIComponent(name));
  let item=await check();
  // Reconcile content before retrying a previously interrupted POST.
  if(item.queued&&item.video_sha256!==hash)throw Error('queue_name_conflict');
  if(!item.queued){
   const known=await request('/queue/status?sha256='+hash);
   if(known.receipt){
    receipt.phase='publication_already_started';receipt.publication_receipt=known.receipt;saveNow();
    throw Error('publication_already_started_reconcile_without_reupload');
   }
   const form=new FormData();form.set('video',new Blob([bytes],{type:'video/mp4'}),name+'.mp4');form.set('meta',JSON.stringify(clean));
   receipt.phase='queue_upload_started';saveNow();
   const result=await request('/queue/upload/'+name,form);
   receipt.queue_upload_response=result;saveNow();
   if(result.status!=='queued'||result.name!==name||result.video_sha256!==hash||result.bytes!==bytes.length)throw Error('queue_upload_requires_reconciliation');
   item=await check();
  }
  receipt.queue_readback=item;
  if(!item.queued||item.video_sha256!==hash||item.bytes!==bytes.length||item.metadata?.video_sha256!==hash||item.metadata?.title!==clean.title||item.metadata?.description!==clean.description)throw Error('queue_readback_mismatch');
  Object.assign(receipt,{phase:'queued_readback_verified',uploaded_to_queue:true,queue_readback_verified:true,queue_keys:[`queue/${name}.mp4`,`queue/${name}.meta.json`]});saveNow();return receipt;
 }catch(error){receipt.error=String(error.message).slice(0,200);receipt.failed_at=new Date().toISOString();saveNow();throw error;}
}
