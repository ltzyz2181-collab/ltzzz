import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {reviewRequest,reviewContext,reviewContextParts,inspectClaude,selectReviewModel,executeReview,digest,REVIEW_LIMITS} from '../lib/claude-review.mjs';
const env={GITHUB_REPOSITORY:'ltzyz2181-collab/ltzzz',GITHUB_ACTOR:'ltzyz2181-collab',GITHUB_EVENT_NAME:'push',GITHUB_REF:'refs/heads/main'};
const record=()=>({mode:'review',status:'claimed_before_api',model_calls:0,model:'claude-haiku-test',context:{prompt:'Review public data only'}});
test('inspection is default; review allows authenticated main-branch executor dispatch and safe task identifiers',()=>{
 assert.equal(reviewRequest(env).mode,'inspect');
 for(const patch of [{CLAUDE_REVIEW_MODE:'review'},{CLAUDE_REVIEW_TASK_ID:'../../secrets'},{GITHUB_REPOSITORY:'other/repo'},{CLAUDE_REVIEW_TOPIC:'../../.env'}])assert.throws(()=>reviewRequest({...env,...patch}));
 assert.equal(reviewRequest({...env,CLAUDE_REVIEW_MODE:'review',GITHUB_EVENT_NAME:'workflow_dispatch'}).mode,'review');
 assert.equal(reviewRequest({...env,CLAUDE_REVIEW_MODE:'review',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'github-actions[bot]'}).mode,'review');
 assert.throws(()=>reviewRequest({...env,CLAUDE_REVIEW_MODE:'review',GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_REF:'refs/heads/other'}));
});
test('readiness only calls native models GET; never fabricates API credit or generation success',async()=>{
 let calls=0;const r=await inspectClaude('fixture',{fetcher:async(url,o)=>{calls++;assert.equal(url,'https://api.anthropic.com/v1/models?limit=100');assert.equal(o.method,undefined);assert.equal(o.headers['x-api-key'],'fixture');return Response.json({data:[{id:'claude-haiku-test'},{id:'unsafe?key=foo'}]});}});
 assert.equal(calls,1);assert.equal(r.model_calls,0);assert.equal(r.generation_verified,false);assert.equal(r.credits_status,'unknown');assert.deepEqual(r.model_ids,['claude-haiku-test']);
 assert.equal((await inspectClaude('')).status,'missing_secret');
});
test('readiness rejects auth and network without exposing credentials or error text',async()=>{
 const a=await inspectClaude('secret-fixture',{fetcher:async()=>Response.json({error:{message:'secret-fixture'}},{status:401})});assert.equal(a.status,'catalogue_rejected');assert.equal(JSON.stringify(a).includes('secret-fixture'),false);
 const n=await inspectClaude('secret-fixture',{fetcher:async()=>{throw Error('secret-fixture')}});assert.equal(n.status,'network_or_timeout');assert.equal(JSON.stringify(n).includes('secret-fixture'),false);
});
test('select a catalogue-backed lighter Claude; never choose a made-up model or silently pick Opus',()=>{
 const ids=['claude-opus-test','claude-sonnet-test','claude-haiku-test'];assert.equal(selectReviewModel(ids),'claude-haiku-test');assert.equal(selectReviewModel(ids,'claude-sonnet-test'),'claude-sonnet-test');assert.equal(selectReviewModel(ids,'fake-model'),null);assert.equal(selectReviewModel(ids,'claude-opus-test'),null);
});
test('context packs preserve full sources and hashes; missing Pulse code is explicit',()=>{
 const r=reviewContext(process.cwd(),'ans-pulse');assert.equal(r.files.length,2);assert.ok(r.prompt.includes('源代码zip未收到'));assert.equal(r.prompt_sha256,digest(r.prompt));
 for(const f of r.files)assert.equal(f.sha256,digest(fs.readFileSync(f.file,'utf8')));
 const parts=reviewContextParts(process.cwd(),'six-memory');
 for(const p of parts){assert.equal(p.files.length,6);assert.ok(p.input_chars<=32000);assert.equal(p.prompt_sha256,digest(p.prompt));assert.equal(p.complete_source_in_this_part,parts.length===1);}
 for(const file of parts[0].files){let end=0;const text=fs.readFileSync(file.file,'utf8');for(const p of parts)for(const c of p.chunks.filter(c=>c.file===file.file)){assert.equal(c.start_char,end);const slice=text.slice(c.start_char,c.end_char);assert.equal(c.chunk_sha256,digest(slice));assert(p.prompt.includes(slice));end=c.end_char;}assert.equal(end,text.length);assert.equal(file.sha256,digest(text));}
});
test('large Unicode source is losslessly split without raising limits or auto-calling a provider',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'claude-parts-'));fs.mkdirSync(path.join(root,'ltzzz-memory'));
 const names=['魄','识神','梦境数据库','文明研究','项目历史','重要事件'];
 try{for(const n of names)fs.writeFileSync(path.join(root,'ltzzz-memory',n+'.md'),'甲😀\r\n'.repeat(9000));
 const parts=reviewContextParts(root,'six-memory');assert(parts.length>6);assert.equal(REVIEW_LIMITS.max_input_chars,32000);assert.equal(REVIEW_LIMITS.max_generation_calls,1);
 for(const f of parts[0].files){const original=fs.readFileSync(path.join(root,f.file),'utf8');const slices=parts.flatMap(p=>p.chunks.filter(c=>c.file===f.file).map(c=>original.slice(c.start_char,c.end_char)));assert.equal(Buffer.compare(Buffer.from(slices.join('')),Buffer.from(original)),0);for(const s of slices){assert(!/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/.test(s));}}
 assert.equal(reviewContext(root,'six-memory',{part:2}).part_index,2);assert.throws(()=>reviewContext(root,'six-memory',{part:parts.length+1}),/out_of_range/);
 }finally{fs.rmSync(root,{recursive:true});}
});
test('batch selection is authenticated request data, not permission to run all batches',()=>{
 assert.equal(reviewRequest({...env,CLAUDE_REVIEW_PART:'2'}).part,2);
 for(const value of ['0','-1','NaN','1.5','100001'])assert.throws(()=>reviewRequest({...env,CLAUDE_REVIEW_PART:value}),/invalid_context_part/);
});
test('durable checkpoint happens before a single generation; complete output remains pending review and redacts key',async()=>{
 const r=record(),states=[];let calls=0;
 await executeReview(r,{apiKey:'secret-fixture',onCheckpoint:async x=>states.push(x.status),call:async o=>{calls++;assert.deepEqual(states,['calling_api_outcome_unknown']);assert.equal(o.maxTokens,1600);return {ok:true,output:'Evidence and limit: secret-fixture\n【交付结束】',finish_reason:'end_turn',model:'claude-haiku-test',tokens_used:9};}});
 assert.equal(calls,1);assert.equal(r.status,'submitted_pending_review');assert.equal(r.model_calls,1);assert.equal(r.actual_model,'claude-haiku-test');assert.equal(r.output.includes('secret-fixture'),false);assert.equal(r.output_sha256,digest(r.output));
 await assert.rejects(executeReview(r,{}),/unused_claim_required/);
});
test('external-hire context requires all four actual receipts and records each full input hash',()=>{
 fs.mkdirSync('work',{recursive:true});const root=fs.mkdtempSync(path.resolve('work/claude-hire-context-'));
 try{
  assert.throws(()=>reviewContext(root,'external-hire'),/ENOENT/);
  const dir=root+'/knowledge/results/owner-external';fs.mkdirSync(dir,{recursive:true});
  for(const kind of ['payment','delivery','review','acceptance-eight'])fs.writeFileSync(dir+'/OWNER-EXT-AI-20261020-01-'+kind+'.json',JSON.stringify({kind,paid:false,status:'fixture'}));
  const r=reviewContext(root,'external-hire');assert.equal(r.files.length,4);assert.match(r.prompt,/T02/);assert.match(r.prompt,/供应方报告/);for(const f of r.files)assert.equal(f.sha256,digest(fs.readFileSync(root+'/'+f.file,'utf8')));
  const request=reviewRequest({...env,CLAUDE_REVIEW_TOPIC:'external-hire'});assert.equal(request.topic,'external-hire');assert.equal(request.task_id,'CLAUDE-OWNER-EXT-AI-20261020-01');assert.notEqual(request.task_id,reviewRequest(env).task_id);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('credit denial, timeout and truncated outputs stop without fallback or a second generation',async()=>{
 for(const result of [{ok:false,status:'insufficient_api_credits'},{ok:false,status:'exception'},{ok:true,model:'claude-haiku-test',finish_reason:'max_tokens',output:'unfinished'},{ok:true,model:'claude-haiku-test',finish_reason:'end_turn',output:'missing marker'}]){
  const r=record();let calls=0;await executeReview(r,{apiKey:'fixture',onCheckpoint:async()=>{},call:async()=>{calls++;return result;}});assert.equal(calls,1);assert.ok(r.status.startsWith('blocked_'));assert.equal(r.output,undefined);if(result.ok){assert.equal(r.status,'blocked_incomplete_output');assert.equal(r.partial_output,result.output);}else assert.equal(r.actual_model,null);await assert.rejects(executeReview(r,{}));
 }
});
test('missing secret or failed checkpoint never sends a request',async()=>{
 let calls=0;const r=record();await executeReview(r,{onCheckpoint:async()=>{},call:async()=>{calls++;}});assert.equal(calls,0);assert.equal(r.model_calls,0);
 await assert.rejects(executeReview(record(),{apiKey:'fixture',onCheckpoint:async()=>{throw Error('disk failed')},call:async()=>{calls++;}}));assert.equal(calls,0);
});
test('workflow has no timer, default inspect and no wallet secrets; identity allows work without voting',()=>{
 const w=fs.readFileSync('.github/workflows/claude-on-demand-review.yml','utf8');assert.doesNotMatch(w,/\b(schedule|cron):/);assert.ok(w.includes("inputs.mode == 'review'"));assert.doesNotMatch(w,/TREASURY_EXECUTOR_KEY|LTZZZ_WALLET_PRIVATE_KEY|CLOUDFLARE_API_TOKEN|SAFE_SIGNER/);
 const p=JSON.parse(fs.readFileSync('identity/dids/claude.json','utf8'))['ltzzz:profile'];assert.equal(p.votingSeat,false);assert.equal(p.workStatus,'active_external_audit_and_planning');assert.equal(p.role,'独立审计＋规划');assert.equal(p.walletSigning,false);
});
test('existing claims are retained and a repeat prepare cannot authorize another purchase',()=>{
 fs.mkdirSync('work',{recursive:true});const dir=fs.mkdtempSync(path.resolve('work/claude-review-claim-'));
 try{
  const source='knowledge/results/external/2026-10-14-claude-ans-pulse-audit.md',receipt='ops/dispatch/receipts/CLAUDE-ANS-PULSE-IMPORT-20261014.md';for(const f of [source,receipt]){fs.mkdirSync(path.dirname(path.join(dir,f)),{recursive:true});fs.writeFileSync(path.join(dir,f),'Public test source');}
  const out=path.join(dir,'knowledge/results/claude-review');fs.mkdirSync(out,{recursive:true});const file=path.join(out,'CLAUDE-ANS-PULSE-REVIEW.json');const prior={status:'calling_api_outcome_unknown',model_calls:1,run_id:'prior'};fs.writeFileSync(file,JSON.stringify(prior));
  const script=path.resolve('scripts/run-claude-review.mjs'),output=path.join(dir,'step-output');
  const preload=path.join(dir,'mock-fetch.mjs');fs.writeFileSync(preload,"globalThis.fetch=async()=>Response.json({data:[{id:'claude-haiku-test'}]});");
  const q=spawnSync(process.execPath,['--import',preload,script,'prepare'],{cwd:dir,env:{...process.env,...env,GITHUB_EVENT_NAME:'workflow_dispatch',CLAUDE_REVIEW_MODE:'review',CLAUDE_REVIEW_TOPIC:'ans-pulse',CLAUDE_REVIEW_TASK_ID:'CLAUDE-ANS-PULSE-REVIEW',ANTHROPIC_API_KEY:'fixture',GITHUB_OUTPUT:output},encoding:'utf8'});assert.equal(q.status,0,q.stderr);
  assert.deepEqual(JSON.parse(fs.readFileSync(file,'utf8')),prior);assert.equal(fs.readFileSync(output,'utf8'),'execute=false\n');
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
