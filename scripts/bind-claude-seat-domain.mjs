import fs from 'node:fs';
const host='api-claude.ltzzz.com',service='ltzzz-claude-seat',account=process.env.CLOUDFLARE_ACCOUNT_ID,token=process.env.CLOUDFLARE_API_TOKEN;
const report={at:new Date().toISOString(),hostname:host,service,model_calls:0,transactions:0,other_routes_changed:false};
const api=async(path,body)=>{const r=await fetch('https://api.cloudflare.com/client/v4'+path,{method:body?'PUT':'GET',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(30000)});const d=await r.json();return {http:r.status,ok:r.ok&&d.success===true,result:d.result,codes:(d.errors||[]).map(e=>e.code)};};
try{
 if(!account||!token)throw Error('cloudflare_binding_credentials_not_configured');
 const listed=await api('/accounts/'+account+'/workers/domains');report.list_http=listed.http;
 if(!listed.ok)throw Error('custom_domain_list_permission_or_API_failure');
 const existing=listed.result.find(d=>d.hostname===host);
 if(existing&&existing.service!==service)throw Error('existing_domain_belongs_to_other_service_not_overwritten');
 if(existing){report.status='custom_domain_already_bound';}
 else{
  let zoneId=listed.result.find(d=>d.zone_name==='ltzzz.com'||d.hostname?.endsWith('.ltzzz.com'))?.zone_id;
  if(!zoneId){const zones=await api('/zones?name=ltzzz.com');if(zones.ok)zoneId=zones.result.find(z=>z.name==='ltzzz.com')?.id;}
  if(!zoneId)throw Error('zone_id_unavailable_without_broadening_credentials');
  const bound=await api('/accounts/'+account+'/workers/domains',{hostname:host,service,environment:'production',zone_id:zoneId});report.bind_http=bound.http;report.cloudflare_error_codes=bound.codes;
  if(!bound.ok)throw Error('custom_domain_binding_rejected');report.status='custom_domain_bound_pending_public_probe';
 }
}catch(e){report.status='worker_available_domain_binding_blocked';report.blocker=e.message;}
fs.mkdirSync('knowledge/results/identity',{recursive:true});fs.writeFileSync('knowledge/results/identity/claude-domain-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
