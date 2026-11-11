import fs from 'node:fs';
import path from 'node:path';

const NETWORK_CODES = ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT', 'UND_ERR_CONNECT_TIMEOUT', 'UND_ERR_SOCKET', 'ENOTFOUND', 'EAI_AGAIN', 'UND_ERR_HEADERS_TIMEOUT'];
const BALANCE_TEXT = /insufficient|quota|credit|余额|额度/i;

export function loadAcceptanceSpec(root) {
  return JSON.parse(fs.readFileSync(path.join(root, 'config/relay-seat-acceptance.json'), 'utf8'));
}

export function readEvidenceDir(root, kind) {
  const dir = path.join(root, 'knowledge/results/relay-seat', kind);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((name) => name.endsWith('.json'))
    .sort()
    .map((name) => {
      const file = path.join(dir, name);
      try {
        return { file: path.relative(root, file), doc: JSON.parse(fs.readFileSync(file, 'utf8')) };
      } catch {
        return { file: path.relative(root, file), doc: null, corrupt: true };
      }
    });
}

export function modelClassOf(doc) {
  if (doc?.model_class) return doc.model_class;
  const model = String(doc?.model_served || doc?.routing?.served_model || doc?.station_model || '');
  if (/^claude/i.test(model)) return 'claude';
  if (/^gpt/i.test(model)) return 'gpt';
  return 'other';
}

export function requestIdOf(doc) {
  return doc?.request_id || doc?.upstream_request_id || doc?.routing?.request_id || null;
}

export function isSuccessfulCall(doc) {
  return Boolean(
    doc &&
      doc.kind === 'relay_seat_call' &&
      doc.ok === true &&
      doc.http === 200 &&
      doc.finish_reason === 'stop' &&
      Number(doc.usage?.completion_tokens) > 0 &&
      Number(doc.cost_usd) > 0,
  );
}

function result(id, status, detail, evidence = []) {
  return { id, status, detail, evidence };
}

function evalSuccess(calls) {
  const hits = calls.filter((entry) => isSuccessfulCall(entry.doc));
  if (!hits.length) return result('real_call_success', 'FAIL', 'no evidence document shows a 200 stop response with output tokens and a recorded cost', calls.map((entry) => entry.file));
  return result('real_call_success', 'PASS', hits.length + ' successful call document(s)', hits.map((entry) => entry.file));
}

function evalClassCoverage(calls, criterion) {
  const success = calls.filter((entry) => isSuccessfulCall(entry.doc));
  const byClass = {};
  for (const entry of success) {
    const key = modelClassOf(entry.doc);
    byClass[key] = (byClass[key] || []).concat(entry.file);
  }
  const missing = criterion.classes.filter((name) => (byClass[name] || []).length < (criterion.min_success_each || 1));
  if (!success.length) return result(criterion.id, 'FAIL', 'no successful call evidence', []);
  if (missing.length) {
    return result(
      criterion.id,
      'INSUFFICIENT',
      'successful calls exist but class coverage is incomplete; missing: ' + missing.join(', ') + ' (seen: ' + Object.keys(byClass).join(', ') + ')',
      success.map((entry) => entry.file),
    );
  }
  return result(criterion.id, 'PASS', 'successful calls cover ' + criterion.classes.join(' + '), Object.values(byClass).flat());
}

function evalRequestIdentity(calls) {
  const success = calls.filter((entry) => isSuccessfulCall(entry.doc));
  if (!success.length) return result('request_identity_recorded', 'FAIL', 'no successful call evidence', []);
  const gaps = [];
  const complete = [];
  for (const entry of success) {
    const doc = entry.doc;
    const missing = [];
    if (!requestIdOf(doc)) missing.push('request_id');
    if (!doc.model_served && !doc.routing?.served_model) missing.push('model_served');
    if (!doc.at) missing.push('at');
    if (!(Number(doc.usage?.prompt_tokens_billed) > 0)) missing.push('usage.prompt_tokens_billed');
    if (!(Number(doc.usage?.completion_tokens) > 0)) missing.push('usage.completion_tokens');
    if (!(Number(doc.duration_ms) >= 0)) missing.push('duration_ms');
    if (missing.length) gaps.push(entry.file + ' missing ' + missing.join('/'));
    else complete.push(entry.file);
  }
  if (gaps.length && !complete.length) return result('request_identity_recorded', 'FAIL', gaps.join('; '), success.map((entry) => entry.file));
  if (gaps.length) return result('request_identity_recorded', 'INSUFFICIENT', gaps.join('; '), complete);
  return result('request_identity_recorded', 'PASS', 'request id, served model, time and usage all recorded', complete);
}

function evalFailureModes(calls, refusals, criterion) {
  const found = {};
  for (const entry of refusals) {
    if (entry.doc?.decision?.code === 'relay_short_request_forbidden' && entry.doc?.sent_http_request === false) {
      found.short_request_refusal = found.short_request_refusal || entry.file;
    }
    if (entry.doc?.decision?.code === 'relay_balance_below_floor' && entry.doc?.decision?.requires_close === true) {
      found.balance_insufficient_or_floor_close = found.balance_insufficient_or_floor_close || entry.file;
    }
  }
  for (const entry of calls) {
    const doc = entry.doc;
    if (!doc) continue;
    const text = JSON.stringify(doc.http_error || doc.error || doc.failure || '');
    if ([402, 429].includes(Number(doc.http)) || BALANCE_TEXT.test(text)) {
      found.balance_insufficient_or_floor_close = found.balance_insufficient_or_floor_close || entry.file;
    }
    if (doc.failure && (NETWORK_CODES.includes(doc.failure.code) || /fetch failed/i.test(String(doc.failure.message || '')))) {
      found.timeout_or_network_failure = found.timeout_or_network_failure || entry.file;
    }
    if (Number(doc.http) === 0) found.timeout_or_network_failure = found.timeout_or_network_failure || entry.file;
  }
  const missing = criterion.required_categories.filter((name) => !found[name]);
  const evidence = Object.values(found);
  if (missing.length === criterion.required_categories.length) {
    return result(criterion.id, 'FAIL', 'no failure-mode evidence at all; missing: ' + missing.join(', '), []);
  }
  if (missing.length) {
    return result(criterion.id, 'INSUFFICIENT', 'missing failure categories: ' + missing.join(', '), evidence);
  }
  return result(criterion.id, 'PASS', 'short-request refusal, balance/floor handling and network failure all evidenced', evidence);
}

