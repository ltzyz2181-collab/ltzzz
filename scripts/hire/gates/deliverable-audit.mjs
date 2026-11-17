#!/usr/bin/env node
// Order-acceptance gate for AI-hire Phase1.
//
// The order arrives on stdin as canonical JSON. This gate evaluates the order's
// declarative `acceptance_criteria` against the real bytes of the declared
// deliverables and prints a machine-readable result.
//
// It never trusts the order's own claims:
// - every criterion must point at one of the order's evidence paths;
// - every evidence file is re-read, re-hashed and re-checked for symlinks;
// - an empty, whitespace-only or placeholder-only deliverable fails;
// - any unexpected condition exits non-zero, never "accepted".
import {createHash} from 'node:crypto';
import {lstatSync, readFileSync, realpathSync} from 'node:fs';
import {isAbsolute, relative, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {
  EVIDENCE_ALLOWED_ROOTS,
  hashObject,
  normalizeOrder,
  validateAcceptanceCriteria,
  validateEvidence,
} from '../../hire-phase1.mjs';

const GATE_ID = 'deliverable-audit';
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const HASH = /^[0-9a-f]{64}$/;
const PLACEHOLDER = /(?:\bTODO\b|\bTBD\b|\bFIXME\b|\bXXX\b|占位|待补充|待填写|待补齐|<placeholder>|lorem ipsum)/i;
const MAX_BYTES = 10 * 1024 * 1024;

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');

function emit(payload, code) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
  process.exit(code);
}

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function withinAllowedRoot(repoRelativePath) {
  return EVIDENCE_ALLOWED_ROOTS.some(root => (
    repoRelativePath === root || repoRelativePath.startsWith(`${root}/`)
  ));
}

// Re-reads one evidence file with the same containment rules the harness uses.
// Returns {bytes, text, sha256} or throws a gate-local failure code.
function readDeliverable(repoRelativePath, rootReal) {
  const absolute = resolve(rootReal, repoRelativePath);
  const rootRelative = relative(rootReal, absolute);
  if (rootRelative.startsWith(`..${sep}`) || rootRelative === '..' || isAbsolute(rootRelative)) {
    throw new Error(`evidence_path_escape:${repoRelativePath}`);
  }
  if (!withinAllowedRoot(repoRelativePath)) throw new Error(`evidence_path_not_allowed:${repoRelativePath}`);
  const stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) throw new Error(`symlink_evidence_forbidden:${repoRelativePath}`);
  if (!stat.isFile()) throw new Error(`evidence_not_regular_file:${repoRelativePath}`);
  if (stat.size > MAX_BYTES) throw new Error(`evidence_too_large:${repoRelativePath}`);
  const real = realpathSync(absolute);
  const realRelative = relative(rootReal, real).split(sep).join('/');
  if (realRelative.startsWith('..') || isAbsolute(realRelative) || !withinAllowedRoot(realRelative)) {
    throw new Error(`evidence_realpath_outside_allowed_root:${repoRelativePath}`);
  }
  const bytes = readFileSync(real);
  if (bytes.length > MAX_BYTES) throw new Error(`evidence_too_large:${repoRelativePath}`);
  return {bytes, text: bytes.toString('utf8'), sha256: sha256(bytes)};
}

function headingTexts(text) {
  const headings = [];
  for (const line of text.split('\n')) {
    const match = line.match(/^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$/);
    if (match) headings.push(match[1].trim());
  }
  return headings;
}

function evaluate(criterion, deliverable) {
  const {bytes, text} = deliverable;
  switch (criterion.kind) {
    case 'file_min_bytes': {
      const nonWhitespace = text.trim().length;
      if (bytes.length < criterion.min_bytes) {
        return {ok: false, detail: `${bytes.length} bytes < min ${criterion.min_bytes}`};
      }
      if (nonWhitespace === 0) return {ok: false, detail: 'empty_after_trim'};
      return {ok: true, detail: `${bytes.length} bytes`};
    }
    case 'no_placeholder': {
      const match = text.match(PLACEHOLDER);
      if (match) return {ok: false, detail: `placeholder_marker:${match[0]}`};
      if (text.trim().length === 0) return {ok: false, detail: 'empty_after_trim'};
      return {ok: true, detail: 'no placeholder markers'};
    }
    case 'markdown_headings': {
      const headings = headingTexts(text);
      if (headings.length < criterion.min_count) {
        return {ok: false, detail: `${headings.length} headings < min ${criterion.min_count}`};
      }
      const required = criterion.headings || [];
      const missing = required.filter(item => !headings.includes(item));
      if (missing.length) return {ok: false, detail: `missing_heading:${missing.join('|').slice(0, 120)}`};
      return {ok: true, detail: `${headings.length} headings`};
    }
    case 'contains_all': {
      const missing = criterion.needles.filter(needle => !text.includes(needle));
      if (missing.length) return {ok: false, detail: `missing_text:${missing.join('|').slice(0, 120)}`};
      return {ok: true, detail: `${criterion.needles.length} required passages present`};
    }
    case 'json_keys': {
      let parsed;
      try {
        parsed = JSON.parse(text);
      } catch {
        return {ok: false, detail: 'not_valid_json'};
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {ok: false, detail: 'json_root_not_object'};
      }
      const missing = criterion.keys.filter(key => !Object.hasOwn(parsed, key));
      if (missing.length) return {ok: false, detail: `missing_json_keys:${missing.join('|').slice(0, 120)}`};
      return {ok: true, detail: `${criterion.keys.length} keys present`};
    }
    case 'sha256': {
      if (deliverable.sha256 !== criterion.sha256) {
        return {ok: false, detail: `sha256_mismatch:${deliverable.sha256.slice(0, 12)}`};
      }
      return {ok: true, detail: `sha256 ${deliverable.sha256.slice(0, 12)}`};
    }
    default:
      return {ok: false, detail: `unknown_criterion_kind:${criterion.kind}`};
  }
}

