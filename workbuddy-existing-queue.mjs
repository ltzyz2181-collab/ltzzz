// Admit and deterministically normalize only the owner-supplied existing WorkBuddy item.
export const WORKBUDDY_QUEUE_NAME='ltzzz-daily-2026-10-29';
const limit=25*1024*1024;
const json=(x,status=200)=>Response.json(x,{status,headers:{'Cache-Control':'no-store'}});
const digest=async b=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',b))).map(x=>x.toString(16).padStart(2,'0')).join('');
export async function existingWorkBuddyAsset(env,name){
 if(name!==WORKBUDDY_QUEUE_NAME)return json({ok:false,error:'exact_workbuddy_item_required'},400);
 const object=await env.VIDEOS.get('queue/'+name+'.mp4');if(!object)return json({ok:false,error:'existing_video_missing'},404);
 if(!object.size||object.size>limit)return json({ok:false,error:'video_size_invalid'},413);
 return new Response(object.body,{headers:{'Content-Type':'video/mp4','Cache-Control':'no-store','Content-Length':String(object.size)}});
}
export async function prepareExistingWorkBuddy(env,request){
 const body=await request.json().catch(()=>null),name=body?.name,expected=body?.expected_sha256;
 if(name!==WORKBUDDY_QUEUE_NAME||!/^[a-f0-9]{64}$/.test(expected||''))return json({ok:false,error:'exact_workbuddy_item_and_hash_required'},400);
 const metaKey='queue/'+name+'.meta.json',object=await env.VIDEOS.get('queue/'+name+'.mp4'),metaObject=await env.VIDEOS.get(metaKey);
 if(!object||!metaObject)return json({ok:false,error:'existing_video_or_metadata_missing'},404);
 const bytes=await object.arrayBuffer();if(!bytes.byteLength||bytes.byteLength>limit||await digest(bytes)!==expected)return json({ok:false,error:'existing_video_hash_or_size_mismatch'},409);
 let meta;try{meta=await metaObject.json();}catch{return json({ok:false,error:'existing_metadata_invalid'},400);}
 if(typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>100||typeof meta.description!=='string'||meta.description.length>4900)return json({ok:false,error:'existing_title_or_description_invalid'},400);
 if(meta.video_sha256&&meta.video_sha256!==expected||meta.bytes!==undefined&&meta.bytes!==bytes.byteLength||meta.publication_policy&&meta.publication_policy!=='public_ready')return json({ok:false,error:'existing_metadata_contradiction_no_overwrite'},409);
 const prior=await env.VIDEOS.get('receipts/youtube/'+expected+'.json');if(prior)return json({ok:false,error:'existing_publication_reconcile_only'},409);
 if(!metaObject.etag)return json({ok:false,error:'r2_etag_required'},503);
 if(meta.video_sha256!==expected||meta.bytes!==bytes.byteLength||meta.publication_policy!=='public_ready'){
  const oldHash=await digest(new TextEncoder().encode(JSON.stringify(meta)));
  const written=await env.VIDEOS.put(metaKey,JSON.stringify({...meta,name,title:meta.title.trim(),video_sha256:expected,bytes:bytes.byteLength,publication_policy:'public_ready',metadata_repaired_from_sha256:oldHash,metadata_repaired_at_utc:new Date().toISOString()}),{onlyIf:{etagMatches:metaObject.etag},httpMetadata:{contentType:'application/json'}});
  if(!written)return json({ok:false,error:'metadata_changed_reconcile_first'},409);
 }
 return json({ok:true,name,video_sha256:expected,bytes:bytes.byteLength,ready_for_existing_schedule:true,published:false,upload_triggered:false,video_bytes_changed:false});
}

