import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {git} from '../../tools/push-receipt-commit.mjs';
import {persistPulseReceipts} from '../../tools/persist-pulse-receipts.mjs';
const relative='knowledge/results/pulse';
function fixture(){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-race-test-')),remote=path.join(root,'remote.git'),a=path.join(root,'a'),b=path.join(root,'b');
 const command=(cwd,args)=>{const r=git(cwd,args);assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
 command(root,['init','--bare','--initial-branch=main',remote]);command(root,['clone',remote,a]);
 const configure=dir=>{command(dir,['config','user.name','Fixture']);command(dir,['config','user.email','fixture@example.invalid']);};configure(a);
 fs.mkdirSync(path.join(a,relative),{recursive:true});
 const write=(dir,name,value)=>fs.writeFileSync(path.join(dir,relative,name),JSON.stringify(value)+'\n');
 const commit=dir=>{command(dir,['add','.']);command(dir,['commit','-m','fixture']);};
 write(a,'latest.json',{ran_at:'2026-10-20T01:00:00Z'});commit(a);command(a,['push','origin','main']);command(root,['clone',remote,b]);configure(b);
 const readRemote=file=>JSON.parse(command(b,['show','origin/main:'+relative+'/'+file]));
 const evidence={run_id:'123',at:'2026-10-20T01:02:00Z',status:'deployed_and_live_observations_recorded'};
 write(a,'deploy-123-attempt-1-pass-1.json',evidence);write(a,'deploy-123.json',evidence);write(a,'latest.json',{ran_at:evidence.at,version:'feedback-v1'});
 fs.writeFileSync(path.join(a,'owner-uncommitted.txt'),'preserve me');
 return {root,a,b,write,commit,command,readRemote,evidence,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('a concurrent latest update preserves both run evidence and the newer snapshot without changing the caller',()=>{
 const f=fixture();try{
  const before=f.command(f.a,['status','--porcelain']);let injected=false;
  const result=persistPulseReceipts({cwd:f.a,runId:'123',beforePush:()=>{if(injected)return;injected=true;f.write(f.b,'latest.json',{ran_at:'2026-10-20T01:03:00Z',version:'newer'});f.write(f.b,'watch-456-attempt-1.json',{run_id:'456',at:'2026-10-20T01:03:00Z'});f.commit(f.b);f.command(f.b,['push','origin','main']);}});
  assert.equal(result.attempts,2);f.command(f.b,['fetch','origin','main']);
  assert.deepEqual(f.readRemote('deploy-123-attempt-1-pass-1.json'),f.evidence);assert.equal(f.readRemote('watch-456-attempt-1.json').run_id,'456');assert.equal(f.readRemote('latest.json').version,'newer');
  assert.equal(f.command(f.a,['status','--porcelain']),before);assert.equal(fs.readFileSync(path.join(f.a,'owner-uncommitted.txt'),'utf8'),'preserve me');
  assert.equal(f.command(f.a,['worktree','list','--porcelain']).split('worktree ').length,2);
 }finally{f.close();}
});
test('a new observation advances latest and replay is idempotent',()=>{
 const f=fixture();try{
  assert.equal(persistPulseReceipts({cwd:f.a,runId:'123'}).ok,true);f.command(f.b,['fetch','origin','main']);assert.equal(f.readRemote('latest.json').version,'feedback-v1');
  assert.equal(persistPulseReceipts({cwd:f.a,runId:'123'}).unchanged,true);
 }finally{f.close();}
});
test('an immutable run artifact conflict stops without overwriting either copy',()=>{
 const f=fixture();try{
  f.write(f.b,'deploy-123-attempt-1-pass-1.json',{...f.evidence,status:'different_evidence'});f.commit(f.b);f.command(f.b,['push','origin','main']);
  assert.throws(()=>persistPulseReceipts({cwd:f.a,runId:'123'}),/immutable_pulse_evidence_conflict/);
  assert.equal(f.readRemote('deploy-123-attempt-1-pass-1.json').status,'different_evidence');assert.deepEqual(JSON.parse(fs.readFileSync(path.join(f.a,relative,'deploy-123-attempt-1-pass-1.json'))),f.evidence);
 }finally{f.close();}
});
test('foreign run evidence and invalid run IDs cannot be published',()=>{
 const f=fixture();try{
  assert.throws(()=>persistPulseReceipts({cwd:f.a,runId:'../123'}),/pulse_run_id_required/);
  f.write(f.a,'deploy-123-attempt-1-pass-1.json',{run_id:'999'});assert.throws(()=>persistPulseReceipts({cwd:f.a,runId:'123'}),/pulse_receipt_run_mismatch/);
 }finally{f.close();}
});
