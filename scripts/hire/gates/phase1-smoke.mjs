#!/usr/bin/env node
// Deterministic, read-only acceptance gate for AI-hire Phase1.
//
// Contract:
// - no network, no writes, no credentials, no child processes;
// - exit 0 only when the Phase1 spec and the hardened harness are present and
//   still declare the allowlisted gate.
//
// Orders never supply a command; `scripts/hire-phase1.mjs` maps the allowlisted
// gate id `phase1-smoke` to this fixed file.
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const CHECKS = Object.freeze([
  ['docs/HIRE-AI-PHASE1-SPEC-20261116.md', 'Phase1'],
  ['scripts/hire-phase1.mjs', 'ACCEPTANCE_GATE_ALLOWLIST'],
  ['scripts/hire-phase1.mjs', "'phase1-smoke'"],
]);

function fail(detail) {
  console.error(`phase1-smoke: failed: ${detail}`);
  process.exit(1);
}

for (const [relativePath, needle] of CHECKS) {
  const absolute = resolve(ROOT, relativePath);
  let text;
  try {
    text = readFileSync(absolute, 'utf8');
  } catch {
    fail(`missing: ${relativePath}`);
  }
  if (!text.includes(needle)) fail(`missing marker "${needle}" in ${relativePath}`);
}

console.log('phase1-smoke: ok');
