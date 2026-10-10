import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../accept-real-hire.mjs',import.meta.url));

function setup(t){
 const cwd=fs.mkdtempSync(path.join(os.tmpdir(),'wep3-runner-'));
 t.after(()=>fs.rmSync(cwd,{recursive:true,force:true}));
 const dir=path.join(cwd,'knowledge/results/wep3');fs.mkdirSync(dir,{recursive:true});
 const source='knowledge/results/wep3/delivery-'+new Date().toISOString().slice(0,10)+'.json';
 fs.writeFileSync(path.join(cwd,source),JSON.stringify({file:source,data:{hiring:{deliverable_file:source}},output:'Concrete reusable engineering checklist',executor:'doubao',tokens:12,at:new Date().toISOString()}));
 const hook=path.join(cwd,'hook.mjs');
 fs.writeFileSync(hook,`import fs from 'node:fs';
 globalThis.fetch=async(url,options)=>{
  fs.appendFileSync('calls.jsonl',JSON.stringify({url,body:JSON.parse(options.body)})+'\\n');
  if(url.includes('openai.com')) return new Response(JSON.stringify({id:'audit-response',model:'gpt-4o-mini',usage:{total_tokens:8},choices:[{message:{content:JSON.stringify({accepted:process.env.MOCK_MODE!=='reject',reason:'Independent model verdict'})}}]}));
  if(process.env.MOCK_MODE==='timeout')throw Error('request_timeout');
  if(process.env.MOCK_MODE==='empty')return new Response(JSON.stringify({ok:true}));
  const b=JSON.parse(options.body);
  return new Response(JSON.stringify({ok:true,status:'HIRED',receipt:{id:'seal-1',status:'cleared',poster:b.agent,worker:b.worker,attester:b.audit_report.auditor,paid:false,tx_hash:null,settlement_mode:'internal_credit',audit:b.audit_report,deliverable_sha256:b.audit_report.deliverable_sha256}}));
 };
 `);
 const run=(mode='success',env={})=>spawnSync(process.execPath,['--import',hook,script],{cwd,env:{...process.env,WEP3_RUNNER_TOKEN:'test-runner',OPENAI_API_KEY:'test-audit',GITHUB_RUN_ID:'test-run',MOCK_MODE:mode,...env},encoding:'utf8'});
 const report=()=>JSON.parse(fs.readFileSync(path.join(dir,'latest.json')));
 const calls=()=>fs.existsSync(path.join(cwd,'calls.jsonl'))?fs.readFileSync(path.join(cwd,'calls.jsonl'),'utf8').trim().split('\n').filter(Boolean).map(x=>JSON.parse(x)):[];
 return {cwd,dir,source,run,report,calls};
}

test('runner audits the exact submitted text and same delivery skips all repeated API calls',t=>{
 const f=setup(t);const r=f.run();assert.equal(r.status,0,r.stderr);
 assert.equal(f.report().status,'internal_credit_settled');assert.equal(f.report().paid,false);
 const c=f.calls();assert.equal(c.length,2);
 assert.equal(c[0].body.messages[1].content,c[1].body.deliverable);
 assert.equal(f.run().status,0);assert.equal(f.calls().length,2);
});

test('transport failure saves an audit and retry reuses it without another model call',t=>{
 const f=setup(t);assert.equal(f.run('timeout').status,1);
 assert.equal(f.report().status,'blocked');assert.equal(f.report().audit.accepted,true);
 assert.equal(f.run().status,0);assert.equal(f.calls().filter(c=>c.url.includes('openai')).length,1);
 assert.equal(f.report().status,'internal_credit_settled');
});

test('rejected audit never submits a hire and reruns reuse the rejection',t=>{
 const f=setup(t);assert.equal(f.run('reject').status,1);
 assert.equal(f.report().status,'audit_rejected');assert.equal(f.calls().length,1);
 assert.equal(f.run('reject').status,1);assert.equal(f.calls().length,1);
});

test('HTTP success without a verified receipt cannot be reported settled',t=>{
 const f=setup(t);assert.equal(f.run('empty').status,1);
 assert.equal(f.report().status,'settlement_blocked');assert.equal(f.report().paid,false);
});

test('missing credentials and corrupt delivery are saved as failures before any API spend',t=>{
 const f=setup(t);assert.equal(f.run('success',{WEP3_RUNNER_TOKEN:''}).status,1);
 assert.equal(f.report().reason,'runner_token_not_configured');assert.equal(f.calls().length,0);
 fs.writeFileSync(path.join(f.cwd,f.source),'invalid json');
 assert.equal(f.run().status,1);assert.equal(f.report().status,'blocked');assert.equal(f.calls().length,0);
});
