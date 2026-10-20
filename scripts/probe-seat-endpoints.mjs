import fs from 'node:fs';import dns from 'node:dns/promises';import {loadSeats,buildSeatArtifacts} from './lib/seat-registry.mjs';
const registry=loadSeats(),run=process.env.GITHUB_RUN_ID||'local',observed_at=new Date().toISOString();
async function inspectOnce(url,{kind,id}){
 const result={url,kind,observed_at:new Date().toISOString(),generation_verified:false};
 try{result.dns_addresses=(await dns.lookup(new URL(url).hostname,{all:true})).map(x=>x.address);result.dns_verified=true;}
 catch(e){result.dns_verified=false;result.dns_error=String(e.code||'DNS_ERROR').slice(0,50);return {...result,healthy:false,status:'dns_not_resolved_from_this_runner'};}
 try{
  const r=await fetch(url,{redirect:'follow',signal:AbortSignal.timeout(12000)});result.http=r.status;result.content_type=r.headers.get('Content-Type');const d=await r.json();
  if(kind==='health'){result.public_health=Object.fromEntries(['ok','service','engine','did','has_key','key_configured','model_configured','metadata_only','native_generation_verified','native_api_status'].filter(k=>k in d).map(k=>[k,d[k]]));result.healthy=r.ok&&d.ok===true&&(!d.did||d.did==='did:ltzzz:'+id);}
  else{result.did=d.id;result.work_status=d.work_status;result.healthy=r.ok&&d.id==='did:ltzzz:'+id&&d.metadata_only===true;}
  result.status=result.healthy?'http_json_verified':'http_or_identity_not_verified';
 }catch(e){result.healthy=false;result.status='fetch_failed_from_this_runner';result.error_code=String(e.cause?.code||e.name||'FETCH_ERROR').replace(/[^A-Za-z0-9_]/g,'').slice(0,50);}
 return result;
}
async function inspect(url,options){
 const observations=[];let last;
 for(let attempt=0;attempt<3;attempt++){
  const r=await inspectOnce(url,options);last=r;observations.push({at:r.observed_at,http:r.http??null,status:r.status});
  if(r.healthy||options.kind==='health')return {...r,attempts:observations};
  if(attempt<2)await new Promise(resolve=>setTimeout(resolve,4000));
 }
 return {...last,attempts:observations};
}
const report={observed_at,run_id:run,source_commit:process.env.GITHUB_SHA,vantage:'GitHub Actions runner; public DNS and GET only',model_calls:0,transactions:0,seats:{},cards:[]};
for(const [id,s] of Object.entries(registry.seats)){
 const observations=await Promise.all(s.health_urls.map(url=>inspect(url,{kind:'health',id})));
 report.seats[id]={status:s.work_status==='temporarily_removed'?'intentionally_temporarily_removed':observations.some(r=>r.healthy)?'healthy_endpoint_verified':'no_healthy_endpoint_verified',healthy_url:observations.find(r=>r.healthy)?.url||null,observations};
 report.cards.push(...await Promise.all([inspect(s.card_url,{kind:'card',id}),inspect(s.card_url.replace(/\.json$/,''),{kind:'legacy_card',id})]));
}
for(const [id,s] of Object.entries(registry.seats))for(const alias of s.aliases||[]){const url=s.card_url.replace('/'+id+'/','/'+alias+'/');report.cards.push(...await Promise.all([inspect(url,{kind:'card',id}),inspect(url.replace(/\.json$/,''),{kind:'legacy_card',id})]));}
report.health_transport_count=Object.values(report.seats).filter(s=>s.healthy_url).length;report.active_ai_roles=Object.values(registry.seats).filter(s=>s.work_status!=='temporarily_removed').length;
report.metadata_cards_verified=report.cards.filter(x=>x.healthy).length;
report.native_model_availability_not_inferred=true;
report.status=report.metadata_cards_verified===report.cards.length&&report.health_transport_count===report.active_ai_roles?'readback_complete':'readback_complete_with_unverified_endpoints';
report.unverified_card_urls=report.cards.filter(x=>!x.healthy).map(x=>x.url);
fs.mkdirSync('knowledge/results/identity',{recursive:true});
fs.writeFileSync('identity/endpoint-status.json',JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('knowledge/results/identity/endpoint-probe-'+run+'.json',JSON.stringify(report,null,2)+'\n');
buildSeatArtifacts();console.log(JSON.stringify({run_id:run,health_transport_count:report.health_transport_count,active_ai_roles:report.active_ai_roles,metadata_cards_verified:report.metadata_cards_verified,cards_checked:report.cards.length,model_calls:0,transactions:0}));
