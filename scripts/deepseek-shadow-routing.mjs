#!/usr/bin/env node
// Shadow routing test: same card prompt, two DeepSeek models, compare whether
// the model emits the required one-line-per-ref ROUTE output.
//
// This is evidence only. It never changes the main routing model, never merges
// anything and never retries a failed paid call.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';
import {callAgent as defaultCall} from './call-deepseek.mjs';

export const ROUTES = Object.freeze([
  'coordinator_close_with_receipt',
  'needs_gpt_decision',
  'needs_owner_decision',
  'blocked_evidence_needed',
  'deploy_confirm_only',
]);

export const ASK_TARGETS = Object.freeze(['gpt', 'owner', 'evidence']);

export const PROMPT_MODES = Object.freeze(['card', 'worker', 'planner']);

export const PLANNER_SEATS = Object.freeze(['qianwen', 'grok', 'doubao']);

export const WORKER_OVERRIDE = [
  '',
  '---',
  'SHADOW OVERRIDE: You are the worker seat for this run, not the planner.',
  'Ignore any earlier instruction to return planner JSON, tasks or a summary.',
  'Return ONLY one line per ref listed above: ROUTE | <ref> | <route> | <reason <=25 words>',
  'plus ASK | <ref> | gpt|owner|evidence | <what is needed <=30 words> where required.',
  'No markdown, no code fence, no prose.',
].join('\n');

export const PLANNER_OVERRIDE = [
  '',
  '---',
  'SHADOW OVERRIDE: You are the planner seat for this run.',
  'Ignore the worker FORMAT block below. Return ONLY a JSON object:',
  '{"summary":"<=100 chars","tasks":[{"seat":"qianwen|grok|doubao","task":"<=900 chars"}],"needs_gpt_decision":false,"reason":null}',
  'No markdown fence, no prose outside the JSON, no extra keys.',
].join('\n');

export function buildPrompt(cardPrompt, mode = 'card') {
  if (!PROMPT_MODES.includes(mode)) throw new Error('invalid_prompt_mode');
  const base = String(cardPrompt || '');
  if (mode === 'worker') return base + '\n' + WORKER_OVERRIDE;
  if (mode === 'planner') return base + '\n' + PLANNER_OVERRIDE;
  return base;
}
export const REF_PATTERNS = Object.freeze([
  /^- ([0-9a-f]{16}) age=/,
  /^- (B\d{1,3})\b/,
]);

export function extractRefs(prompt) {
  const refs = [];
  const seen = new Set();
  for (const line of String(prompt || '').split(/\r?\n/)) {
    const match = REF_PATTERNS.map(pattern => pattern.exec(line)).find(Boolean);
    if (!match) continue;
    const ref = match[1];
    if (!seen.has(ref)) {
      seen.add(ref);
      refs.push(ref);
    }
  }
  return refs;
}

