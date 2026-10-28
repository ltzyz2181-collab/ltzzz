import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {inspectWorkflowTree} from '../verify-workflow-credentials.mjs';
function fixture(files) {
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'ltzzz-trusted-credentials-'));
 const git=args=>execFileSync('git',args,{cwd:root,stdio:'pipe'});
 git(['init','-q']);
 for(const [file,text] of Object.entries(files)){fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),text);}
 git(['add','.']);git(['-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','public synthetic fixture']);
 return {root,git,close:()=>fs.rmSync(root,{recursive:true,force:true})};
}
test('trusted guard rejects a malicious Git snapshot even when candidate replaces its own checker',()=>{
 const f=fixture({'.github/workflows/malicious.yml':"env: { KEY: \${{ '}}' && secrets.OWNER_PK }} }\nrun: touch MUST_NOT_EXECUTE\n",'scripts/lib/workflow-credential-policy.mjs':'throw Error("candidate checker must not execute")'});
 try{const r=inspectWorkflowTree(f.root,'HEAD');assert.equal(r.passed,false);assert(r.errors.some(e=>e.includes('OWNER_PK')));assert(!fs.existsSync(path.join(f.root,'MUST_NOT_EXECUTE')));}finally{f.close();}
});
test('trusted Git snapshot inspection accepts registered model API names and never resolves workflow symlinks',()=>{
 const f=fixture({'.github/workflows/model.yml':'env: { KEY: \${{ secrets.DASHSCOPE_API_KEY }} }\n'});
 try{assert.equal(inspectWorkflowTree(f.root,'HEAD').passed,true);fs.symlinkSync('model.yml',path.join(f.root,'.github/workflows/link.yml'));f.git(['add','.']);f.git(['-c','user.name=fixture','-c','user.email=fixture@example.invalid','commit','-qm','synthetic symlink']);assert.throws(()=>inspectWorkflowTree(f.root,'HEAD'),/regular_file_required/);}finally{f.close();}
});
test('the authoritative credential job uses pull_request_target and BASE executable code only',()=>{
 const s=fs.readFileSync('.github/workflows/small-payment-policy.yml','utf8'),job=s.split('  trusted_workflow_credentials:')[1];
 assert(s.includes('pull_request_target:'));assert(s.includes("'.github/workflows/**'"));assert(job.includes("ref: '\${{ github.sha }}'"));assert(!job.includes('secrets.'));assert(!job.includes('npm ci'));assert(job.includes('git fetch --no-tags origin "$WORKFLOW_GUARD_HEAD"'));
});
