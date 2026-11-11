import fs from 'node:fs';
import path from 'node:path';
import { evaluateFromDisk } from './lib/relay-seat-acceptance.mjs';

const root = process.cwd();
const report = evaluateFromDisk(root);
report.generated_at = new Date().toISOString();
report.verdict_path = 'knowledge/results/relay-seat/acceptance-verdict.json';

if (!process.argv.includes('--no-write')) {
  const target = path.join(root, report.verdict_path);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(report, null, 2) + '\n');
}

process.stdout.write(JSON.stringify(report, null, 2) + '\n');

// Exit code carries the verdict so a seat cannot mistake "files exist" for "accepted".
process.exitCode = report.verdict === 'accepted' ? 0 : report.verdict === 'insufficient_evidence' ? 4 : 5;
