#!/usr/bin/env node
/** Format native-daily scheduling separately from a seat's current role. */
import fs from 'node:fs';import path from 'node:path';import {fileURLToPath,pathToFileURL} from 'node:url';
const ROOT=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function watchdogSummary(j,{registry={},sourceFile='data/results/<date>.json'}={}){
 const cm=j.core_memory||{},lines=[`generated_at   = ${j.generated_at}`,`execution_id   = ${j.execution_id}`,`core_memory    = ${cm.status} (${cm.loaded_files}/${cm.total_files})`,`daily_source   = ${sourceFile} / tasks[].status (API schedule, not role status)`,'role_source    = identity/seat-registry.json / seats[].work_status','seats:'];
 const external=new Set(['external_discussion_only','external_daily_return']);
 for(const t of j.tasks||[]){
  const r=registry.seats?.[t.agent]||{},mark=t.status==='success'?'OK  ':external.has(t.status)?'EXT ':['skipped','disabled_by_owner'].includes(t.status)?'SKIP':'FAIL';
  lines.push(`  [${mark}] ${t.agent}: daily_mode=${t.status}; role=${r.work_status||t.role_status||'unverified'}; native_api=${r.native_api_status||'not_checked'}; delivery_channel=${r.delivery_channel||t.delivery_channel||'unspecified'}`);
 }
 const fails=(j.failures||[]).filter(x=>!['disabled_by_owner',...external].includes(x.status)&&!(j.tasks||[]).some(t=>t.agent===x.agent&&['disabled_by_owner',...external].includes(t.status)));
 if(fails.length){lines.push('failures:');for(const x of fails)lines.push(`  - ${x.agent}: ${String(x.error||'').slice(0,120)}`);}
 return '```\n'+lines.join('\n')+'\n```';
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 const f=process.argv[2];if(!f||f==='none'||!fs.existsSync(f))console.log('**无任何日课结果文件 —— 日课链路已断，需总控介入。**');
 else{let registry={};try{registry=JSON.parse(fs.readFileSync(path.join(ROOT,'identity/seat-registry.json')));}catch{}console.log(watchdogSummary(JSON.parse(fs.readFileSync(f,'utf8')),{registry,sourceFile:f}));}
}
