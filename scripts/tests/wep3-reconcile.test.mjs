import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

function run(t,ext,bad=false){
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'wep3-reconcile-'));t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 const hook=path.join(cwd,'hook.mjs');
 fs.writeFileSync(hook,`globalThis.fetch=async url=>new Response(JSON.stringify(url.includes('/ledger')?{ok:true,version:'1.1.1',agents:{},entries:[],credit_sum:9,pool_nav:0}:url.includes('/pool')?{ok:true,pool:{total:0}}:url.includes('/pulse')?{ok:true,open:0}:{ok:true,receipts:[],cites:[]}),{status:${bad?503:200}});`);
 const script=fileURLToPath(new URL('../wep3-daily-reconcile.'+ext,import.meta.url));
 const child=spawnSync(process.execPath,['--import',hook,script],{cwd,encoding:'utf8'});
 return {child,cwd};
}

test('both ESM and CommonJS reconcile entrypoints create a real report',t=>{
 for(const ext of ['mjs','cjs']){
  const {child,cwd}=run(t,ext);assert.equal(child.status,0,child.stderr);
  const report=JSON.parse(fs.readFileSync(path.join(cwd,'results',fs.readdirSync(path.join(cwd,'results'))[0])));
  assert.equal(report.ok,true);assert.equal(report.summary.open_intents,0);
 }
});

test('reconcile never claims success for an HTTP failure with a JSON body',t=>{
 const {child,cwd}=run(t,'cjs',true);assert.equal(child.status,1);
 assert.equal(fs.existsSync(path.join(cwd,'results')),false);
});
