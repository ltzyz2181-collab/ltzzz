import {createHash} from 'node:crypto';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export const localDay=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export function admission({day,packet,video,caption,publication}){
 if(publication?.account==='ltzyz2181'&&publication?.published===true&&/^https:\/\/(?:www\.)?instagram\.com\/(?:p|reel)\/[A-Za-z0-9_-]+\/?/.test(publication.permalink||''))return 'already_published_do_not_repeat';
 if(publication?.permalink||publication?.uploaded===true)return 'publication_uncertain_do_not_repeat';
 if(packet?.day!==day)return 'blocked_stale_package';
 if(packet.account!=='ltzyz2181'||packet.status!=='ready_for_manus_publish')return 'blocked_wrong_account_or_state';
 if(sha(video)!==packet.sha256)return 'blocked_hash_mismatch';
 if(!caption.includes('https://ltzyz.gumroad.com/l/ugyhy?layout=profile')||/[\u4e00-\u9fff]/.test(caption))return 'blocked_caption';
 if(packet.format?.video!=='h264'||packet.format?.audio!=='aac'||packet.format.width!==720||packet.format.height!==1280)return 'blocked_format';
 return 'ready';
}
export async function pushManus(record,{key,token,prompt,fetcher=fetch,save=async()=>{}}){
 if(record.remote_task_id||record.request_started_at)return record;
 if(!key&&!token){record.status='blocked_manus_api_not_configured';record.remote_task_created=false;await save(record);return record;}
 record.status='request_started_completion_unknown';record.request_started_at=new Date().toISOString();await save(record);
 try{
  const r=await fetcher('https://api.manus.ai/v2/task.create',{method:'POST',headers:{'Content-Type':'application/json',...(key?{'x-manus-api-key':key}:{Authorization:'Bearer '+token})},body:JSON.stringify({title:'LTZZZ Instagram '+record.day,agent_profile:'lite',interactive_mode:false,share_visibility:'private',message:{content:prompt}}),signal:AbortSignal.timeout(45000)});
  const data=await r.json().catch(()=>({}));record.http=r.status;
  if(!r.ok||data.ok!==true||typeof data.task_id!=='string'){record.status='blocked_manus_task_rejected';record.error_code=String(data.error?.code||'invalid_task_response').replace(/[^A-Za-z0-9_-]/g,'').slice(0,80);}
  else{record.status='remote_task_created_publication_unverified';record.remote_task_created=true;record.remote_task_id=data.task_id;record.remote_task_url=/^https:\/\/manus\.(?:im|ai)\//.test(data.task_url||'')?data.task_url:null;}
 }catch{record.status='remote_request_outcome_unknown_do_not_repeat';}
 await save(record);return record;
}
