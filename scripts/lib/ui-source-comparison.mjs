import {createHash} from 'node:crypto';
const hash = value => createHash('sha256').update(value).digest('hex');

// Ignore at most one known edge analytics injection, never application edits.
// The actual browser page is not rewritten; this normalizes only source comparison.
export function compareUiSource(expectedBytes, observedBytes) {
  const expected = expectedBytes.toString(), observed = observedBytes.toString();
  const result = {expected_sha256: hash(expectedBytes), observed_sha256: hash(observedBytes),
    matched: false, kind: 'mismatch', removed_edge_scripts: []};
  if (result.expected_sha256 === result.observed_sha256) return {...result, matched: true, kind: 'exact'};
  const normalized = observed.replace(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi, (tag, attrs, body) => {
    const src = attrs.match(/(?:^|\s)src\s*=\s*(["'])(.*?)\1/i)?.[2];
    if (!src || body.trim() || !/^https:\/\/static\.cloudflareinsights\.com\/beacon\.min\.js(?:\/|[?#]|$)/.test(src)) return tag;
    const url = new URL(src);
    if (url.username || url.password || url.port || url.hostname !== 'static.cloudflareinsights.com') return tag;
    result.removed_edge_scripts.push({origin: url.origin, path: url.pathname, tag_sha256: hash(tag)});
    return '';
  });
  result.normalized_sha256 = hash(normalized);
  if (result.removed_edge_scripts.length === 1 && normalized.trimEnd() === expected.trimEnd()) {
    result.matched = true; result.kind = 'cloudflare_analytics_injection_only';
  }
  return result;
}
