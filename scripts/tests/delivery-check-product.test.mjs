import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {checkDelivery} from '../../products/delivery-check/check.mjs';
function fixture(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(),'delivery-product-'));
  t.after(() => fs.rmSync(root,{recursive:true,force:true}));
  const source = 'The quoted claim may still be false.';fs.writeFileSync(path.join(root,'source.txt'),source);
  const order = {schema:'ltzzz.delivery-check.order.v1',task_id:'TASK-1',package_id:'PKG-1',files:[{path:'source.txt',sha256:createHash('sha256').update(source).digest('hex')}],references:[{id:'r1',file:'source.txt',quote:'quoted claim'}],claims:[{id:'c1',reference_ids:['r1']}]};
  return {root,order};
}
test('correct file hash and quote location never assert semantic truth, acceptance or payment',t=>{
  const f=fixture(t),r=checkDelivery(f);assert.equal(r.failure_count,0);assert.equal(r.files[0].status,'hash_matches');
  assert.equal(r.claims[0].status,'semantic_review_required');
  for(const k of ['semantic_verified','independent_review_verified','accepted','platform_accepted','payment_authorized','paid'])assert.equal(r[k],false);
});
test('missing expected hash remains a fingerprint, not verified integrity',t=>{const f=fixture(t);delete f.order.files[0].sha256;assert.equal(checkDelivery(f).files[0].status,'fingerprint_only_no_expected_hash');});
test('wrong file hash invalidates references even when the quote text is present',t=>{const f=fixture(t);f.order.files[0].sha256='0'.repeat(64);const r=checkDelivery(f);assert.equal(r.files[0].status,'hash_mismatch');assert.equal(r.references[0].status,'source_unavailable');assert.equal(r.claims[0].status,'evidence_incomplete');});
test('missing file, missing quote and unknown reference are visible failures',t=>{
  for(const variant of ['file','quote','reference']){const f=fixture(t);if(variant==='file')fs.unlinkSync(path.join(f.root,'source.txt'));if(variant==='quote')f.order.references[0].quote='not present';if(variant==='reference')f.order.claims[0].reference_ids=['unknown'];assert.equal(checkDelivery(f).status,'needs_correction');}
});
test('unreferenced claims do not pass by empty-list truth',t=>{const f=fixture(t);f.order.claims[0].reference_ids=[];assert.equal(checkDelivery(f).claims[0].status,'evidence_incomplete');});
test('path traversal, absolute and Windows paths are rejected before reading',t=>{const f=fixture(t);for(const p of ['../source.txt','/etc/passwd','C:/test.txt','a\\b','a//b']){const o=structuredClone(f.order);o.files[0].path=p;assert.throws(()=>checkDelivery({...f,order:o}),/confined_file/);}});
test('symlink cannot add a file outside the declared package',t=>{const f=fixture(t);fs.symlinkSync(path.join(f.root,'source.txt'),path.join(f.root,'link.txt'));f.order.files=[{path:'link.txt'}];f.order.references=[];f.order.claims=[];assert.equal(checkDelivery(f).files[0].status,'symlink_not_allowed');});
test('duplicate files and reference IDs, oversized files and malformed orders cannot quietly pass',t=>{
  const f=fixture(t);assert.throws(()=>checkDelivery({...f,order:{...f.order,files:[...f.order.files,...f.order.files]}}));
  assert.throws(()=>checkDelivery({...f,order:{...f.order,references:[...f.order.references,...f.order.references]}}));
  fs.writeFileSync(path.join(f.root,'source.txt'),Buffer.alloc(1024*1024+1));assert.equal(checkDelivery(f).files[0].status,'file_too_large');
  assert.throws(()=>checkDelivery({...f,order:{...f.order,schema:'forged'}}));
});
