import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isoWeek,
  themeForWeek,
  weeklyDedupeKey,
  buildWeeklyWakeLine,
  buildWeeklyIssueBody,
  buildWeeklyQuestions,
  weeklyIssueTitle,
  weekMarker,
  WEEKLY_THEMES
} from '../lib/wake-weekly.mjs';

test('isoWeek follows ISO-8601 across a year boundary', () => {
  assert.equal(isoWeek('2026-01-01T00:00:00Z'), '2026-W01');
  assert.equal(isoWeek('2026-11-21T04:00:00Z'), '2026-W47');
  assert.equal(isoWeek('2025-12-29T00:00:00Z'), '2026-W01');
});

test('the theme rotates and is stable within one week', () => {
  const week = '2026-W47';
  assert.equal(themeForWeek(week).key, themeForWeek(week).key);
  assert.ok(WEEKLY_THEMES.some(theme => theme.key === themeForWeek(week).key));
  const seen = new Set(['2026-W44', '2026-W45', '2026-W46', '2026-W47'].map(w => themeForWeek(w).key));
  assert.equal(seen.size, 4, '四周应覆盖四个不同主题');
});

test('the wake line carries an explicit weekly dedupe key', () => {
  const line = buildWeeklyWakeLine({week: '2026-W47', seats: ['doubao', 'qianwen']});
  assert.match(line, /^\[wake\] topic=/);
  assert.match(line, /dedupe_key=weekly:2026-W47/);
  assert.match(line, /budget_usd=0\.01/);
  assert.doesNotMatch(line, /\n/);
  assert.equal(weeklyDedupeKey('2026-W47'), 'weekly:2026-W47');
});

test('different weeks never share a dedupe key', () => {
  assert.notEqual(weeklyDedupeKey('2026-W47'), weeklyDedupeKey('2026-W48'));
});

test('a weekly card refuses to build without seats', () => {
  assert.throws(() => buildWeeklyWakeLine({week: '2026-W47', seats: []}), /weekly_missing_seats/);
});

test('the card body has questions, the wake line, the boundaries and a week marker', () => {
  const body = buildWeeklyIssueBody({week: '2026-W47', seats: ['doubao', 'deep', 'desktop_claude']});
  assert.match(body, /每周创新讨论/);
  assert.match(body, /^\[wake\] topic=.*dedupe_key=weekly:2026-W47/m);
  assert.match(body, /agreed \/ split \/ insufficient_evidence/);
  assert.match(body, /not_required（/);
  assert.ok(body.includes(weekMarker('2026-W47')));
  assert.equal(buildWeeklyQuestions('2026-W47').length, 3);
  assert.equal(weeklyIssueTitle('2026-W47'), '[每周创新讨论] 2026-W47');
});

test('an explicit agenda replaces the fallback wording', () => {
  const body = buildWeeklyIssueBody({week: '2026-W47', seats: ['doubao'], agenda: '中转克劳德建议：先收窄到邮箱通道。'});
  assert.match(body, /中转克劳德建议/);
  assert.doesNotMatch(body, /轮换模板兜底/);
});
