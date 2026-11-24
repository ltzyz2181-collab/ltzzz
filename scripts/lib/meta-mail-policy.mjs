export const SCHEMA = 'ltzzz.meta-mail.v1';
export const MAX_SUBJECT = 80;
export const MAX_TEXT = 6000;
export const MAX_TITLE = 120;
export const REQUEST_ID = /^[A-Za-z0-9._:-]{3,100}$/;
export const MAIL_LABEL = 'mail:send';

// Owner 2026-11-23: Meta may use the mail:send relay, but only within this bounded
// recipient list. It gets no PAT and no SMTP credential; the worker only opens the
// queue card and the scheduled relay does the sending.
export const RECIPIENTS = {
  owner: 'ltzyz2181@gmail.com',
  doubao: 'qingqizhu6502@agent.qq.com',
  workbuddy: 'sgii7122@agent.qq.com',
  deep: 'qingqizhu6502@agent.qq.com',
  'desktop-gpt': '306122054@qq.com',
  'desktop-claude': '306122054@qq.com',
  'relay-gpt': '306122054@qq.com',
  'relay-claude': '306122054@qq.com',
  'kimi-cn': '306122054@qq.com',
  xai: '306122054@qq.com',
};

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const fail = (error, status) => ({ok: false, error, status});
const normalize = (value) => String(value || '').trim().toLowerCase().replace(/^did:ltzzz:/, '').replace(/_/g, '-');

export function validateMailRequest(raw, {repo = 'ltzyz2181-collab/ltzzz'} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('body_must_be_object', 400);

  const requestId = typeof raw.request_id === 'string' ? raw.request_id.trim()
    : typeof raw.task_id === 'string' ? raw.task_id.trim() : '';
  if (!REQUEST_ID.test(requestId)) return fail('request_id_invalid', 400);

  const toId = normalize(raw.to);
  if (!toId) return fail('recipient_required', 400);
  if (toId === 'meta') return fail('self_recipient_not_allowed', 400);
  const address = RECIPIENTS[toId];
  if (!address) return fail('recipient_not_allowed', 400);

  const subject = typeof raw.subject === 'string' ? raw.subject.trim() : '';
  if (subject.length < 4) return fail('subject_too_short', 400);
  if (subject.length > MAX_SUBJECT) return fail('subject_too_long', 400);

  const text = typeof raw.text === 'string' ? raw.text.trim()
    : typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!text) return fail('text_required', 400);
  if (text.length > MAX_TEXT) return fail('text_too_long', 413);

  const scan = subject + '\n' + text;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(scan)) return fail('credential_like_content_rejected', 422);
  }

  const dedupeKey = typeof raw.dedupe_key === 'string' && raw.dedupe_key.trim()
    ? raw.dedupe_key.trim().slice(0, 100) : requestId;
  const threadSubject = '[seat:meta] ' + subject;
  const title = ('mail: [meta] ' + subject).slice(0, MAX_TITLE);
  const body = [
    'seat: meta',
    'to: ' + address,
    'subject: ' + threadSubject,
    'dedupe_key: ' + dedupeKey,
    'mail_request_id: ' + requestId,
    '',
    '---',
    '',
    text,
  ].join('\n');

  return {
    ok: true,
    value: {schema: SCHEMA, repo, requestId, to: toId, address, subject: threadSubject, title, body, labels: [MAIL_LABEL]},
  };
}

export function mailDedupeQuery({repo, requestId}) {
  return 'repo:' + repo + ' is:issue in:body "mail_request_id: ' + requestId + '"';
}
