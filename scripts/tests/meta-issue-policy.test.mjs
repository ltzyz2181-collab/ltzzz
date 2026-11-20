import test from 'node:test';
import assert from 'node:assert/strict';
import {validateIssueRequest, dedupeQuery, ISSUE_LABELS, SCHEMA} from '../lib/meta-issue-policy.mjs';

const base = {task_id: 'META-PROP-20261120-01', title: '把 archive 映射规则写成一页表', body: '建议先按 6 个主题分组，再逐项回填 canonical_target。'};

test('accepts a normal meta proposal and pins repo, schema and prefix', () => {
  const result = validateIssueRequest(base);
  assert.equal(result.ok, true);
  assert.equal(result.value.schema, SCHEMA);
  assert.equal(result.value.repo, 'ltzyz2181-collab/ltzzz');
  assert.equal(result.value.title, '[meta] 把 archive 映射规则写成一页表');
  assert.deepEqual(result.value.labels, ['meta-proposal']);
  assert.match(result.value.body, /^task_id: META-PROP-20261120-01\nsource: did:ltzzz:meta\n/);
});

test('caller cannot choose the repository', () => {
  const result = validateIssueRequest({...base, repo: 'attacker/evil'});
  assert.equal(result.value.repo, 'ltzyz2181-collab/ltzzz');
});

test('rejects labels outside the allowlist and more than three', () => {
  assert.equal(validateIssueRequest({...base, labels: ['meta-proposal', 'p0']}).ok, false);
  assert.equal(validateIssueRequest({...base, labels: ['meta-proposal', 'meta-review', 'meta-report', 'idea-board']}).ok, false);
  assert.deepEqual(validateIssueRequest({...base, labels: ['meta-review', 'meta-review']}).value.labels, ['meta-review']);
});

test('rejects bad task ids, short titles, empty and oversized bodies', () => {
  assert.equal(validateIssueRequest({...base, task_id: 'a b'}).ok, false);
  assert.equal(validateIssueRequest({...base, task_id: ''}).ok, false);
  assert.equal(validateIssueRequest({...base, title: 'ab'}).ok, false);
  assert.equal(validateIssueRequest({...base, body: '   '}).ok, false);
  const big = validateIssueRequest({...base, body: 'x'.repeat(8001)});
  assert.equal(big.ok, false);
  assert.equal(big.status, 413);
});

test('refuses to publish credential-like text', () => {
  for (const secret of ['ghp_' + 'a'.repeat(24), 'github_pat_' + 'b'.repeat(24), 'sk-' + 'c'.repeat(24), '-----BEGIN RSA PRIVATE KEY-----']) {
    const result = validateIssueRequest({...base, body: '看这个 ' + secret});
    assert.equal(result.ok, false, secret.slice(0, 10));
    assert.equal(result.error, 'credential_like_content_rejected');
  }
});

test('dedupe query is scoped by repo and task id', () => {
  assert.equal(dedupeQuery({repo: 'o/r', taskId: 'T-1'}), 'repo:o/r is:issue in:body "task_id: T-1"');
  assert.deepEqual(ISSUE_LABELS.length, 4);
});