#!/usr/bin/env node
// Card contract check: a card must not ask for two incompatible output
// contracts at once. Measured 2026-11-17: a card carrying both
// "Planner ... return ONLY JSON" and "Worker ... one line per ref" made both
// DeepSeek channels answer the planner half and emit zero ROUTE lines, which is
// exactly how the queue stalled. Split the card instead of hoping the model
// picks the right half.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

export const PLANNER_RE = /planner[^\n]{0,60}return only json|"tasks"\s*:\s*\[/i;
export const WORKER_RE = /one line per ref|^\s*ROUTE\s*\|/im;

export function analyzeCardPrompt(prompt) {
  const text = String(prompt || '');
  const hasPlanner = PLANNER_RE.test(text);
  const hasWorker = WORKER_RE.test(text);
  return {
    has_planner: hasPlanner,
    has_worker: hasWorker,
    mixed: hasPlanner && hasWorker,
    verdict: hasPlanner && hasWorker ? 'split_required' : 'ok',
    refs: (text.match(/^- [0-9a-f]{16} age=/gm) || []).length + (text.match(/^- B\d{1,3}\b/gm) || []).length,
  };
}

export function checkDir(dir) {
  const rows = [];
  for (const name of fs.readdirSync(dir).filter(n => n.endsWith('.json')).sort()) {
    const file = path.join(dir, name);
    let card;
    try {
      card = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch {
      rows.push({file: name, error: 'invalid_json'});
      continue;
    }
    rows.push({file: name, task_id: card.task_id || null, ...analyzeCardPrompt(card.prompt)});
  }
  return rows;
}

export function main(argv = process.argv.slice(2)) {
  const strict = argv.includes('--strict');
  const dirArg = argv.includes('--dir') ? argv[argv.indexOf('--dir') + 1] : 'ops/deep-superagent/tasks';
  const rows = checkDir(dirArg);
  const mixed = rows.filter(r => r.mixed);
  for (const r of rows) {
    if (r.error) { console.log(`${r.file}\tERROR\t${r.error}`); continue; }
    if (r.mixed) console.log(`${r.file}\tMIXED\tplanner=${r.has_planner} worker=${r.has_worker} refs=${r.refs}\t${r.task_id || ''}`);
  }
  console.log(`cards=${rows.length}; mixed=${mixed.length}`);
  if (strict && mixed.length) return 1;
  return 0;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) process.exitCode = main();