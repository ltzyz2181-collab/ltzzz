import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {sha256,canonical} from '../lib/patchgate.mjs';
import {verifyPaymentManifest} from '../verify-small-payment-manifest.mjs';
function fixture(version){
 const dir=fs.mkdtempSync('/tmp/ltzzz-manifest-source-'),sub=path.join(dir,'knowledge/results/patchgate',version);fs.mkdirSync(sub,{recursive:true});
 const bytes='public test source\n';fs.writeFileSync(path.join(dir,'public.mjs'),bytes);
 const row={path:'public.mjs',sha256:sha256(bytes),bytes:Buffer.byteLength(bytes)};
 const release={schema:'ltzzz.small-payment.release.v1',files:[row]};
 const manifest={schema:'ltzzz.'+version+'.artifact-manifest.v1',task_id:'PLAN-PATCHGATE-ESCROW-20261023',files:[row],small_payment_release:{...release,sha256:sha256(canonical(release))}};
 const file=path.join(sub,'artifact-manifest.json'),write=()=>fs.writeFileSync(file,JSON.stringify(manifest));write();
 return {dir,manifest,write,close:()=>fs.rmSync(dir,{recursive:true,force:true})};
}
for(const version of ['post271','post272-s1'])test('fixed manifest selection verifies original public bytes '+version,()=>{const f=fixture(version);try{assert.equal(verifyPaymentManifest(f.dir,version).status,'manifest_verified_not_payment_authorization');fs.appendFileSync(path.join(f.dir,'public.mjs'),'changed\n');assert.throws(()=>verifyPaymentManifest(f.dir,version),/manifest_source_bytes_changed/);}finally{f.close();}});
test('manifest selector cannot be an arbitrary path or unknown rollout',()=>{for(const version of ['../../.env','https://example.invalid/manifest.json','post999'])assert.throws(()=>verifyPaymentManifest('/must-not-read',version),/fixed_manifest_version_required/);});
test('selecting the S1 manifest does not silently accept the old schema',()=>{const f=fixture('post272-s1');try{f.manifest.schema='ltzzz.post271.artifact-manifest.v1';f.write();assert.throws(()=>verifyPaymentManifest(f.dir,'post272-s1'),/manifest_identity_invalid/);}finally{f.close();}});
test('manifest never opens an env file selected by its content',()=>{const f=fixture('post272-s1');try{f.manifest.files=[{path:'.env',sha256:'0'.repeat(64),bytes:1}];f.write();assert.throws(()=>verifyPaymentManifest(f.dir,'post272-s1'),/manifest_path_not_public_source/);}finally{f.close();}});
