#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import {evaluateDebate, renderDebateReport, isoWeekKey} from './lib/agent-debate.mjs';
import {loadMemoryContext, buildMemoryBriefing} from './lib/memory-context.mjs';

function parseArgs(argv) {
  const args = {};
  for (const item of argv) {
    if (!item.startsWith('--')) continue;
    const index = item.indexOf('=');
    if (index === -1) args[item.slice(2)] = true;
    else args[item.slice(2, index)] = item.slice(index + 1);
  }
  return args;
}

function readComments(file) {
  const raw = fs.readFileSync(file, 'utf8');
  const parsed = JSON.parse(raw);
  if (Array.isArray(parsed)) return parsed;
  if (Array.isArray(parsed.comments)) return parsed.comments;
  throw new Error('comments_json_must_be_array_or_{comments:[]}');
}

function numberArg(value, fallback) {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const args = parseArgs(process.argv.slice(2));
const root = path.resolve(args.root || '.');
const commentsFile = args.comments;
if (!commentsFile) {
  console.error('missing --comments=<json>');
  process.exit(2);
}

const now = args.now ? (Date.parse(args.now) || Date.now()) : Date.now();
const policy = {
  maxPerCycle: numberArg(args['max-per-cycle'], undefined),
  maxRounds: numberArg(args['max-rounds'], undefined),
  maxPerSeatPerRound: numberArg(args['max-per-seat-per-round'], undefined),
  minAvgScore: numberArg(args['min-avg-score'], undefined),
  staleDays: numberArg(args['stale-days'], undefined),
  landDays: numberArg(args['land-days'], undefined)
};
for (const key of Object.keys(policy)) {
  if (policy[key] === undefined) delete policy[key];
}

const commit = args.commit || process.env.GITHUB_SHA || null;
const memory = loadMemoryContext({root, commit, now});
const comments = readComments(commentsFile);
const evaluation = evaluateDebate({comments, now, policy});

const report = {
  schema: 'ltzzz.agent-debate-report.v1',
  task_id: args['task-id'] || 'LTZZZ-AGENT-DEBATE-CYCLE',
  generated_at: new Date(now).toISOString(),
  week: isoWeekKey(now),
  memory: {
    schema: memory.schema,
    complete: memory.complete,
    digest: memory.digest,
    commit: memory.commit,
    loaded_at: memory.loaded_at,
    missing: memory.missing,
    files: memory.files.map(file => ({
      name: file.name,
      path: file.path,
      sha256: file.sha256,
      bytes: file.bytes,
      missing: file.missing
    }))
  },
  ...evaluation
};

if (args['out-json']) {
  fs.mkdirSync(path.dirname(path.resolve(args['out-json'])), {recursive: true});
  fs.writeFileSync(args['out-json'], `${JSON.stringify(report, null, 2)}\n`);
}

const markdown = renderDebateReport(report, {
  title: args.title || `LTZZZ 方向讨论周期报告 ${report.week}`
});

if (args['out-md']) {
  fs.mkdirSync(path.dirname(path.resolve(args['out-md'])), {recursive: true});
  fs.writeFileSync(args['out-md'], `${markdown}\n`);
}

if (args['memory-briefing']) {
  fs.mkdirSync(path.dirname(path.resolve(args['memory-briefing'])), {recursive: true});
  fs.writeFileSync(args['memory-briefing'], `${buildMemoryBriefing(memory, {maxCharsPerFile: numberArg(args['briefing-chars'], 800)})}\n`);
}

console.log(JSON.stringify({
  schema: report.schema,
  week: report.week,
  generated_at: report.generated_at,
  memory_complete: report.memory.complete,
  memory_digest: report.memory.digest,
  counts: report.counts,
  selected: report.selected.map(item => item.id),
  overdue: report.overdue.map(item => item.id),
  escalations: report.escalations.map(item => `${item.id}:${item.reason}`),
  wakes: report.wakes.filter(wake => wake.wake).map(wake => `${wake.event}:${wake.id}`)
}, null, 2));

if (!report.memory.complete) {
  console.error(`warning: memory incomplete (${report.memory.missing.join(',')})`);
}