function run() {
  const raw = readStdin();
  let order;
  try {
    order = JSON.parse(raw);
  } catch {
    emit({schema: 'ltzzz.hire-gate.v1', gate: GATE_ID, ok: false, reason: 'order_not_json', criteria: [], evidence: [], paid: false, financial_execution: false, amount_usd: 0}, 2);
  }
  if (order === null || typeof order !== 'object' || Array.isArray(order)) {
    emit({schema: 'ltzzz.hire-gate.v1', gate: GATE_ID, ok: false, reason: 'order_not_an_object', criteria: [], evidence: [], paid: false, financial_execution: false, amount_usd: 0}, 2);
  }
  if (order.acceptance_gate !== GATE_ID) {
    emit({schema: 'ltzzz.hire-gate.v1', gate: GATE_ID, ok: false, reason: 'gate_id_mismatch', criteria: [], evidence: [], paid: false, financial_execution: false, amount_usd: 0}, 2);
  }

  const evidenceCheck = validateEvidence(order);
  const criteriaProblems = validateAcceptanceCriteria(order.acceptance_criteria, evidenceCheck.paths);
  const problems = [...evidenceCheck.problems, ...criteriaProblems];
  if (problems.length) {
    emit({
      schema: 'ltzzz.hire-gate.v1',
      gate: GATE_ID,
      ok: false,
      reason: 'invalid_order',
      problems: problems.slice(0, 20),
      criteria: [],
      evidence: [],
      paid: false,
      financial_execution: false,
      amount_usd: 0,
    }, 2);
  }

  const rootReal = realpathSync(ROOT);
  const deliverables = new Map();
  const evidence = [];
  for (const entry of evidenceCheck.evidence) {
    let deliverable;
    try {
      deliverable = readDeliverable(entry.path, rootReal);
    } catch (error) {
      emit({
        schema: 'ltzzz.hire-gate.v1',
        gate: GATE_ID,
        ok: false,
        reason: 'evidence_reread_failed',
        detail: String(error?.message ?? error).slice(0, 200),
        criteria: [],
        evidence: [],
        paid: false,
        financial_execution: false,
        amount_usd: 0,
      }, 2);
    }
    // The harness hashed the file too; a different hash here means the file
    // changed between validation and review, so the audit is not trustworthy.
    if (deliverable.sha256 !== entry.sha256 || deliverable.bytes.length !== entry.bytes) {
      emit({
        schema: 'ltzzz.hire-gate.v1',
        gate: GATE_ID,
        ok: false,
        reason: 'evidence_changed_during_audit',
        detail: entry.path,
        criteria: [],
        evidence: [],
        paid: false,
        financial_execution: false,
        amount_usd: 0,
      }, 2);
    }
    deliverables.set(entry.path, deliverable);
    evidence.push({path: entry.path, sha256: deliverable.sha256, bytes: deliverable.bytes.length});
  }

  const criteria = order.acceptance_criteria.map(criterion => {
    const deliverable = deliverables.get(criterion.path);
    if (!deliverable) {
      return {id: criterion.id, kind: criterion.kind, ok: false, detail: 'deliverable_missing'};
    }
    try {
      const result = evaluate(criterion, deliverable);
      return {id: criterion.id, kind: criterion.kind, ok: result.ok === true, detail: result.detail};
    } catch (error) {
      return {id: criterion.id, kind: criterion.kind, ok: false, detail: `criterion_error:${String(error?.message ?? error).slice(0, 120)}`};
    }
  });

  const ok = criteria.every(item => item.ok === true);
  emit({
    schema: 'ltzzz.hire-gate.v1',
    gate: GATE_ID,
    order_id: order.order_id,
    order_sha256: hashObject(normalizeOrder(order)),
    ok,
    criteria,
    evidence,
    paid: false,
    financial_execution: false,
    amount_usd: 0,
  }, ok ? 0 : 1);
}

try {
  run();
} catch (error) {
  emit({
    schema: 'ltzzz.hire-gate.v1',
    gate: GATE_ID,
    ok: false,
    reason: 'gate_crashed',
    detail: String(error?.message ?? error).slice(0, 200),
    criteria: [],
    evidence: [],
    paid: false,
    financial_execution: false,
    amount_usd: 0,
  }, 2);
}