function evalNoBusinessCompletion(calls) {
  const success = calls.filter((entry) => isSuccessfulCall(entry.doc));
  if (!success.length) return result('not_counted_as_business_task', 'FAIL', 'no successful call evidence', []);
  const bad = [];
  const good = [];
  for (const entry of success) {
    const effects = entry.doc.effects || {};
    if (effects.business_task_completed === false && effects.authority_effect === 'none') good.push(entry.file);
    else bad.push(entry.file + ' lacks effects.business_task_completed=false / authority_effect=none');
  }
  if (bad.length) return result('not_counted_as_business_task', 'FAIL', bad.join('; '), good);
  return result('not_counted_as_business_task', 'PASS', 'every successful call declares business_task_completed=false and authority_effect=none', good);
}

function evalNoExecutionSurface(calls) {
  const success = calls.filter((entry) => isSuccessfulCall(entry.doc));
  if (!success.length) return result('no_funds_signature_production', 'FAIL', 'no successful call evidence', []);
  const bad = [];
  const good = [];
  for (const entry of success) {
    const effects = entry.doc.effects || {};
    if (effects.funds_or_signature_surface === false && effects.production_write === false) good.push(entry.file);
    else bad.push(entry.file + ' lacks effects.funds_or_signature_surface=false / production_write=false');
  }
  if (bad.length) return result('no_funds_signature_production', 'FAIL', bad.join('; '), good);
  return result('no_funds_signature_production', 'PASS', 'every successful call declares no funds/signature surface and no production write', good);
}

function evalKeyBoundary(calls, refusals, criterion) {
  const docs = [...calls, ...refusals].filter((entry) => entry.doc);
  if (!docs.length) return result('key_boundary_respected', 'FAIL', 'no evidence documents to inspect', []);
  const leak = [];
  const noTransport = [];
  const official = [];
  const patterns = (criterion.forbidden_patterns || []).map((source) => new RegExp(source));
  for (const entry of docs) {
    const text = JSON.stringify(entry.doc);
    if (patterns.some((re) => re.test(text))) leak.push(entry.file);
    if (!entry.doc.key_transport) noTransport.push(entry.file);
  }
  // A refusal never reaches the station, so only call documents must declare non-official routing.
  for (const entry of calls) {
    if (entry.doc?.official_provider_api !== false) official.push(entry.file + ' official_provider_api is not false');
  }
  if (leak.length) return result('key_boundary_respected', 'FAIL', 'key-like material found in evidence: ' + leak.join(', '), leak);
  if (noTransport.length) return result('key_boundary_respected', 'INSUFFICIENT', 'key transport not declared in: ' + noTransport.join(', '), []);
  if (official.length) return result('key_boundary_respected', 'FAIL', 'relay call not marked as non-official: ' + official.join(', '), official);
  return result('key_boundary_respected', 'PASS', 'no key material in evidence; transport and non-official routing declared', docs.map((entry) => entry.file));
}

export function evaluateAcceptance({ spec, calls = [], refusals = [] }) {
  const criteria = [];
  for (const criterion of spec.criteria) {
    if (criterion.type === 'successful_call') criteria.push(evalSuccess(calls));
    else if (criterion.type === 'class_coverage') criteria.push(evalClassCoverage(calls, criterion));
    else if (criterion.type === 'request_identity') criteria.push(evalRequestIdentity(calls));
    else if (criterion.type === 'failure_mode_coverage') criteria.push(evalFailureModes(calls, refusals, criterion));
    else if (criterion.type === 'no_business_completion') criteria.push(evalNoBusinessCompletion(calls));
    else if (criterion.type === 'no_execution_surface') criteria.push(evalNoExecutionSurface(calls));
    else if (criterion.type === 'key_boundary') criteria.push(evalKeyBoundary(calls, refusals, criterion));
    else criteria.push(result(criterion.id, 'FAIL', 'unknown criterion type ' + criterion.type, []));
  }
  const fail = criteria.filter((item) => item.status === 'FAIL');
  const insufficient = criteria.filter((item) => item.status === 'INSUFFICIENT');
  let verdict = 'accepted';
  if (fail.length) verdict = 'not_accepted';
  else if (insufficient.length) verdict = 'insufficient_evidence';
  return {
    spec_id: spec.spec_id,
    verdict,
    counts: { pass: criteria.length - fail.length - insufficient.length, fail: fail.length, insufficient: insufficient.length },
    blocked_by: [...fail, ...insufficient].map((item) => item.id),
    criteria,
  };
}

export function evaluateFromDisk(root) {
  const spec = loadAcceptanceSpec(root);
  return evaluateAcceptance({
    spec,
    calls: readEvidenceDir(root, 'calls'),
    refusals: readEvidenceDir(root, 'refusals'),
  });
}
