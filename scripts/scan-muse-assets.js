// ESM: package.json declares type=module. No upload or model request here.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {reviewApproval, sha256} from './lib/review-approval.mjs';

export function museSubject(meta) {
  return {id: meta.id, source: 'muse', file: meta.file, content_sha256: meta.content_sha256,
    title: meta.title, description: meta.description || '', tags: meta.tags || [],
    target_privacy: meta.target_privacy || 'private'};
}
export function scanMuseAssets({rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')} = {}) {
  const directory = path.join(rootDir, 'assets/video/muse');
  const entries = fs.readdirSync(directory).filter(f => f.endsWith('.meta.json')).sort().map(file => {
    let meta = {}, errors = [], approval = null, localVerified = false;
    try {
      meta = JSON.parse(fs.readFileSync(path.join(directory, file), 'utf8'));
      for (const key of ['id', 'created_at', 'file', 'title']) if (typeof meta[key] !== 'string' || !meta[key].trim()) errors.push('missing_' + key);
      if (meta.source && meta.source !== 'muse') errors.push('source_must_be_muse');
      if (!['drafted', 'reviewed', 'published', 'rejected'].includes(meta.status)) errors.push('bad_status');
      if (!/^[a-f0-9]{64}$/.test(meta.content_sha256 || '')) errors.push('video_content_hash_required');
      if (meta.file && !/^https:\/\//.test(meta.file)) {
        const root = fs.realpathSync(rootDir), actual = fs.realpathSync(path.resolve(root, meta.file));
        localVerified = actual.startsWith(root + path.sep) && sha256(fs.readFileSync(actual)) === meta.content_sha256;
        if (!localVerified) errors.push('video_content_hash_mismatch');
      }
      if (meta.status === 'reviewed') {
        approval = reviewApproval({rootDir, operation: 'video_publication', subject: museSubject(meta), reference: meta.review_reference});
        if (!approval.ok) errors.push(approval.reason || approval.status);
      }
      if (meta.status === 'published' && !meta.youtube_video_id && !meta.tiktok_publish_id) errors.push('published_without_platform_id');
    } catch { errors.push('metadata_or_video_unavailable'); }
    const duplicate = Boolean(meta.youtube_video_id || meta.tiktok_publish_id);
    return {file, meta, valid: !errors.length, errors, approval,
      publishable: !errors.length && meta.status === 'reviewed' && approval?.ok === true && !duplicate,
      video_bytes_verified: localVerified};
  });
  return {generated_at: new Date().toISOString(), source: 'muse', count: entries.length,
    publishable: entries.filter(e => e.publishable).length, human_confirmation_required: false,
    note: 'Manifest eligibility is not publication. Uploader must verify remote video bytes and platform deduplication before upload.', entries};
}
if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = process.argv.slice(2), out = args.length === 2 && args[0] === '--out' ? args[1] : null;
  if (args.length && !out) throw Error('usage_scan_muse_assets_optional_out');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const report = JSON.stringify(scanMuseAssets({rootDir: root}), null, 2) + '\n';
  if (out) {
    const target = path.resolve(root, out);
    if (!target.startsWith(root + path.sep)) throw Error('manifest_path_outside_repository');
    fs.writeFileSync(target, report);
  } else console.log(report);
}