export function parseRouteOutput(text, refs) {
  const allowed = new Set(refs);
  const routeCount = new Map();
  const askTargets = [];
  const invalid = [];
  const extra = [];
  let routeLines = 0;
  const lines = String(text || '').split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  for (const line of lines) {
    if (line.startsWith('ROUTE |')) {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length < 4) {
        invalid.push({line, reason: 'route_arity'});
        continue;
      }
      const ref = parts[1];
      const route = parts[2];
      const reason = parts[3];
      if (!allowed.has(ref)) invalid.push({line, reason: 'unknown_ref'});
      else if (!ROUTES.includes(route)) invalid.push({line, reason: 'invalid_route'});
      else if (!reason) invalid.push({line, reason: 'empty_reason'});
      else {
        routeLines += 1;
        routeCount.set(ref, (routeCount.get(ref) || 0) + 1);
        askTargets.push({ref, route});
      }
      continue;
    }
    if (line.startsWith('ASK |')) {
      const parts = line.split('|').map(part => part.trim());
      if (parts.length < 4) invalid.push({line, reason: 'ask_arity'});
      else if (!allowed.has(parts[1])) invalid.push({line, reason: 'ask_unknown_ref'});
      else if (!ASK_TARGETS.includes(parts[2])) invalid.push({line, reason: 'ask_bad_target'});
      else if (!parts[3]) invalid.push({line, reason: 'ask_empty'});
      continue;
    }
    extra.push(line);
  }
  const covered = [...routeCount.keys()];
  const missing = refs.filter(ref => !routeCount.has(ref));
  const duplicates = [...routeCount.entries()].filter(([, count]) => count > 1).map(([ref]) => ref);
  const distinctRoutes = [...new Set(askTargets.map(item => item.route))];
  const needAsk = askTargets.filter(item => ['needs_gpt_decision', 'needs_owner_decision', 'blocked_evidence_needed'].includes(item.route));
  return {
    route_lines: routeLines,
    refs_total: refs.length,
    covered_refs: covered.length,
    missing_refs: missing,
    duplicate_refs: duplicates,
    invalid_lines: invalid,
    extra_lines: extra,
    distinct_routes: distinctRoutes,
    route_vocabulary_complete: invalid.every(item => item.reason !== 'invalid_route'),
    ask_expected: needAsk.length,
    output_nonempty: String(text || '').trim().length > 0,
  };
}

export function parsePlannerOutput(text, {seats = PLANNER_SEATS, maxTasks = 3, maxTaskChars = 900} = {}) {
  const base = {ok: false, error: null, summary: null, tasks: [], seats_seen: [], needs_gpt_decision: null};
  const raw = String(text || '').trim();
  if (!raw) return {...base, error: 'empty'};
  const fence = String.fromCharCode(96).repeat(3);
  if (raw.startsWith(fence)) return {...base, error: 'markdown_fence'};
  if (!raw.startsWith('{') || !raw.endsWith('}')) return {...base, error: 'prose_outside_json'};
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return {...base, error: 'invalid_json'};
  }
  const fail = (error, extra = {}) => ({
    ...base,
    error,
    summary: typeof data?.summary === 'string' ? data.summary : null,
    needs_gpt_decision: typeof data?.needs_gpt_decision === 'boolean' ? data.needs_gpt_decision : null,
    ...extra,
  });
  if (!data || typeof data !== 'object' || Array.isArray(data)) return fail('not_object');
  if (typeof data.summary !== 'string' || !data.summary.trim()) return fail('summary_missing');
  if (data.summary.length > 100) return fail('summary_too_long');
  if (!Array.isArray(data.tasks)) return fail('tasks_missing');
  if (data.tasks.length === 0) return fail('tasks_empty');
  if (data.tasks.length > maxTasks) return fail('too_many_tasks', {task_count: data.tasks.length});
  const tasks = [];
  for (const [i, task] of data.tasks.entries()) {
    if (!task || typeof task !== 'object') return fail('task_not_object', {task_index: i});
    if (typeof task.seat !== 'string' || !task.seat.trim()) return fail('task_seat_missing', {task_index: i});
    if (!seats.includes(task.seat)) return fail('invalid_seat', {task_index: i, seat: task.seat});
    if (typeof task.task !== 'string' || !task.task.trim()) return fail('task_text_missing', {task_index: i});
    if (task.task.length > maxTaskChars) return fail('task_too_long', {task_index: i, task_chars: task.task.length});
    tasks.push({seat: task.seat, task: task.task});
  }
  if (typeof data.needs_gpt_decision !== 'boolean') return fail('needs_gpt_decision_not_boolean');
  if (data.needs_gpt_decision && (typeof data.reason !== 'string' || !data.reason.trim())) return fail('reason_required');
  const seatsSeen = [...new Set(tasks.map(t => t.seat))];
  if (seatsSeen.length !== tasks.length) return fail('duplicate_seat');
  return {ok: true, error: null, summary: data.summary, tasks, seats_seen: seatsSeen, needs_gpt_decision: data.needs_gpt_decision, reason: data.reason ?? null};
}