export async function normalizeExistingWorkBuddy(env,request){
 const form=await request.formData(),name=form.get('name'),sourceHash=form.get('source_sha256'),video=form.get('video');
 if(name!==WORKBUDDY_QUEUE_NAME||sourceHash!=='a61a0f1113e4c4bb0a18c8020f0004cbf4a7d702fa555feffaabb73e0c9842a5'||!video?.arrayBuffer||!video.size||video.size>limit)return json({ok:false,error:'exact_workbuddy_normalization_required'},400);
 const [source,metaObject]=await Promise.all([env.VIDEOS.get('queue/'+name+'.mp4'),env.VIDEOS.get('queue/'+name+'.meta.json')]);
 if(!source||!source.etag||!metaObject||!metaObject.etag)return json({ok:false,error:'source_pair_or_etag_missing'},409);
 const original=await source.arrayBuffer(),normalized=await video.arrayBuffer(),normalizedHash=await digest(normalized);
 if(await digest(original)!==sourceHash||normalizedHash===sourceHash)return json({ok:false,error:'normalization_source_hash_mismatch'},409);
 const rawMeta=await metaObject.text();let meta;try{meta=JSON.parse(rawMeta);}catch{return json({ok:false,error:'source_metadata_invalid'},400);}
 if(typeof meta.title!=='string'||!meta.title.trim()||meta.title.length>100||typeof meta.description!=='string'||meta.description.length>4900||meta.video_sha256&&meta.video_sha256!==sourceHash||meta.bytes!==undefined&&meta.bytes!==original.byteLength||meta.publication_policy&&meta.publication_policy!=='public_ready')return json({ok:false,error:'source_metadata_contradiction'},409);
 return commitNormalizedQueueItem(env,{name,sourceHash,original,normalized,normalizedHash,sourceETag:source.etag,rawMeta,meta,metaETag:metaObject.etag});
}

// Called only after the fixed owner-supplied name and original bytes were verified.
export async function commitNormalizedQueueItem(env,{name,sourceHash,original,normalized,normalizedHash,sourceETag,rawMeta,meta,metaETag}){
 const receipt='receipts/youtube/'+sourceHash+'.json',marker={state:'source_normalized_not_for_publication',name,video_sha256:sourceHash,normalized_sha256:normalizedHash,normalized_bytes:normalized.byteLength,normalization:'scale_and_pad_720x1280_no_crop_audio_copied',at:new Date().toISOString(),published:false};
 const claim=await env.VIDEOS.put(receipt,JSON.stringify(marker),{onlyIf:{etagDoesNotMatch:'*'},httpMetadata:{contentType:'application/json'}});
 if(!claim)return json({ok:false,error:'source_publication_or_normalization_started_reconcile_only'},409);
 // Hold the original hash before changing either queue object. An interrupted
 // change remains blocked for reconciliation instead of sending either file twice.
 await env.VIDEOS.put('sources/workbuddy/'+sourceHash+'.mp4',original,{httpMetadata:{contentType:'video/mp4'}});
 await env.VIDEOS.put('sources/workbuddy/'+sourceHash+'.meta.json',rawMeta,{httpMetadata:{contentType:'application/json'}});
 const replaced=await env.VIDEOS.put('queue/'+name+'.mp4',normalized,{onlyIf:{etagMatches:sourceETag},httpMetadata:{contentType:'video/mp4'},customMetadata:{verified_sha256:normalizedHash,original_sha256:sourceHash}});
 if(!replaced)return json({ok:false,error:'source_changed_normalization_needs_reconciliation'},409);
 const updated=await env.VIDEOS.put('queue/'+name+'.meta.json',JSON.stringify({...meta,name,video_sha256:normalizedHash,bytes:normalized.byteLength,publication_policy:'public_ready',original_video_sha256:sourceHash,normalization:marker.normalization}),{onlyIf:{etagMatches:metaETag},httpMetadata:{contentType:'application/json'}});
 if(!updated)return json({ok:false,error:'metadata_changed_normalization_needs_reconciliation'},409);
 return json({ok:true,name,source_sha256:sourceHash,video_sha256:normalizedHash,bytes:normalized.byteLength,original_preserved:true,ready_for_existing_schedule:true,published:false,upload_triggered:false});
}
