import test from 'node:test';import assert from 'node:assert/strict';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {createHash} from 'node:crypto';
import {prunePublishedVideos,publishedProof} from '../prune-published-videos.mjs';
const bytes = Buffer.from('published media'), hash = createHash('sha256').update(bytes).digest('hex');
const proof = {published:true,video_sha256:hash,video_id:'abcDEF12345',run_id:'123',url:'https://www.youtube.com/watch?v=abcDEF12345',verification:{published:true,channel_id:'UCnKqseQ7uivSc7FN38ccRUA',video_id:'abcDEF12345',privacyStatus:'public',uploadStatus:'processed'}};
test('only matching ID, channel, public, processed and hash qualify as publication proof',()=>{
 assert.equal(publishedProof(proof),true);
 for(const patch of [{published:false},{video_sha256:'bad'},{video_id:'otherID1234'},{verification:{...proof.verification,published:false}},{verification:{...proof.verification,channel_id:'other'}},{verification:{...proof.verification,privacyStatus:'private'}},{verification:{...proof.verification,uploadStatus:'uploaded'}}]) assert.equal(publishedProof({...proof,...patch}),false);
});
test('remove both matching tracked copies; preserve receipts, manifests, unpublished and untracked media; retry is empty',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-retention-'));
 try{
  fs.mkdirSync(path.join(root,'results/publishing'),{recursive:true});fs.mkdirSync(path.join(root,'videos'),{recursive:true});
  const text=JSON.stringify(proof);fs.writeFileSync(path.join(root,'results/publishing/youtube-daily-proof.json'),text);
  for(const name of ['one.mp4','alias.mp4','untracked.mp4'])fs.writeFileSync(path.join(root,'videos',name),bytes);
  fs.writeFileSync(path.join(root,'videos/unpublished.mp4'),'different');fs.writeFileSync(path.join(root,'videos/manifest.json'),'{}');
  const tracked=['videos/one.mp4','videos/alias.mp4','videos/unpublished.mp4','videos/manifest.json'];
  const r=prunePublishedVideos({root,tracked});assert.equal(r.removed.length,2);assert.equal(r.bytes_removed,bytes.length*2);
  for(const file of ['videos/untracked.mp4','videos/unpublished.mp4','videos/manifest.json'])assert.ok(fs.existsSync(path.join(root,file)));
  assert.equal(fs.readFileSync(path.join(root,'results/publishing/youtube-daily-proof.json'),'utf8'),text);
  assert.equal(prunePublishedVideos({root,tracked}).removed.length,0);
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
test('symlinks, traversal and paths outside videos are not deleted',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'video-retention-'));
 try{
  fs.mkdirSync(path.join(root,'results/publishing'),{recursive:true});fs.mkdirSync(path.join(root,'videos'));
  fs.writeFileSync(path.join(root,'results/publishing/youtube-proof.json'),JSON.stringify(proof));fs.writeFileSync(path.join(root,'external.mp4'),bytes);
  fs.symlinkSync('../external.mp4',path.join(root,'videos/link.mp4'));fs.symlinkSync(root,path.join(root,'videos/alias'));
  const r=prunePublishedVideos({root,tracked:['external.mp4','videos/../external.mp4','videos/link.mp4','videos/alias/external.mp4']});
  assert.equal(r.removed.length,0);assert.ok(fs.existsSync(path.join(root,'external.mp4')));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