export function evaluateShadow(text, refs, {requireAllFive = false, mode = 'worker'} = {}) {
  if (mode === 'planner') {
    const planner = parsePlannerOutput(text);
    return {
      ...planner,
      route_lines: 0,
      refs_total: refs.length,
      covered_refs: 0,
      missing_refs: [],
      duplicate_refs: [],
      invalid_lines: [],
      extra_lines: [],
      distinct_routes: [],
      all_five_present: false,
      pass: planner.ok && planner.tasks.length >= 1 && planner.tasks.length <= 3,
    };
  }
  const parsed = parseRouteOutput(text, refs);
  const ok = parsed.output_nonempty
    && parsed.missing_refs.length === 0
    && parsed.duplicate_refs.length === 0
    && parsed.invalid_lines.length === 0
    && parsed.extra_lines.length === 0
    && parsed.route_lines === refs.length
    && (!requireAllFive || parsed.distinct_routes.length === 5);
  return {...parsed, all_five_present: parsed.distinct_routes.length === 5, pass: ok};
}
function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

export function newestDailyCard(root = process.cwd()) {
  const dir = path.join(root, 'ops', 'deep-superagent', 'tasks');
  if (!fs.existsSync(dir)) return null;
  const files = fs.readdirSync(dir)
    .filter(name => /^DEEP-SUPERAGENT-\d{8}-DAILY-\d+\.json$/.test(name))
    .sort();
  return files.length ? path.join(dir, files[files.length - 1]) : null;
}

export async function runShadow({
  cardPath,
  models = ['deepseek-v4-pro', 'deepseek-flash'],
  maxTokens = 1024,
  thinking = 'disabled',
  promptMode = 'card',
  requireAllFive = false,
  call = defaultCall,
  apiKey = process.env.DEEPSEEK_API_KEY,
  outPath = null,
  now = () => new Date().toISOString(),
} = {}) {
  const cardFile = cardPath || newestDailyCard();
  if (!cardFile || !fs.existsSync(cardFile)) {
    return {ok: false, status: 'card_not_found', card: cardFile || null};
  }
  const raw = fs.readFileSync(cardFile, 'utf8');
  const card = JSON.parse(raw);
  if (!PROMPT_MODES.includes(promptMode)) return {ok: false, status: 'invalid_prompt_mode', card: cardFile};
  const prompt = buildPrompt(card.prompt, promptMode);
  const refs = extractRefs(prompt);
  if (!refs.length) return {ok: false, status: 'no_refs_in_card', card: cardFile};
  if (!apiKey) {
    return {ok: false, status: 'not_configured', error: 'DEEPSEEK_API_KEY 未配置', card: cardFile, refs: refs.length};
  }

  const perModel = [];
  for (const model of models) {
    const result = await call({apiKey, prompt, model, maxTokens, thinking});
    const output = typeof result.output === 'string' ? result.output : '';
    perModel.push({
      model,
      provider_status: result.status || null,
      ok: result.ok === true,
      request_id: result.request_id || null,
      finish_reason: result.finish_reason || null,
      tokens_used: result.tokens_used ?? null,
      output_chars: output.length,
      output_sha256: sha256(output),
      output,
      evaluation: evaluateShadow(output, refs, {requireAllFive, mode: promptMode === 'planner' ? 'planner' : 'worker'}),
    });
  }

  const pro = perModel.find(item => item.model === 'deepseek-v4-pro');
  const flash = perModel.find(item => item.model === 'deepseek-flash');
  const verdict = {
    pro_pass: Boolean(pro?.evaluation.pass),
    flash_pass: Boolean(flash?.evaluation.pass),
    flash_regression: Boolean(pro?.evaluation.pass && flash && !flash.evaluation.pass),
    recommendation: pro?.evaluation.pass && flash && !flash.evaluation.pass
      ? 'keep_pro_as_main_line; flash not eligible for multi-ref routing'
      : 'keep_pro_as_main_line; flash remains limited to search/fetch',
  };

  const receipt = {
    schema: 'ltzzz.deepseek.shadow-routing.v1',
    at: now(),
    card: cardFile,
    card_sha256: sha256(raw),
    card_task_id: card.task_id || null,
    refs_total: refs.length,
    models,
    max_tokens: maxTokens,
    thinking,
    prompt_mode: promptMode,
    prompt_sha256: sha256(prompt),
    require_all_five: requireAllFive,
    per_model: perModel,
    verdict,
    notes: [
      'Shadow only; no routing change, no merge, no deployment.',
      'deepseek-flash is the official flash channel; the 1017 update is a version notice, not a new model id in /v1/models.',
      'A failed call is recorded once and never retried blindly.',
    ],
  };

  if (outPath) {
    fs.mkdirSync(path.dirname(outPath), {recursive: true});
    fs.writeFileSync(outPath, JSON.stringify(receipt, null, 2) + '\n', 'utf8');
    receipt.receipt_path = outPath;
  }
  return {ok: true, status: 'shadow_completed', receipt};
}

