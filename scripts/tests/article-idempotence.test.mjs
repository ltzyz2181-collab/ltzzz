import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {spawnSync} from 'node:child_process';import {createHash} from 'node:crypto';
test('a verified existing daily article and factual edit receipt survive scheduled reruns without another model call',()=>{
 fs.mkdirSync('work',{recursive:true});const root=fs.mkdtempSync(path.resolve('work/article-preserve-'));
 try{
  const date='2026-10-20',md='# A fact-checked existing article\nComplete approved draft\n',file=root+'/content/daily-articles/'+date+'.md',receipt=root+'/results/publishing/'+date+'.json';for(const f of [file,receipt])fs.mkdirSync(path.dirname(f),{recursive:true});
  const evidence={date,article_sha256:createHash('sha256').update(md).digest('hex'),ai_editor:{ok:true,finish_reason:'stop'},source_policy:'current_ans_v1',source_evidence:[{scope:'same_day',source_date:date,sha256:'a'.repeat(64)}],input_sha256:'b'.repeat(64),editorial_review:{approved_for_draft:true}};
  fs.writeFileSync(file,md);fs.writeFileSync(receipt,JSON.stringify(evidence));const before=fs.readFileSync(receipt,'utf8'),preload=root+'/reject-network.mjs';fs.writeFileSync(preload,"globalThis.fetch=async()=>{throw Error('must not call a model')};");
  const run=spawnSync(process.execPath,['--import',preload,path.resolve('scripts/publish-daily-article.mjs')],{cwd:root,env:{...process.env,ARTICLE_DATE:date,DEEPSEEK_API_KEY:'fixture-not-a-real-key'},encoding:'utf8'});assert.equal(run.status,0,run.stderr);assert.equal(JSON.parse(run.stdout).new_model_calls,0);assert.equal(JSON.parse(run.stdout).status,'existing_verified_article_preserved');assert.equal(fs.readFileSync(file,'utf8'),md);assert.equal(fs.readFileSync(receipt,'utf8'),before);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
