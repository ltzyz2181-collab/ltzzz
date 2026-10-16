import fs from 'node:fs';
import {prepareDailyBoard,syncDailyBoard} from './lib/daily-task-board.mjs';
import {pulseSnapshot,PULSE_URL} from './lib/pulse-client.mjs';
import {pulseToken} from './pulse-credentials.mjs';
import {cstDate} from '../workers/pulse-worker/tasks.js';
const root=process.cwd(),date=process.env.DAILY_DATE||cstDate();
const runKey=`${process.env.GITHUB_RUN_ID||'local'}:${process.env.GITHUB_RUN_ATTEMPT||'1'}`;
async function command(body){
 const token=pulseToken('qianwen');
 const r=await fetch(PULSE_URL+'/control',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({...body,reason:'Daily task claim and immutable delivery; no settlement'}),signal:AbortSignal.timeout(20000)});
 if(!r.ok)throw Error('pulse_operation_failed');
 return r.json();
}
async function readRemote(file){
 const r=await fetch(`https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main/${file}`,{signal:AbortSignal.timeout(15000),cache:'no-store'});
 if(!r.ok)throw Error('remote_artifact_unavailable');
 return Buffer.from(await r.arrayBuffer());
}
if(process.argv[2]==='prepare'){
 const control=JSON.parse(fs.readFileSync('knowledge/results/control/latest.json','utf8'));
 const record=await prepareDailyBoard({root,date,runKey,sourceCommit:process.env.GITHUB_SHA||'local',agents:['doubao','grok','deepseek'],control,snapshot:pulseSnapshot,command});
 console.log(JSON.stringify({date,seats:Object.fromEntries(Object.entries(record.seats).map(([a,s])=>[a,s.status]))}));
}else if(process.argv[2]==='sync'){
 const record=await syncDailyBoard({root,date,snapshot:pulseSnapshot,command,readRemote});
 console.log(JSON.stringify({date,seats:record?Object.fromEntries(Object.entries(record.seats).map(([a,s])=>[a,s.status])):{}}));
 if(Object.values(record?.seats||{}).some(s=>s.status==='sync_unknown'))process.exitCode=1;
}else throw Error('prepare_or_sync_required');
