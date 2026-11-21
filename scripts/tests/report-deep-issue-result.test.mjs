import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  alreadyReported,
  autonomyReceiptPath,
  buildResultComment,
  issueNumberForTask,
  reportQueueReceipt,
  resultMarker,
} from '../report-deep-issue-result.mjs';

const inputSha = 'a'.repeat(64);

test('only ISSUE cards map back to an Issue number', () => {
  assert.equal(issueNumberForTask('DEEP-SUPERAGENT-20261121-ISSUE-472'), 472);
  assert.equal(issueNumberForTask('DEEP-SUPERAGENT-20261121-ISSUE-475-R2'), 475);
  assert.equal(issueNumberForTask('DEEP-SUPERAGENT-20261103'), null);
  assert.equal(issueNumberForTask('DEEP-SUPERAGENT-20261121-ISSUE-0'), null);
  assert.equal(issueNumberForTask(null), null);
  assert.equal(autonomyReceiptPath('DEEP-SUPERAGENT-20261121-ISSUE-472', inputSha), `knowledge/results/deep-superagent/autonomy/DEEP-SUPERAGENT-20261121-ISSUE-472-${inputSha}.json`);
});

test('a merged autonomy receipt becomes a delivered protocol comment with real fields', () => {
  const body = buildResultComment({
    taskId: 'DEEP-SUPERAGENT-20261121-ISSUE-475',
    item: {status: 'job_terminal_observed'},
    autonomy: {
      status: 'executed',
      actions: [{action: 'code_change', status: 'merged', pr: 501, merge_sha: '0e73a4a4168bc8e4feda60b7b5d31ef7e5863307', ci: {status: 'ci_passed'}}],
    },
    runUrl: 'https://github.com/ltzyz2181-collab/ltzzz/actions/runs/1',
    runId: '1',
    issueNumber: 475,
  });
  assert.ok(body.startsWith('[delivered] seat=deep '));
  assert.match(body, /commit=0e73a4a4168bc8e4feda60b7b5d31ef7e5863307/);
  assert.match(body, /pr=https:\/\/github\.com\/ltzyz2181-collab\/ltzzz\/pull\/501/);
  assert.match(body, /ci=ci_passed/);
  assert.match(body, /tests=ci_verified/);
  assert.ok(body.includes(resultMarker({taskId: 'DEEP-SUPERAGENT-20261121-ISSUE-475', runId: '1'})));
});

test('partial or fiduciary-blocked receipts become blocked comments, never delivered', () => {
  const partial = buildResultComment({
    taskId: 'DEEP-SUPERAGENT-20261121-ISSUE-472',
    item: {status: 'job_terminal_observed'},
    autonomy: {status: 'partial', actions: [{action: 'code_change', status: 'rejected', error: 'no_file_writes'}]},
    runId: '1',
    issueNumber: 472,
  });
  assert.ok(partial.startsWith('[blocked] seat=deep reason=deep_partial:no_file_writes'));
  const fiduciary = buildResultComment({
    taskId: 'DEEP-SUPERAGENT-20261121-ISSUE-474',
    autonomy: {status: 'blocked_fiduciary', actions: []},
    runId: '1',
    issueNumber: 474,
  });
  assert.ok(fiduciary.startsWith('[blocked] seat=deep reason=deep_blocked_fiduciary'));
  const missing = buildResultComment({taskId: 'DEEP-SUPERAGENT-20261121-ISSUE-999', runId: '1'});
  assert.ok(missing.startsWith('[blocked] seat=deep reason=deep_status:'));
});

test('the same run never posts the same result twice', async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ltzzz-deep-result-'));
  const receipt = {
    items: [{task_id: 'DEEP-SUPERAGENT-20261121-ISSUE-472', input_sha256: inputSha, status: 'job_terminal_observed'}],
  };
  const calls = [];
  let comments = [];
  const request = async (method, url, body) => {
    calls.push({method, url, body});
    if (method === 'GET') return comments;
    comments = [{body: body.body}];
    return {};
  };
  const first = await reportQueueReceipt({receipt, root, runId: '1', request, repository: 'ltzyz2181-collab/ltzzz'});
  assert.deepEqual(first, [{issue: 472, task_id: 'DEEP-SUPERAGENT-20261121-ISSUE-472', status: 'posted', kind: 'blocked'}]);
  const marker = resultMarker({taskId: 'DEEP-SUPERAGENT-20261121-ISSUE-472', runId: '1'});
  assert.ok(comments[0].body.includes(marker));
  const second = await reportQueueReceipt({receipt, root, runId: '1', request, repository: 'ltzyz2181-collab/ltzzz'});
  assert.deepEqual(second, [{issue: 472, task_id: 'DEEP-SUPERAGENT-20261121-ISSUE-472', status: 'already_reported'}]);
  assert.equal(calls.filter((call) => call.method === 'POST').length, 1);
  assert.equal(alreadyReported([], marker), false);
});
