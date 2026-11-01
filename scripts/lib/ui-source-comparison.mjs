import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

// Empty until a real edge tag has been inspected and its exact bytes pinned.
export const VERIFIED_EDGE_TAG_SHA256 = Object.freeze([]);
// The third parameter is for isolated fixture tests; production uses only the above pins.
// The actual browser page is never rewritten.
export function compareUiSource(expectedBytes, observedBytes, trustedTagHashes = VERIFIED_EDGE_TAG_SHA256) {
  const expected = expectedBytes.toString(), observed = observedBytes.toString();
  const result = {expected_sha256: hash(expectedBytes), observed_sha256: hash(observedBytes),
    matched: false, kind: 'mismatch', observed_script_tags: [], removed_edge_scripts: []};
  if (result.expected_sha256 === result.observed_sha256) return {...result, matched: true, kind: 'exact'};
  const normalized = observed.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attrs, body) => {
    const digest = hash(tag);
    result.observed_script_tags.push({tag_sha256: digest, bytes: Buffer.byteLength(tag)});
    if (body.trim() || !trustedTagHashes.includes(digest)) return tag;
    result.removed_edge_scripts.push({tag_sha256: digest});
    return '';
  });
  result.normalized_sha256 = hash(normalized);
  if (result.removed_edge_scripts.length === 1 && normalized.trimEnd() === expected.trimEnd()) {
    result.matched = true; result.kind = 'cloudflare_analytics_injection_only';
  }
  return result;
}
