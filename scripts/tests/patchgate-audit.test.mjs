import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {BUNDLE, bundle, prepare, execute, trustedMainContext} from '../patchgate-audit.mjs';
import {sha256} from '../lib/patchgate.mjs';

function fixture() {
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'patchgate-audit-'));
  for (const name of BUNDLE) { fs.mkdirSync(path.dirname(path.join(root,name)),{recursive:true});fs.writeFileSync(path.join(root,name),'public test fixture '+name+'\n'); }
  return {root,cleanup:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('native audit is reserved once for an exact byte bundle before any call', async () => {
  const f=fixture();
  try {
    const first=prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'12345',attempt:'1'});
    assert.equal(first.claim.bundle_sha256,bundle(f.root).bundle_sha256);
    assert.throws(()=>prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'12345',attempt:'1'}));
    let calls=0;
    const r=await execute({root:f.root,folder:first.folder,runId:'12345',call:async()=>{calls++;return {ok:true,status:'success',native_qwen_call:true,model:'qwen-provider-response',model_source:'provider_response',request_id:'real-provider-request',finish_reason:'stop',tokens_used:100,output:JSON.stringify({verdict:'revise',findings:[{severity:'P1',path:'fixture',issue:'a concrete issue',fix:'fix'}],limitations:[],review_end:true})};}});
    assert.equal(r.verdict,'revise');
    const record=JSON.parse(fs.readFileSync(path.join(f.root,first.folder,'qianwen.result.json'),'utf8'));
    assert.equal(record.actual_provider,'aliyun_dashscope');
    assert.equal(record.output_sha256,sha256(record.output));
    assert.equal(record.claude_audit_received,false);
    assert.equal(record.automatic_deploy,false);
    assert.equal((await execute({root:f.root,folder:first.folder,runId:'12345',call:async()=>{calls++;}})).status,'existing_attempt_reconcile_no_retry');
    assert.equal(calls,1);
  } finally { f.cleanup(); }
});
test('changed subject is rejected before a provider call', async () => {
  const f=fixture();
  try {
    const first=prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'12345',attempt:'1'});
    fs.appendFileSync(path.join(f.root,BUNDLE[0]),'candidate changed');
    let called=false;
    await assert.rejects(execute({root:f.root,folder:first.folder,runId:'12345',call:async()=>{called=true;}}),/audit_subject_changed/);
    assert.equal(called,false);
  } finally { f.cleanup(); }
});
test('truncation, model self-report and missing native source are not a completed audit', async () => {
  for (const change of [{finish_reason:'length'},{model_source:'model_self_report'},{native_qwen_call:false}]) {
    const f=fixture();
    try {
      const first=prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'12345',attempt:'1'});
      const r=await execute({root:f.root,folder:first.folder,runId:'12345',call:async()=>({ok:true,status:'success',native_qwen_call:true,model:'qwen-plus',model_source:'provider_response',finish_reason:'stop',output:'{"verdict":"approve","findings":[],"limitations":[],"review_end":true}',...change})});
      assert.equal(r.status,'incomplete_or_invalid_audit');
      assert.equal(r.verdict,null);
    } finally { f.cleanup(); }
  }
});
test('exception outcome is recorded and never auto-retried', async () => {
  const f=fixture();
  try {
    const first=prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'12345',attempt:'1'});
    let count=0;
    const args={root:f.root,folder:first.folder,runId:'12345',call:async()=>{count++;throw Error('timeout');}};
    assert.equal((await execute(args)).status,'provider_outcome_unknown_no_retry');
    await execute(args);
    assert.equal(count,1);
  } finally { f.cleanup(); }
});
test('only a real first-attempt run can reserve an audit', () => {
  const f=fixture();
  try {
    assert.throws(()=>prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'local',attempt:'1'}));
    assert.throws(()=>prepare({root:f.root,sourceCommit:'a'.repeat(40),runId:'12345',attempt:'2'}));
  } finally { f.cleanup(); }
});
test('M1 credentialed entrypoint requires main workflow_dispatch and its exact checked-out SHA',()=>{
  const sha='a'.repeat(40),args={ref:'refs/heads/main',event:'workflow_dispatch',sha,checkout:sha};
  assert.equal(trustedMainContext(args),sha);
  for(const change of [{ref:'refs/heads/codex/patchgate-a0-20261023'},{event:'push'},{event:'pull_request_target'},{checkout:'b'.repeat(40)}]) assert.throws(()=>trustedMainContext({...args,...change}),/trusted_main/);
});
test('M1 candidate code is read from immutable Git blobs, never imported or taken from checkout',()=>{
  const f=fixture(),git=args=>execFileSync('git',args,{cwd:f.root,encoding:'utf8'}).trim();
  try {
    git(['init','--quiet']);git(['config','user.name','patchgate-test']);git(['config','user.email','patchgate-test@example.invalid']);
    const marker=path.join(f.root,'candidate-executed'),candidate='import fs from "node:fs";fs.writeFileSync('+JSON.stringify(marker)+',"executed");throw Error("must never run");\n';
    fs.writeFileSync(path.join(f.root,'scripts/patchgate-audit.mjs'),candidate);
    git(['add','.']);git(['commit','--quiet','-m','candidate data']);const sha=git(['rev-parse','HEAD']);
    fs.writeFileSync(path.join(f.root,'scripts/patchgate-audit.mjs'),'changed checkout does not control snapshot');
    const b=bundle(f.root,{sourceCommit:sha});
    assert.equal(b.files.find(x=>x.path==='scripts/patchgate-audit.mjs').bytes,candidate);
    assert.equal(fs.existsSync(marker),false);
    assert.throws(()=>bundle(f.root,{sourceCommit:'main;echo untrusted'}),/full_candidate/);
    fs.unlinkSync(path.join(f.root,'scripts/patchgate-audit.mjs'));
    fs.symlinkSync('call-qwen.mjs',path.join(f.root,'scripts/patchgate-audit.mjs'));
    git(['add','.']);git(['commit','--quiet','-m','candidate symlink']);
    assert.throws(()=>bundle(f.root,{sourceCommit:git(['rev-parse','HEAD'])}),/candidate_regular_git_blob/);
  } finally { f.cleanup(); }
});
test('M1 native audit job has no push/PR secret route and pins trusted main code',()=>{
  const text=fs.readFileSync(new URL('../../.github/workflows/patchgate-a0.yml',import.meta.url),'utf8');
  const job=text.slice(text.indexOf('  independent_qwen_audit:'));
  assert.ok(job.includes("github.event_name == 'workflow_dispatch' && github.ref == 'refs/heads/main'"));
  assert.ok(job.includes("ref: '${{ github.sha }}'"));
  assert.equal(job.includes('[patchgate-a0-audit]'),false);
  assert.equal(job.includes('ref: ${{ inputs.candidate_head }}'),false);
});