const USAGE = [
  'Usage:',
  '  node scripts/deepseek-shadow-routing.mjs [--card <path>] [--models a,b] [--max-tokens 1024] [--prompt-mode card|worker|planner] [--thinking enabled|disabled] [--require-all-five] [--out <path>] [--json]',
  '  node scripts/deepseek-shadow-routing.mjs --help',
  '',
  'Runs the same card prompt on deepseek-v4-pro and deepseek-flash, then checks',
  'that every ref has exactly one valid ROUTE line and no prose leaked.',
].join('\n');

export async function main(argv = process.argv.slice(2)) {
  const {values} = parseArgs({
    args: argv,
    options: {
      card: {type: 'string'},
      models: {type: 'string'},
      'max-tokens': {type: 'string'},
      'prompt-mode': {type: 'string'},
      thinking: {type: 'string'},
      'require-all-five': {type: 'boolean'},
      out: {type: 'string'},
      json: {type: 'boolean'},
      help: {type: 'boolean'},
    },
    strict: true,
    allowPositionals: false,
  });
  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const models = values.models ? values.models.split(',').map(item => item.trim()).filter(Boolean) : ['deepseek-v4-pro', 'deepseek-flash'];
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\..+/, 'Z');
  const outPath = values.out || path.join('knowledge/results/deepseek-shadow', 'shadow-' + stamp + '.json');
  if (!['enabled', 'disabled'].includes(values.thinking || 'disabled')) {
    console.error('invalid --thinking (enabled|disabled)');
    return 2;
  }
  const result = await runShadow({
    cardPath: values.card,
    models,
    maxTokens: values['max-tokens'] ? Number(values['max-tokens']) : 1024,
    promptMode: values['prompt-mode'] || 'card',
    thinking: values.thinking || 'disabled',
    requireAllFive: values['require-all-five'] === true,
    outPath,
  });
  if (values.json) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.ok) {
    const receipt = result.receipt;
    console.log('shadow_completed card=' + receipt.card_task_id);
    for (const row of receipt.per_model) {
      console.log('- ' + row.model + ': ok=' + row.ok + ' pass=' + row.evaluation.pass + ' covered=' + row.evaluation.covered_refs + '/' + row.evaluation.refs_total + ' missing=' + row.evaluation.missing_refs.length + ' invalid=' + row.evaluation.invalid_lines.length + ' extra=' + row.evaluation.extra_lines.length + ' tokens=' + row.tokens_used);
    }
    console.log('verdict: ' + JSON.stringify(receipt.verdict));
    console.log('receipt: ' + outPath);
  } else {
    console.error(result.status + ': ' + (result.error || ''));
  }
  return result.ok ? 0 : 1;
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : null;
if (invokedPath && invokedPath === import.meta.url) {
  main().then(code => {
    process.exitCode = code;
  }).catch(error => {
    console.error((error.code || 'error') + ': ' + error.message);
    process.exitCode = 2;
  });
}