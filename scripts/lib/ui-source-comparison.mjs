import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

// Observed in run 41282155452: only type/src/integrity/data-cf-beacon/crossorigin,
// exact Cloudflare beacon origin/path + SRI, no event attributes or inline content.
export const VERIFIED_EDGE_TAG_SHA256 = Object.freeze([
  '3b7d688c79bfccb7bcfc5ebad348f47bd5adbb2e8bc4be9523516f445ebcd818',
]);
// The third parameter is for isolated fixture tests; production uses only the above pins.
// The actual browser page is never rewritten.
export function compareUiSource(expectedBytes, observedBytes, trustedTagHashes = VERIFIED_EDGE_TAG_SHA256) {
  const expected = expectedBytes.toString(), observed = observedBytes.toString();
  const result = {expected_sha256: hash(expectedBytes), observed_sha256: hash(observedBytes),
    matched: false, kind: 'mismatch', observed_script_tags: [], removed_edge_scripts: []};
  if (result.expected_sha256 === result.observed_sha256) return {...result, matched: true, kind: 'exact'};
  const tailPositions = new Map([[expected.length, 'document_end']]);
  for (const close of ['</body>', '</html>']) {
    const offset = expected.toLowerCase().lastIndexOf(close);
    if (offset >= 0) tailPositions.set(offset, 'before_' + close.slice(2, -1));
  }
  const normalized = observed.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attrs, body, offset) => {
    const digest = hash(tag);
    result.observed_script_tags.push({tag_sha256: digest, bytes: Buffer.byteLength(tag)});
    if (body.trim() || !trustedTagHashes.includes(digest) || !tailPositions.has(offset)) return tag;
    result.removed_edge_scripts.push({tag_sha256: digest, insertion_position: tailPositions.get(offset)});
    return '';
  });
  result.normalized_sha256 = hash(normalized);
  if (result.removed_edge_scripts.length === 1 && normalized.trimEnd() === expected.trimEnd()) {
    result.matched = true; result.kind = 'cloudflare_analytics_injection_only';
  }
  return result;
}
