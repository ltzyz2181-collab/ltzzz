#!/usr/bin/env node
// Stage 1: public GETs and a LOCAL payload preview. No credentials, POST,
// registration, reservation, live bounty or payment are implemented here.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL} from 'node:url';import {createHash,randomUUID} from 'node:crypto';
const BASE='https://rentahuman.ai/api';
const isGuangzhou=h=>{const loc=h?.location||{};return /guangzhou|广州/i.test([loc.city,loc.state].filter(Boolean).join(' '));};
const list=body=>[body?.humans,body?.results,body?.data].find(Array.isArray)||null;
async function get(url,fetcher){
 try{const r=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(30000)});if(!r.ok)return {http:r.status,ok:false,error:'public_http_error'};const body=await r.json();if(!body||typeof body!=='object')throw Error('invalid_json');return {http:r.status,ok:true,body};}catch{return {http:null,ok:false,error:'public_transport_or_json_error'};}
}
export async function runStage1({wantDryRun=false,fetcher=fetch,now=()=>new Date().toISOString()}={}){
 const report={at:now(),stage:1,mode:'public_get_and_local_preview_only',status:'public_probe_completed',paid:false,live_order:false,remote_mutation_requests:0,credentials_used:false,model_calls:0,service_fee:{status:'not_revalidated_by_this_probe',prior_review_claim:0.18,source:'https://rentahuman.ai/llms.txt',note:'18% is a prior review claim, not a fresh price verification or payment authorization.'},queries:{},dry_run:null,observations:[]};
 const queries=[['stats',BASE+'/stats'],['humans_default',BASE+'/humans?limit=10'],['humans_location_guangzhou',BASE+'/humans?location=Guangzhou&limit=20'],['humans_search_guangzhou',BASE+'/humans/search?q=Guangzhou&limit=20']];
 const found=new Map();
 for(const [name,url] of queries){
  let r=await get(url,fetcher);
  if(name==='humans_search_guangzhou'&&[404,405].includes(r.http))r=await get(BASE+'/search?q=Guangzhou&limit=20',fetcher);
  const row={http:r.http,ok:r.ok,error:r.error||null};
  if(name==='stats'&&r.ok){row.metrics={};for(const k of ['siteVisits','agentsConnected','humansAvailable','bountiesTotal']){if(typeof r.body[k]==='number'&&Number.isFinite(r.body[k])&&r.body[k]>=0)row.metrics[k]=r.body[k];}if(!Object.keys(row.metrics).length){row.ok=false;row.error='stats_shape_unverified';}}
  else if(r.ok){const people=list(r.body);if(!people){row.ok=false;row.error='profile_list_shape_unverified';}else{row.returned_count=people.length;row.guangzhou_match_count=people.filter(isGuangzhou).length;for(const h of people.filter(isGuangzhou)){if(typeof h.id==='string'&&/^[A-Za-z0-9_-]{1,120}$/.test(h.id))found.set(h.id,{id:h.id,city:'Guangzhou',country:typeof h.location?.country==='string'&&/^[A-Z]{2}$/.test(h.location.country)?h.location.country:null});}}}
  report.queries[name]=row;if(!row.ok)report.status='public_probe_partial_failure';
 }
 report.guangzhou_matches={count:found.size,sample:[...found.values()].slice(0,5),scope:'Sampled public city fields only; not a complete worker census or proof of hiring/availability.'};
 if(!found.size)report.observations.push('No verified Guangzhou city match in this public sample; do not infer that no workers exist.');
 if(wantDryRun){
  const payload={title:'LTZZZ public information preview',description:'Summarize the title and URL of one public webpage.',worker_pay_usd:2,currency:'USD',task_kind:'public_webpage_summary'};
  report.dry_run={attempted:false,mode:'local_payload_preview_only',remote_request_attempted:false,live_order:false,payload,payload_sha256:createHash('sha256').update(JSON.stringify(payload)).digest('hex'),price_verified:false,note:'This is not the provider dryRun API. No POST is sent; provider preview, fees, authorization, idempotent booking and payment require a separately verified executor.'};
 }
 return report;
}
async function main(){
 const options=process.argv.slice(2);if(options.some(v=>v!=='--dry-run'))throw Error('unknown_stage1_option');
 const r=await runStage1({wantDryRun:options.includes('--dry-run')}),dir='knowledge/results/rentahuman';fs.mkdirSync(dir,{recursive:true});const file=path.join(dir,'stage1-probe-'+Date.now()+'-'+randomUUID()+'.json');fs.writeFileSync(file,JSON.stringify(r,null,2)+'\n',{flag:'wx'});
 console.log(JSON.stringify({ok:r.status==='public_probe_completed',outFile:file,status:r.status,remote_mutation_requests:0,paid:false}));if(r.status!=='public_probe_completed')process.exitCode=1;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(()=>{console.error('Stage1 probe failed; no booking or payment executor exists.');process.exitCode=1;});
