import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
import {isPublic} from './lib/video-queue-client.mjs';

export const publishedProof = r => r?.published === true && /^[a-f0-9]{64}$/.test(r.video_sha256 || '') &&
 /^[A-Za-z0-9_-]{11}$/.test(r.video_id || '') && r.verification?.ok === true && r.verification.video_id === r.video_id && isPublic(r.verification);

// Only tracked video files whose actual bytes match a successful YouTube receipt.
// Never remove receipts, manifests, untracked files or unpublished media.
export function prunePublishedVideos({root = '.', tracked, sourceCommit = null, runId = null, runAttempt = null} = {}) {
 const base = path.resolve(root), dir = path.join(base, 'results/publishing');
 const proofs = new Map();
 if(fs.existsSync(dir)) for(const file of fs.readdirSync(dir).sort().filter(f => /^youtube-.*\.json$/.test(f))) {
  try { const r = JSON.parse(fs.readFileSync(path.join(dir,file))); if(publishedProof(r)) proofs.set(r.video_sha256,{file,r}); } catch {}
 }
 const report = {task_id:'YOUTUBE-AUTOMATION-20261013',step_id:'PUBLISHED-VIDEO-RETENTION',at_utc:new Date().toISOString(),source_commit:sourceCommit,run_id:runId,run_attempt:runAttempt,
  policy:'verified_youtube_receipt_only',removed:[],bytes_removed:0,uploads:0,model_calls:0,paid:false,tx_hash:null};
 for(const file of tracked || execFileSync('git',['ls-files','-z','--','videos/'],{cwd:base,encoding:'utf8'}).split('\0').filter(Boolean)) {
  if(!/^videos\/[A-Za-z0-9_./-]+\.mp4$/.test(file) || file.split('/').some(p => p === '.' || p === '..')) continue;
  const full = path.join(base,file);
  if(!fs.existsSync(full) || !fs.lstatSync(full).isFile()) continue;
  // A symlinked parent must not turn a repository cleanup into external deletion.
  if(fs.realpathSync(full) !== full) continue;
  const bytes = fs.readFileSync(full), hash = createHash('sha256').update(bytes).digest('hex'), proof = proofs.get(hash);
  if(!proof) continue;
  const {r} = proof;
  report.removed.push({path:file,bytes:bytes.length,sha256:hash,receipt:'results/publishing/'+proof.file,video_id:r.video_id,url:r.url || r.verification.url,
   publication_run_id:r.run_id || null,publication_source_commit:r.source_commit || null,verified_at:r.verified_at || null,verification:r.verification});
  fs.unlinkSync(full); report.bytes_removed += bytes.length;
 }
 return report;
}
if(process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
 const report = prunePublishedVideos({sourceCommit:process.env.GITHUB_SHA || execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),runId:process.env.GITHUB_RUN_ID || null,runAttempt:process.env.GITHUB_RUN_ATTEMPT ? Number(process.env.GITHUB_RUN_ATTEMPT) : null});
 if(report.removed.length) {
  const file = `results/publishing/video-retention-${process.env.GITHUB_RUN_ID || 'local-'+Date.now()}-${process.env.GITHUB_RUN_ATTEMPT || '1'}.json`;
  fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
 }
 console.log(JSON.stringify({removed:report.removed.length,bytes_removed:report.bytes_removed}));
}
