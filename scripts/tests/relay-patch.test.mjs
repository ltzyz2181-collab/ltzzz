import test from 'node:test';
import assert from 'node:assert/strict';
import {parseCard, validatePatch, extractJson} from '../relay-patch.mjs';

test('a card declares its paths and instruction', () => {
  const c = parseCard(['paths: docs/a.md, scripts/tests/x.test.mjs', '---', '把 a.md 的标题改成 B'].join('\n'));
  assert.deepEqual(c.paths, ['docs/a.md', 'scripts/tests/x.test.mjs']);
  assert.match(c.instruction, /\u6807\u9898/);
});

test('only declared paths may be written', () => {
  assert.equal(validatePatch({declared: ['docs/a.md'], files: [{path: 'docs/a.md', content: 'x'}]}).ok, true);
  assert.equal(validatePatch({declared: ['docs/a.md'], files: [{path: 'scripts/x.mjs', content: 'x'}]}).code, 'path_not_declared');
});

test('wallet, key and credential paths are refused even when declared', () => {
  for (const p of ['wallet/addresses.md', '.env', 'keys/private.pem', 'config/secrets.json']) {
    const r = validatePatch({declared: [p], files: [{path: p, content: 'x'}]});
    assert.equal(r.code, 'path_forbidden', p);
  }
});

test('an empty patch is not a success', () => {
  assert.equal(validatePatch({declared: ['docs/a.md'], files: []}).code, 'no_files_returned');
});

test('json is recovered from a fenced model reply', () => {
  assert.deepEqual(extractJson('```json\n{"files":[]}\n```'), {files: []});
  assert.equal(extractJson('no json here'), null);
});
test('traversal and control-plane paths are refused even when declared', () => {
  const cases = [
    ['../../etc/passwd', 'path_traversal'],
    ['docs/../../x.md', 'path_traversal'],
    ['/etc/passwd', 'path_absolute'],
    ['.github/workflows/deploy.yml', 'path_control_plane'],
    ['config/relay-seat-policy.json', 'path_control_plane'],
    ['config/owner-authority-20261119-open-execution.json', 'path_control_plane'],
    ['ops/autoloop/executors.json', 'path_control_plane'],
  ];
  for (const [p, code] of cases) {
    const r = validatePatch({declared: [p], files: [{path: p, content: 'x'}]});
    assert.equal(r.code, code, p);
  }
});
