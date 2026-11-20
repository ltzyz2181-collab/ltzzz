export const SCHEMA = 'ltzzz.meta-issue.v1';
export const ISSUE_LABELS = ['meta-proposal', 'meta-review', 'meta-report', 'idea-board'];
export const MAX_TITLE = 120;
export const MAX_BODY = 8000;
export const TASK_ID = /^[A-Za-z0-9._:-]{3,100}$/;

const SECRET_PATTERNS = [
  /gh[pousr]_[A-Za-z0-9]{20,}/,
  /github_pat_[A-Za-z0-9_]{20,}/,
  /sk-[A-Za-z0-9_-]{20,}/,
  /xox[baprs]-[A-Za-z0-9-]{10,}/,
  /AKIA[0-9A-Z]{16}/,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
];

const fail = (error, status) => ({ok: false, error, status});

// Meta may open an issue, never choose a repo, a token or a label outside the list.
// The same policy runs inside the Worker and inside the tests, so deployed behaviour
// and tested behaviour cannot drift apart.
export function validateIssueRequest(raw, {repo = 'ltzyz2181-collab/ltzzz'} = {}) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('body_must_be_object', 400);

  const taskId = typeof raw.task_id === 'string' ? raw.task_id.trim() : '';
  if (!TASK_ID.test(taskId)) return fail('task_id_invalid', 400);

  let title = typeof raw.title === 'string' ? raw.title.trim() : '';
  if (title.length < 4) return fail('title_too_short', 400);
  if (title.length > MAX_TITLE - 7) return fail('title_too_long', 400);
  if (!/^\[meta\]/i.test(title)) title = '[meta] ' + title;

  const text = typeof raw.body === 'string' ? raw.body.trim() : '';
  if (!text) return fail('body_required', 400);
  if (text.length > MAX_BODY) return fail('body_too_long', 413);

  const scan = title + '\n' + text;
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(scan)) return fail('credential_like_content_rejected', 422);
  }

  let labels = raw.labels === undefined ? ['meta-proposal'] : raw.labels;
  if (!Array.isArray(labels) || labels.length === 0 || labels.length > 3) return fail('labels_invalid', 400);
  for (const label of labels) {
    if (typeof label !== 'string' || !ISSUE_LABELS.includes(label)) return fail('label_not_allowed', 400);
  }
  labels = [...new Set(labels)];

  const body = ['task_id: ' + taskId, 'source: did:ltzzz:meta', '', text].join('\n');
  return {ok: true, value: {schema: SCHEMA, repo, taskId, title, body, labels}};
}

export function dedupeQuery({repo, taskId}) {
  return 'repo:' + repo + ' is:issue in:body "task_id: ' + taskId + '"';
}