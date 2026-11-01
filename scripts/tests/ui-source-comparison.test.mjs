import test from 'node:test';
import assert from 'node:assert/strict';
import {compareUiSource} from '../lib/ui-source-comparison.mjs';
import {createHash} from 'node:crypto';
const source = '<!doctype html><main>actual application</main><script>app()</script></html>';
const edge = '<script defer src="https://static.cloudflareinsights.com/beacon.min.js/v123" data-cf-beacon=\'{"token":"public-fixture-id"}\'></script>';
const fixtureHash = createHash('sha256').update(edge).digest('hex');
const compare = actual => compareUiSource(Buffer.from(source), Buffer.from(actual), [fixtureHash]);
test('exact production bytes remain exact', () => {
  assert.equal(compare(source).kind, 'exact'); assert.equal(compare(source).matched, true);
});
test('one empty known Cloudflare analytics tag may be omitted from byte comparison only', () => {
  const result = compare(source.replace('</html>', edge + '</html>'));
  assert.equal(result.matched, true); assert.equal(result.kind, 'cloudflare_analytics_injection_only');
  assert.notEqual(result.observed_sha256, result.expected_sha256);
  assert.equal(result.normalized_sha256, result.expected_sha256);
  assert.equal(result.removed_edge_scripts[0].tag_sha256, fixtureHash);
  assert.doesNotMatch(JSON.stringify(result), /public-fixture-id/);
});
test('events, fake src inside data attributes, duplicate src and changed paths fail the exact tag pin', () => {
  for (const changed of [edge.replace(' defer ', ' onerror="globalThis.PWNED=1" defer '),
    `<script data-note=' src="https://static.cloudflareinsights.com/beacon.min.js"' src="https://evil.invalid/app.js"></script>`,
    edge.replace(' defer ', ' src="https://evil.invalid/app.js" defer '),
    edge.replace('/v123', '/arbitrary-unreviewed/path')]) {
    assert.equal(compare(source.replace('</html>', changed + '</html>')).matched, false);
  }
});
test('an unpinned edge tag fails closed', () => {
  assert.equal(compareUiSource(Buffer.from(source), Buffer.from(source.replace('</html>', edge + '</html>')), []).matched, false);
});
test('application text and JavaScript edits cannot be normalized away', () => {
  for (const change of [source.replace('application', 'forged'), source.replace('app()', 'evil()')]) {
    assert.equal(compare(change.replace('</html>', edge + '</html>')).matched, false);
  }
});
test('lookalike hosts, ports, protocols and other script paths remain mismatches', () => {
  for (const src of ['https://static.cloudflareinsights.com.evil.invalid/beacon.min.js',
    'http://static.cloudflareinsights.com/beacon.min.js', 'https://static.cloudflareinsights.com:8443/beacon.min.js',
    'https://static.cloudflareinsights.com/other.js', 'https://evil.invalid/beacon.min.js']) {
    assert.equal(compare(source.replace('</html>', `<script src="${src}"></script></html>`)).matched, false);
  }
});
test('extra inline code, attributes on the app and multiple beacon tags remain mismatches', () => {
  for (const extra of [edge.replace('></script>', '>evil()</script>'), edge + edge,
    '<div>unreviewed</div>' + edge]) assert.equal(compare(source.replace('</html>', extra + '</html>')).matched, false);
  assert.equal(compare(source.replace('<main>', '<main onclick="evil()">').replace('</html>', edge + '</html>')).matched, false);
});
