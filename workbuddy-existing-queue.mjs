// Repair transport metadata only for the owner-supplied existing WorkBuddy item.
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
