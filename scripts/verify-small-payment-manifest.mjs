// Byte verification only; this never grants a payment or review approval.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {sha256, canonical} from './lib/patchgate.mjs';
export function verifyPaymentManifest(root) {
  const base = fs.realpathSync(root), file = 'knowledge/results/patchgate/post271/artifact-manifest.json';
  const manifest = JSON.parse(fs.readFileSync(path.join(base, file), 'utf8'));
  if (manifest.schema !== 'ltzzz.post271.artifact-manifest.v1' || manifest.task_id !== 'PLAN-PATCHGATE-ESCROW-20261023') throw Error('manifest_identity_invalid');
  const paths = new Set();
  for (const row of [...manifest.files, ...manifest.small_payment_release.files]) {
    if (typeof row.path !== 'string' || !/^[A-Za-z0-9_./-]+$/.test(row.path) || row.path.split('/').some(p => !p || p === '..' || p === '.' || p === '.git' || p.startsWith('.env'))
        || /(?:^|\/)(?:secrets?|credentials?|private[-_]?keys?)(?:\.|\/|$)/i.test(row.path)) throw Error('manifest_path_not_public_source');
    const full = path.join(base, row.path);
    if (!fs.lstatSync(full).isFile() || !fs.realpathSync(full).startsWith(base + path.sep)) throw Error('manifest_path_not_regular_source');
    const bytes = fs.readFileSync(full);
    if (bytes.length !== row.bytes || sha256(bytes) !== row.sha256) throw Error('manifest_source_bytes_changed:' + row.path);
    paths.add(row.path);
  }
  const release = {schema: manifest.small_payment_release.schema, files: manifest.small_payment_release.files};
  if (sha256(canonical(release)) !== manifest.small_payment_release.sha256) throw Error('release_digest_mismatch');
  return {status: 'manifest_verified_not_payment_authorization', source_files: paths.size, release_sha256: manifest.small_payment_release.sha256};
}
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  console.log(JSON.stringify(verifyPaymentManifest(process.cwd())));
}
