import test from 'node:test';
import assert from 'node:assert/strict';
import {readRelayStatus,runRelay} from '../ltzzz-relay.mjs';
import {REPOSITORY,relayBody} from '../lib/control-relay.mjs';
const issue={number:88,title:'接力只读核验',state:'open',body:'原始正文\n第二行',comments:1};
const comment=(id,body)=>({id,body,user:{login:'ltzzz-bot'},created_at:'2026-10-16T00:00:00Z',html_url:`https://github.com/${REPOSITORY}/issues/88#issuecomment-${id}`});
function stub({comments=[comment(1,'completed_readonly_pending_review\n并非独立审核完成')],failAt=0,error=Object.assign(new Error('failed'),{stderr:'HTTP 403: Forbidden secret-fixture'}),response=issue}={}){
 const calls=[];const run=(binary,args,options)=>{calls.push({binary,args,options});if(calls.length===failAt)throw error;return calls.length===1?JSON.stringify(response):comments.map(c=>JSON.stringify(c)).join('\n')+'\n';};return {run,calls};
}
test('status reads fixed issue and paginated comments using REST GET only, without shell or GraphQL',()=>{
 const f=stub(),text=runRelay(['status','88'],f);
 assert.equal(f.calls.length,2);
 assert.deepEqual(f.calls[0].args,['api','--method','GET',`repos/${REPOSITORY}/issues/88`]);
 assert.deepEqual(f.calls[1].args,['api','--method','GET',`repos/${REPOSITORY}/issues/88/comments?per_page=100`,'--paginate','--jq','.[] | @json']);
 assert.ok(f.calls.every(c=>c.binary==='gh'&&c.options.shell===false&&c.args[2]==='GET'));
 assert.match(text,/原始正文\n第二行/);assert.match(text,/pending_review\n并非独立审核完成/);assert.match(text,/不自动等同于执行或审核已成功/);
});
test('comments beyond one page and multiline bodies are not truncated, zero comments is valid',()=>{
 const comments=Array.from({length:205},(_,i)=>comment(i+1,`评论${i+1}\n"quotes"\\path\n中文`));
 const f=stub({comments}),text=readRelayStatus('88',f);
 assert.match(text,/205 条/);assert.match(text,/评论205/);assert.equal((text.match(/### ltzzz-bot/g)||[]).length,205);
 assert.match(readRelayStatus('88',stub({comments:[]})),/评论（0 条）/);
});
test('Forbidden at either phase fails closed with no anonymous bypass, writes or token disclosure',()=>{
 for(const failAt of [1,2]){
  const f=stub({failAt});assert.throws(()=>readRelayStatus('88',f),error=>/403\/Forbidden/.test(error.message)&&/不等于远端执行失败/.test(error.message)&&/不能仅据此认定 Token 失效/.test(error.message)&&!/secret-fixture/.test(error.message));
  assert.equal(f.calls.length,failAt);assert.ok(f.calls.every(c=>c.args[2]==='GET'));
 }
});
test('missing CLI, unauthorized, hidden issue, malformed JSON and timeout never manufacture a receipt',()=>{
 for(const [error,expected] of [[Object.assign(new Error('spawnSync gh ENOENT'),{code:'ENOENT'}),/找不到 gh/],[Object.assign(new Error('401 Unauthorized'),{}),/认证未通过/],[new Error('404 Not Found'),/账号不可见/],[Object.assign(new Error('timeout'),{signal:'SIGTERM'}),/超时/]]){
  assert.throws(()=>readRelayStatus('88',stub({failAt:1,error})),expected);
 }
 assert.throws(()=>readRelayStatus('88',{run:()=>'{broken'}),/未取得完整回执/);
 assert.throws(()=>readRelayStatus('88',stub({response:{...issue,number:99}})),/编号不匹配/);
 assert.throws(()=>readRelayStatus('88',stub({comments:[{id:1}]})),/未取得完整回执/);
});
test('invalid numbers are rejected before any subprocess, and submit still uses original stdin body',()=>{
 for(const value of ['0','-1','88;curl x','88/../99','88 extra']){
  const f=stub();assert.throws(()=>runRelay(['status',value],f));assert.equal(f.calls.length,0);
 }
 const calls=[];const task='$(read secret)\n文字不执行';
 const result=runRelay(['submit','qianwen_inspect','task.txt'],{read:()=>task,run:(binary,args,options)=>{calls.push({binary,args,options});return 'created\n';}});
 assert.equal(result,'created\n');assert.equal(calls.length,1);assert.equal(calls[0].options.input,relayBody('qianwen_inspect',task));assert.equal(calls[0].options.shell,false);
 assert.deepEqual(calls[0].args.slice(0,2),['issue','create']);
});

test('machine-readable API reads disable forced TTY color but preserve inherited auth and proxy settings',()=>{
 const f=stub();readRelayStatus('88',f);
 for(const {options} of f.calls){
  assert.equal(options.env.GH_FORCE_TTY,'');assert.equal(options.env.NO_COLOR,'1');assert.equal(options.env.CLICOLOR_FORCE,'0');
  for(const name of ['GH_TOKEN','GITHUB_TOKEN','GH_HOST','HTTPS_PROXY','HTTP_PROXY'])assert.equal(options.env[name],process.env[name],'inherited setting unchanged');
 }
});

test('actual CLI process returns nonzero and no stdout for a denied read, without invoking a network client',async t=>{
 const fs=await import('node:fs'),os=await import('node:os'),path=await import('node:path'),{spawnSync}=await import('node:child_process');
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'relay-status-cli-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const preload=path.join(root,'deny.mjs');
 fs.writeFileSync(preload,"import cp from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';cp.execFileSync=()=>{throw Object.assign(new Error('denied'),{stderr:'HTTP 403 Forbidden secret-fixture'});};syncBuiltinESMExports();\n");
 const result=spawnSync(process.execPath,['--import',preload,path.resolve('scripts/ltzzz-relay.mjs'),'status','88'],{encoding:'utf8'});
 assert.equal(result.status,1);assert.equal(result.stdout,'');assert.match(result.stderr,/403\/Forbidden/);assert.match(result.stderr,/不等于远端执行失败/);assert.doesNotMatch(result.stderr,/secret-fixture/);
});
