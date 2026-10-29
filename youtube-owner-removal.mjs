// Bounded to the single video the owner explicitly requested to remove.
export const OWNER_REMOVAL=Object.freeze({task_id:'YOUTUBE-AUTOMATION-20261013',operation_id:'YOUTUBE-AUTOMATION-20261013-REMOVE-6FZYG2_TLzE',video_id:'6FZYG2_TLzE',expected_channel_id:'UCnKqseQ7uivSc7FN38ccRUA',video_sha256:'88e20925fb0e8b494422f3fefc7606b1046986b16c314a69ea06b5ae31fd1e24'});
export const removedVideoHash=hash=>hash===OWNER_REMOVAL.video_sha256;
const key='yt:owner-removal:'+OWNER_REMOVAL.operation_id;
export async function removeOwnerVideo(env,request,{refresh,fetchImpl=fetch}={}){
 const input=await request.json().catch(()=>null),o=OWNER_REMOVAL;
 const response=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
 if(!input||input.video_id!==o.video_id||input.expected_channel_id!==o.expected_channel_id||input.operation_id!==o.operation_id)return response({ok:false,error:'exact_authorized_removal_required',deleted:false},400);
 let record=await env.KV.get(key,'json')||{...o,deleted:false,absence_verified:false,requested_by:'owner_current_conversation',source_hash_evidence:'original_repository_publication_receipt_not_Google_byte_hash'};
 const save=async patch=>{record={...record,...patch,checked_at_utc:new Date().toISOString()};await env.KV.put(key,JSON.stringify(record));return record;};
 const raw=await env.KV.get('yt:default','json');if(!raw)return response({ok:false,error:'youtube_not_connected',deleted:false},401);
 const tokens=await refresh(env,raw,'default');
 const headers={Authorization:'Bearer '+tokens.access_token},url='https://www.googleapis.com/youtube/v3/videos';
 const lookup=async()=>{const r=await fetchImpl(url+'?part=snippet,status&id='+o.video_id,{headers,redirect:'manual',signal:AbortSignal.timeout(30000)});const j=await r.json().catch(()=>null);if(!r.ok||!Array.isArray(j?.items))throw Error('google_removal_readback_unavailable');return{http:r.status,item:j.items[0]||null};};
 let before;try{before=await lookup();}catch{return response({ok:false,...await save({last_error:'google_removal_readback_unavailable'}),deleted:false},502);}
 if(!before.item){await save({state:record.delete_http_status===204?'deleted_verified':'already_unavailable_without_delete_proof',deleted:record.delete_http_status===204,absence_verified:true,google_readback_http:before.http});return response({ok:true,...record});}
 if(before.item.id!==o.video_id||before.item.snippet?.channelId!==o.expected_channel_id)return response({ok:false,error:'video_channel_mismatch',deleted:false},409);
 await save({state:'delete_dispatch_started',before_channel_id:before.item.snippet.channelId,delete_started_at_utc:new Date().toISOString(),absence_verified:false});
 let removed;
 try{removed=await fetchImpl(url+'?id='+o.video_id,{method:'DELETE',headers,redirect:'manual',signal:AbortSignal.timeout(30000)});}catch{return response({ok:false,...await save({state:'delete_outcome_unknown_reconcile_first',deleted:false})},502);}
 if(removed.status!==204){const error=await removed.json().catch(()=>({})),reason=error.error?.errors?.[0]?.reason;await save({state:'google_delete_rejected',delete_http_status:removed.status,provider_reason:typeof reason==='string'?reason.replace(/[^a-zA-Z0-9_-]/g,'').slice(0,100):'google_delete_failed',deleted:false});return response({ok:false,...record},removed.status>=400?removed.status:502);}
 await save({state:'delete_accepted_pending_readback',delete_http_status:204,deleted:false});
 let after;try{after=await lookup();}catch{return response({ok:false,...record,error:'delete_accepted_readback_unavailable'},502);}
 await save({state:after.item?'delete_accepted_still_visible':'deleted_verified',absence_verified:!after.item,deleted:!after.item,google_readback_http:after.http});
 return response({ok:record.deleted,...record},record.deleted?200:502);
}
