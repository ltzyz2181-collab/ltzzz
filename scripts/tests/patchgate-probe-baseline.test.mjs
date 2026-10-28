import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {runCandidateProbes} from '../patchgate-a2-probe-candidate.mjs';

test('actual source-bound A2 fixture passes positive baseline before adversarial mutations',async()=>{
 const root=process.cwd(),dir=fs.mkdtempSync(path.join(os.tmpdir(),'a2-baseline-')),target=path.join(dir,'checkout');
 const head=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 execFileSync('git',['worktree','add','--quiet','--detach',target,head],{cwd:root,stdio:'pipe'});
 try{
  const r=await runCandidateProbes({candidateRoot:target,control:{card:{candidate_head:head},source_commit:head,run_id:'offline-fixture'}});
  assert.equal(r.coverage.valid_policy_baseline,true);
  assert.equal(r.tests_failed,0);assert.equal(r.tests_passed,19);assert.equal(r.passed,true);
  assert.equal(r.financial_execution,false);assert.equal(r.automatic_merge,false);
 }finally{
  execFileSync('git',['worktree','remove',target],{cwd:root,stdio:'pipe'});
  fs.rmSync(dir,{recursive:true});
 }
});
