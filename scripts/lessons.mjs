#!/usr/bin/env node
// Usage:
//   node scripts/lessons.mjs validate
//   node scripts/lessons.mjs retrieve --tags a,b [--active-only]
//   node scripts/lessons.mjs check-preflight <preflight.json> --tags a,b
//   node scripts/lessons.mjs recurrence <failure.json>     ({"error_class":"...","signature":"..."})
//   node scripts/lessons.mjs draft <receipt.json> --agent <provider> --reporter <provider> [--class c] [--signature s] [--tags a,b]
//   node scripts/lessons.mjs stats
import fs from 'node:fs';
import {loadLessons,retrieve,checkConsidered,matchRecurrence,stats,draftFromReceipt} from './lib/lessons.mjs';
const [cmd,...rest]=process.argv.slice(2);
const flag=(n,d=null)=>{const i=rest.indexOf('--'+n);return i<0?d:rest[i+1];};
const dir=flag('dir','knowledge/lessons');
const {lessons,problems}=loadLessons(dir);
const out=o=>console.log(JSON.stringify(o,null,2));
try{
  if(cmd==='validate'){out({lessons:lessons.length,problems});process.exitCode=problems.length?1:0;}
  else if(problems.length){out({problems});process.exitCode=1;}
  else if(cmd==='retrieve')out(retrieve(lessons,{tags:(flag('tags','')||'').split(',').filter(Boolean),includeObserved:!rest.includes('--active-only')}));
  else if(cmd==='check-preflight'){const errs=checkConsidered(JSON.parse(fs.readFileSync(rest[0],'utf8')),lessons,(flag('tags','')||'').split(',').filter(Boolean));out({errors:errs});process.exitCode=errs.length?1:0;}
  else if(cmd==='recurrence')out(matchRecurrence(lessons,JSON.parse(fs.readFileSync(rest[0],'utf8'))));
  else if(cmd==='draft')out(draftFromReceipt(rest[0],{agentProvider:flag('agent'),reporterProvider:flag('reporter'),errorClass:flag('class','other'),signature:flag('signature','needs_signature'),tags:(flag('tags','needs_tags')).split(',')}));
  else if(cmd==='stats')out(stats(lessons));
  else{console.error('commands: validate | retrieve | check-preflight | recurrence | draft | stats');process.exitCode=2;}
}catch(e){console.error('lessons_error:',e.message);process.exitCode=1;}
