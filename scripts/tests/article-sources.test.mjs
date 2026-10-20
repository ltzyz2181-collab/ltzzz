import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {gatherArticleSources} from '../lib/article-sources.mjs';
function fixture(){const root=fs.mkdtempSync(path.join(os.tmpdir(),'article-sources-'));return {root,write:(file,data)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),JSON.stringify(data));},close:()=>fs.rmSync(root,{recursive:true,force:true})};}
test('current hire evidence precedes history and excludes old economic experiments and embedded output copies',()=>{
 const f=fixture();try{
  f.write('results/agi-econ/old.json',{text:'Old all payments zero and IP block'});
  f.write('knowledge/results/claude-team/real-hire-20261020.json',{date:'2026-10-20',mode:'internal',paid:false,status:'internal_engineering_artifact_accepted',evidence:[{utf8:'Duplicated raw model output'}]});
  const r=gatherArticleSources({root:f.root,date:'2026-10-20'});assert.equal(r.sources.length,1);assert.match(r.text,/internal_engineering_artifact_accepted/);assert.doesNotMatch(r.text,/Old all payments|Duplicated raw/);assert.match(r.sources[0].sha256,/^[a-f0-9]{64}$/);
 }finally{f.close();}
});
test('a falsely dated source is excluded and historical publication is explicitly scoped',()=>{
 const f=fixture();try{
  f.write('knowledge/results/ans-cycle/2026-10-20.json',{date:'2026-10-01',status:'old blockage'});
  f.write('results/publishing/youtube-manual-2026-10-19.json',{published:true,video_id:'confirmed'});
  f.write('results/publishing/youtube-manual-2026-10-20.json',{published:false,video_id:'pending'});
  const r=gatherArticleSources({root:f.root,date:'2026-10-20'});assert.equal(r.sources.length,1);assert.match(r.sources[0].scope,/historical/);assert.match(r.text,/confirmed/);assert.doesNotMatch(r.text,/old blockage|pending/);
 }finally{f.close();}
});
test('actual deployment receipts stay separate from the generated draft deployment flag',()=>{
 const f=fixture();try{
  f.write('knowledge/results/claude-team/real-hire-20261020.json',{date:'2026-10-20',deployed:false});
  f.write('knowledge/results/pulse/deploy-100.json',{run_id:'100',status:'deployed_and_live_observations_recorded',health:{version:'current'},public_status:{unneeded:'large snapshot'}});
  f.write('knowledge/results/pulse/deploy-101.json',{run_id:'101',status:'blocked_deployment_or_acceptance'});
  const r=gatherArticleSources({root:f.root,date:'2026-10-20'});assert.equal(r.sources.length,2);assert.match(r.text,/"deployed":false/);assert.match(r.text,/actual_component_deployment_not_the_generated_ANS_patch/);assert.match(r.text,/"version":"current"/);assert.doesNotMatch(r.text,/large snapshot|blocked_deployment/);
 }finally{f.close();}
});
