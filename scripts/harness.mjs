#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {publicObservation,summarize,reflectionContext,receiptTitle} from './lib/reflection-harness.mjs';
const [mode,...args]=process.argv.slice(2);
const git=(...a)=>execFileSync('git',a,{maxBuffer:4*1024*1024});
const sourceFile='knowledge/results/external-markets/m1/2hives-application-20261027.json';
try{
 if(mode==='before')console.log(JSON.stringify(reflectionContext({tags:args.length?args[0].split(','):undefined}),null,2));
 else if(mode==='title')console.log(receiptTitle(JSON.parse(fs.readFileSync(args[0],'utf8'))));
 else if(mode==='observe'){
  const commit=args[0];if(!/^[a-f0-9]{40}$/.test(commit||''))throw Error('full_commit_required');
  const files=git('ls-tree','-r','--name-only',commit,'knowledge/results/ans-cycle','knowledge/results/harness-input',sourceFile).toString().trim().split('\n').filter(f=>/^knowledge\/results\/ans-cycle\/\d{4}-\d{2}-\d{2}\.json$/.test(f)||/^knowledge\/results\/harness-input\/[A-Za-z0-9_-]+\.json$/.test(f)||f===sourceFile).sort().slice(-120);
  const directory='knowledge/learning/events';fs.mkdirSync(directory,{recursive:true});let changed=0;
  const ancestry={checked:0,disjoint:0};
  for(const file of files){
   const type=git('ls-tree',commit,'--',file).toString();if(!type.startsWith('100644 blob '))throw Error('regular_blob_required');
   const bytes=git('show',commit+':'+file);if(bytes.length>1024*1024)throw Error('receipt_too_large');
   // Pin the latest actual modification, not a later observer commit (prevents churn).
   const sourceCommit=git('log','-1','--format=%H',commit,'--',file).toString().trim();
   const event=publicObservation(JSON.parse(bytes),{file,commit:sourceCommit,bytes});if(!event)continue;
   const target=path.join(directory,event.id+'.json'),text=JSON.stringify(event,null,2)+'\n';
   if(fs.existsSync(target)){
    const prior=JSON.parse(fs.readFileSync(target,'utf8'));
    if(prior.source.commit!==event.source.commit){
     ancestry.checked++;
     // A disjoint/rewritten history is recorded, not treated as invalid provenance:
     // the observation is append-only and the gap itself is the evidence to reconcile.
     try{execFileSync('git',['merge-base','--is-ancestor',prior.source.commit,event.source.commit],{stdio:'pipe'});}
     catch{ancestry.disjoint++;}
    }
   }
   if(!fs.existsSync(target)||fs.readFileSync(target,'utf8')!==text){fs.writeFileSync(target,text);changed++;}
  }
  const events=fs.readdirSync(directory).filter(f=>/^[a-f0-9]{64}\.json$/.test(f)).sort().map(f=>JSON.parse(fs.readFileSync(path.join(directory,f),'utf8')));
  const summary=summarize(events);fs.writeFileSync('knowledge/learning/summary.json',JSON.stringify(summary,null,2)+'\n');
  console.log(JSON.stringify({observed_files:files.length,changed_events:changed,attempts:summary.attempts,issues:summary.issues,ancestry_checked:ancestry.checked,ancestry_disjoint:ancestry.disjoint,model_calls:0,financial_execution:false}));
 }else throw Error('usage_before_observe_title');
}catch{console.error('harness_failed: input or provenance invalid; no automatic retry or external action');process.exitCode=1;}
