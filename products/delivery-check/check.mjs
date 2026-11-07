#!/usr/bin/env node
// Local-only first stage of delivery acceptance. Input text is data, never code.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';

const digest = bytes => crypto.createHash('sha256').update(bytes).digest('hex');
const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
function localPath(value) {
  return typeof value === 'string' && value.length <= 240 && !value.includes('\\') &&
    !value.includes('\0') && !path.posix.isAbsolute(value) &&
    value.split('/').every(part => part && part !== '.' && part !== '..' && !part.includes(':'));
}
function readLocal(root, relative, maximum) {
  let target = root;
  for (const segment of relative.split('/')) {
    target = path.join(target, segment);
    if (fs.lstatSync(target).isSymbolicLink()) throw Error('symlink_not_allowed');
  }
  const stat = fs.statSync(target);
  if (!stat.isFile()) throw Error('regular_file_required');
  if (stat.size > maximum) throw Error('file_too_large');
  const fd = fs.openSync(target, fs.constants.O_RDONLY | (fs.constants.O_NOFOLLOW || 0));
  try {
    if (fs.fstatSync(fd).size > maximum) throw Error('file_too_large');
    const bytes = Buffer.alloc(maximum + 1);
    let length = 0;
    while (length < bytes.length) {
      const n = fs.readSync(fd, bytes, length, bytes.length - length, null);
      if (!n) break;
      length += n;
    }
    if (length > maximum) throw Error('file_too_large');
    return bytes.subarray(0, length);
  } finally { fs.closeSync(fd); }
}

export function checkDelivery({root, order}) {
  if (order?.schema !== 'ltzzz.delivery-check.order.v1' || !id(order.task_id) || !id(order.package_id)) throw Error('order_identity_required');
  if (!Array.isArray(order.files) || !order.files.length || order.files.length > 50) throw Error('one_to_fifty_files_required');
  if (!Array.isArray(order.references) || order.references.length > 200 || !Array.isArray(order.claims) || order.claims.length > 200) throw Error('bounded_references_and_claims_required');
  const base = fs.realpathSync(root), paths = new Set(), sources = new Map();
  if (!fs.statSync(base).isDirectory()) throw Error('package_directory_required');
  const files = [], references = [], claims = []; let total = 0;
  for (const item of order.files) {
    if (!localPath(item?.path) || paths.has(item.path)) throw Error('unique_confined_file_path_required');
    if (item.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(item.sha256)) throw Error('expected_sha256_invalid');
    paths.add(item.path);
    try {
      const bytes = readLocal(base, item.path, 1024 * 1024);
      total += bytes.length;
      if (total > 5 * 1024 * 1024) throw Error('package_too_large');
      const actual = digest(bytes);
      const status = item.sha256 === undefined ? 'fingerprint_only_no_expected_hash' : item.sha256 === actual ? 'hash_matches' : 'hash_mismatch';
      files.push({path: item.path, bytes: bytes.length, sha256: actual, status});
      // A hash mismatch is not admissible source evidence for references.
      if (status !== 'hash_mismatch') sources.set(item.path, bytes.toString('utf8'));
    } catch (error) {
      if (error.message === 'package_too_large') throw error;
      const code = ['ENOENT','ENOTDIR'].includes(error.code) ? 'file_missing' :
        ['symlink_not_allowed','regular_file_required','file_too_large'].includes(error.message) ? error.message : 'file_unreadable';
      files.push({path: item.path, sha256: null, status: code});
    }
  }
  const referenceIds = new Set();
  for (const ref of order.references) {
    if (!id(ref?.id) || referenceIds.has(ref.id) || !localPath(ref.file) || !paths.has(ref.file) ||
        typeof ref.quote !== 'string' || !ref.quote.trim() || ref.quote.length > 4000) throw Error('reference_binding_invalid');
    referenceIds.add(ref.id);
    const status = sources.has(ref.file) ? sources.get(ref.file).includes(ref.quote) ? 'quote_located_semantics_unverified' : 'quote_not_found' : 'source_unavailable';
    references.push({id: ref.id, file: ref.file, status, semantic_verified: false});
  }
  const claimIds = new Set();
  for (const claim of order.claims) {
    if (!id(claim?.id) || claimIds.has(claim.id) || !Array.isArray(claim.reference_ids) || claim.reference_ids.length > 20 ||
        claim.reference_ids.some(ref => !id(ref)) || new Set(claim.reference_ids).size !== claim.reference_ids.length) throw Error('claim_binding_invalid');
    claimIds.add(claim.id);
    const located = claim.reference_ids.filter(ref => references.some(r => r.id === ref && r.status === 'quote_located_semantics_unverified'));
    claims.push({id: claim.id, located_reference_ids: located, missing_or_unlocated_reference_ids: claim.reference_ids.filter(ref => !located.includes(ref)),
      status: located.length && located.length === claim.reference_ids.length ? 'semantic_review_required' : 'evidence_incomplete', semantic_verified: false});
  }
  const failures = files.filter(f => !['hash_matches','fingerprint_only_no_expected_hash'].includes(f.status)).length +
    references.filter(r => r.status !== 'quote_located_semantics_unverified').length + claims.filter(c => c.status === 'evidence_incomplete').length;
  return {schema: 'ltzzz.delivery-check.report.v1', task_id: order.task_id, package_id: order.package_id,
    status: failures ? 'needs_correction' : 'mechanical_checks_passed_semantic_review_required',
    failure_count: failures, files, references, claims, semantic_verified: false, independent_review_verified: false,
    accepted: false, platform_accepted: false, payment_authorized: false, model_api_calls: 0, transactions: 0,
    paid: false, tx_hash: null, scope: 'Local file hashes and exact quote location only; no network, entailment, legal opinion, platform acceptance or payment proof.'};
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  try {
    if (process.argv.length !== 4) throw Error('usage: node check.mjs PRIVATE_PACKAGE_DIR PRIVATE_ORDER_JSON');
    const manifest = path.resolve(process.argv[3]);
    const bytes = readLocal(fs.realpathSync(path.dirname(manifest)), path.basename(manifest), 256 * 1024);
    const report = checkDelivery({root: process.argv[2], order: JSON.parse(bytes)});
    report.input_manifest_sha256 = digest(bytes);
    process.stdout.write(JSON.stringify(report, null, 2) + '\n');
    process.exitCode = report.failure_count ? 1 : 0;
  } catch (_) {
    // Local caller may include credentials in paths/errors. Never echo either.
    process.stderr.write('delivery_check_invalid_input_or_unavailable_package\n');
    process.exitCode = 2;
  }
}
