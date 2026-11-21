#!/usr/bin/env node
// 用法：
//   node scripts/agent-wake.mjs check --text <file> [--date YYYY-MM-DD] [--now ISO8601] [--seats a,b]
//   node scripts/agent-wake.mjs record --entry <json>
//   node scripts/agent-wake.mjs spend [--date YYYY-MM-DD]
import fs from 'node:fs';
import path from 'node:path';
import {
  WAKE_SCHEMA,
  parseWakeRequests,
  decideWake,
  appendEvent,
  spendSummary,
  readLedger,
  serializeLedger
} from './lib/agent-wake.mjs';

const DEFAULT_LEDGER = 'knowledge/results/agent-wake/ledger.json';
// 席位表默认取仓库登记的 12 席；不传 --seats 时不至于把所有请求判成未知席位。
const DEFAULT_REGISTRY = 'config/seat-mail-registry.json';

function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const item = argv[index];
    if (!item.startsWith('--')) continue;
    const body = item.slice(2);
    const eq = body.indexOf('=');
    if (eq !== -1) {
      args[body.slice(0, eq)] = body.slice(eq + 1);
      continue;
    }
    const next = argv[index + 1];
    if (next !== undefined && !next.startsWith('--')) {
      args[body] = next;
      index += 1;
    } else {
      args[body] = true;
    }
  }
  return args;
}

function todayUtc() {
  return new Date().toISOString().slice(0, 10);
}

function resolveDate(raw) {
  if (raw === undefined) return todayUtc();
  const value = String(raw).trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00.000Z`))) {
    throw new Error('invalid_date');
  }
  return value;
}

function readLedgerFile(file) {
  if (!fs.existsSync(file)) return {schema: WAKE_SCHEMA, events: []};
  return readLedger(fs.readFileSync(file, 'utf8'));
}

function writeLedgerFile(file, ledger) {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, serializeLedger(ledger), 'utf8');
}

function registrySeats(file) {
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    const list = Array.isArray(parsed?.seats) ? parsed.seats : [];
    return list.map(seat => seat?.id ?? seat?.name ?? seat?.seat).filter(Boolean);
  } catch {
    return [];
  }
}

function resolveNow(args, date) {
  if (args.now === undefined) return `${date}T00:00:00.000Z`;
  if (args.now === true) throw new Error('invalid_now');
  const ms = Date.parse(String(args.now));
  if (!Number.isFinite(ms)) throw new Error('invalid_now');
  return new Date(ms).toISOString();
}

function readTextFile(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error('text_file_not_found');
  }
}

function readEntryFile(file) {
  let raw;
  try {
    raw = fs.readFileSync(file, 'utf8');
  } catch {
    throw new Error('entry_file_not_found');
  }
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('agent_wake_entry_invalid_json');
  }
}

function emit(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}

function runCheck(args, ledgerPath) {
  if (!args.text || args.text === true) throw new Error('missing_text');
  const parsed = parseWakeRequests(readTextFile(String(args.text)));
  const date = resolveDate(args.date);
  const now = resolveNow(args, date);
  const registry = args.seats && args.seats !== true
    ? String(args.seats).split(',').map(seat => seat.trim()).filter(Boolean)
    : registrySeats(DEFAULT_REGISTRY);
  const ledger = readLedgerFile(ledgerPath);

  const decisions = [];
  // 非法行也以 blocked_request 呈现，避免静默丢单。
  for (const item of parsed.invalid) {
    decisions.push({
      action: 'blocked_request',
      reason: item.reason,
      dedupe_key: null,
      topic: null,
      seats: [],
      budget_usd: 0,
      spend: spendSummary(ledger.events, {date}),
      line: item.line,
      text: item.text
    });
  }
  for (const request of parsed.requests) {
    decisions.push({
      ...decideWake({
        request,
        context: {date},
        events: ledger.events,
        registrySeats: registry,
        now
      }),
      line: request.line
    });
  }

  emit({schema: WAKE_SCHEMA, command: 'check', decisions});
}

function runRecord(args, ledgerPath) {
  if (!args.entry || args.entry === true) throw new Error('missing_entry');
  const entry = readEntryFile(String(args.entry));
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    throw new Error('agent_wake_entry_invalid_json');
  }
  const ledger = readLedgerFile(ledgerPath);
  const appended = appendEvent(ledger.events, entry, {now: new Date().toISOString()});
  writeLedgerFile(ledgerPath, {schema: ledger.schema, events: appended.events});
  emit({
    schema: WAKE_SCHEMA,
    command: 'record',
    event_id: appended.entry.event_id,
    total_events: appended.events.length
  });
}

function runSpend(args, ledgerPath) {
  const date = resolveDate(args.date);
  const ledger = readLedgerFile(ledgerPath);
  const spend = spendSummary(ledger.events, {date});
  emit({
    schema: WAKE_SCHEMA,
    command: 'spend',
    daily_usd: spend.daily_usd,
    project_usd: spend.project_usd
  });
}

function main() {
  const argv = process.argv.slice(2);
  const command = argv[0];
  const args = parseArgs(argv.slice(1));
  const ledgerPath = path.resolve(typeof args.ledger === 'string' ? args.ledger : DEFAULT_LEDGER);

  if (command === 'check') runCheck(args, ledgerPath);
  else if (command === 'record') runRecord(args, ledgerPath);
  else if (command === 'spend') runSpend(args, ledgerPath);
  else throw new Error('unknown_command');
}

try {
  main();
  process.exitCode = 0;
} catch (error) {
  process.stderr.write(`[agent-wake] ${error?.message || 'unknown_error'}\n`);
  process.exitCode = 2;
}
