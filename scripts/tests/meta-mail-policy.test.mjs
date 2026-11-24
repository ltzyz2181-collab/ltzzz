import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateMailRequest, mailDedupeQuery, RECIPIENTS, MAIL_LABEL} from '../lib/meta-mail-policy.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const normalize = (value) => String(value || '').toLowerCase().replace(/_/g, '-');

test('owner 2026-11-23: Meta can queue a bounded mail:send card', () => {
  const result = validateMailRequest({
    request_id: 'META-MAIL-20261123-01',
    to: 'owner',
    subject: '测试邮件',
    text: '这是一封通过 relay 排队的测试邮件。',
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.value.labels, [MAIL_LABEL]);
  assert.match(result.value.title, /^mail: \[meta\] /);
  assert.match(result.value.body, /^seat: meta$/m);
  assert.match(result.value.body, /^to: ltzyz2181@gmail\.com$/m);
  assert.match(result.value.body, /^subject: \[seat:meta\] 测试邮件$/m);
  assert.match(result.value.body, /^mail_request_id: META-MAIL-20261123-01$/m);
});

test('Meta cannot pick an arbitrary recipient or mail itself', () => {
  const stranger = validateMailRequest({request_id: 'META-MAIL-20261123-02', to: 'stranger@example.com', subject: '测试邮件', text: '正文'});
  assert.equal(stranger.ok, false);
  assert.equal(stranger.error, 'recipient_not_allowed');
  const self = validateMailRequest({request_id: 'META-MAIL-20261123-03', to: 'meta', subject: '测试邮件', text: '正文'});
  assert.equal(self.ok, false);
  assert.equal(self.error, 'self_recipient_not_allowed');
});

test('credential-like content is rejected before any issue is created', () => {
  const result = validateMailRequest({
    request_id: 'META-MAIL-20261123-04',
    to: 'owner',
    subject: '测试邮件',
    text: 'token github_pat_' + 'A'.repeat(24),
  });
  assert.equal(result.ok, false);
  assert.equal(result.error, 'credential_like_content_rejected');
});

test('subject and text stay inside the granted bounds', () => {
  const longSubject = validateMailRequest({request_id: 'META-MAIL-20261123-05', to: 'owner', subject: 'x'.repeat(81), text: '正文'});
  assert.equal(longSubject.error, 'subject_too_long');
  const longText = validateMailRequest({request_id: 'META-MAIL-20261123-06', to: 'owner', subject: '测试邮件', text: 'y'.repeat(6001)});
  assert.equal(longText.error, 'text_too_long');
});

test('the policy recipient map matches the registry addresses', () => {
  const registry = JSON.parse(fs.readFileSync(path.join(root, 'config/seat-mail-registry.json'), 'utf8'));
  for (const [id, address] of Object.entries(RECIPIENTS)) {
    const seat = registry.seats.find((entry) => normalize(entry.id) === normalize(id));
    assert.ok(seat, 'recipient id missing from registry: ' + id);
    assert.equal(seat.address, address, 'address drift for ' + id);
  }
});

test('dedupe query pins the repository and request id', () => {
  const query = mailDedupeQuery({repo: 'ltzyz2181-collab/ltzzz', requestId: 'META-MAIL-20261123-01'});
  assert.match(query, /^repo:ltzyz2181-collab\/ltzzz /);
  assert.match(query, /mail_request_id: META-MAIL-20261123-01/);
});
