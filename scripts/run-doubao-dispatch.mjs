import {callWithSkill} from './lib/ltzzz-skill.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {callAgent} from './call-doubao.mjs';
import {assessDelivery,validRequiredSections,deliveryRequirementsPrompt} from './delivery-integrity.mjs';

/**
 * Doubao dispatch consumer. Cards: ops/dispatch/queue-doubao/*.json (agent "doubao").
 * Separate directory from the Qwen queue on purpose: the Qwen consumer picks the
 * first unseen card by filename and would otherwise write a rejection receipt for a
 * Doubao card, poisoning it.
 *
 * Same guarantees as the Qwen lane: at most one card per run, the receipt is written
 * and pushed BEFORE the provider call so a crash can never cause a second paid call.
 * Output is a DRAFT only: never accepted/deployed/paid, and an independent review by
 * another provider is still required.
 *
 * Doubao may only be reached through the existing proxy (no direct-key fallback),
 * which is the repository rule for this seat.
 */
const ID = /^[A-Z0-9][A-Z0-9_-]{6,80}$/;
const ORIGINAL_TASK = /^[A-Za-z0-9][A-Za-z0-9_-]{5,120}$/;
const MAX_PROMPT = 40000;
const MIN_TOKENS = 256;
const MAX_TOKENS = 4096;
const sha = s => createHash('sha256').update(s).digest('hex');

export function validateCard(card, file) {
  const errors = [];
  if (!card || typeof card !== 'object') return ['not_an_object'];
  if (!ID.test(card.id || '')) errors.push('invalid_id');
  if (path.basename(file, '.json') !== card.id) errors.push('filename_must_equal_id');
  if (card.agent !== 'doubao') errors.push('agent_must_be_doubao');
  if (typeof card.prompt !== 'string' || card.prompt.trim().length < 20 || card.prompt.length > MAX_PROMPT) errors.push(`prompt_20_to_${MAX_PROMPT}_chars`);
  // Static review cards must carry the code bytes they review, so the ceiling is
  // higher than the Qwen lane. It stays bounded: no card may become an unbounded input.
  const mt = card.max_tokens ?? 1024;
  if (!Number.isSafeInteger(mt) || mt < MIN_TOKENS) errors.push('max_tokens_too_small');
  if (mt > MAX_TOKENS) errors.push(`max_tokens_doubao_ceiling_${MAX_TOKENS}`);
  if (card.model !== undefined && !/^doubao[a-zA-Z0-9_.-]*$/i.test(card.model)) errors.push('invalid_model');
  if (card.real_money === true) errors.push('real_money_not_allowed_in_doubao_dispatch');
  if (Object.hasOwn(card, 'required_sections') && !validRequiredSections(card.required_sections)) errors.push('invalid_required_sections');
  if (Object.hasOwn(card, 'original_task_id') && (typeof card.original_task_id !== 'string' || !ORIGINAL_TASK.test(card.original_task_id))) errors.push('invalid_original_task_id');
  return errors;
}

export function pending({queueDir, receiptDir}) {
  if (!fs.existsSync(queueDir)) return [];
  return fs.readdirSync(queueDir).filter(f => f.endsWith('.json')).sort()
    .filter(f => !fs.existsSync(path.join(receiptDir, f)));
}

export function assertProxyOnly(env = process.env) {
  if (env.DOUBAO_USE_PROXY !== 'true') throw Error('existing_proxy_only_no_fallback');
}

export async function runOnce({queueDir = 'ops/dispatch/queue-doubao', receiptDir = 'knowledge/results/doubao-dispatch', call = callAgent, runId = process.env.GITHUB_RUN_ID || 'local', now = () => new Date().toISOString(), reserve = async () => ({verified: false, scope: 'local_test_only'})} = {}) {
  const todo = pending({queueDir, receiptDir});
  if (!todo.length) return {executed: false, reason: 'no_pending_cards', model_calls: 0};
  const f = todo[0], file = path.join(queueDir, f), bytes = fs.readFileSync(file, 'utf8');
  fs.mkdirSync(receiptDir, {recursive: true});
  const out = path.join(receiptDir, f);
  let card; try { card = JSON.parse(bytes); } catch { card = null; }
  const errors = validateCard(card, file);
  const base = {task_id: card?.id || path.basename(f, '.json'), original_task_id: card?.original_task_id || card?.id || path.basename(f, '.json'), card_sha256: sha(bytes), run_id: runId, executor: 'doubao', queue_dispatcher: 'doubao', at: now(), paid: false, tx_hash: null, financial_execution: false};
  if (errors.length) {
    fs.writeFileSync(out, JSON.stringify({...base, status: 'rejected_invalid_card', errors, model_calls: 0, accepted: false, deployed: false}, null, 2) + '\n');
    return {executed: false, reason: 'invalid_card', errors, model_calls: 0};
  }
  fs.writeFileSync(out, JSON.stringify({...base, status: 'reserved_before_provider_call', model_calls: 0, accepted: false, deployed: false}, null, 2) + '\n');
  const reservation = await reserve({file: out, sha256: sha(fs.readFileSync(out))});
  const prompt = Object.hasOwn(card, 'required_sections') ? card.prompt + '\n\n' + deliveryRequirementsPrompt(card.required_sections) : card.prompt;
  const result = await callWithSkill({scope: 'doubao-queue:' + card.id, prompt}, input => call({prompt: input, maxTokens: card.max_tokens ?? 1024, model: card.model, thinking: 'disabled'}));
  const attempted = !['not_configured', 'configuration_error'].includes(result.status);
  const integrity = Object.hasOwn(card, 'required_sections') ? assessDelivery({output: result.output, finish_reason: result.finish_reason, required_sections: card.required_sections}) : null;
  const deliveryStatus = result.ok ? (integrity && integrity.status !== 'structurally_complete' ? integrity.status : 'draft_delivered_pending_independent_review') : result.status;
  const receipt = {...base, reservation, ...(integrity ? {delivery_integrity: integrity, required_sections: card.required_sections} : {}), skill: result.skill, model_source: result.model_source || null, status: deliveryStatus, model_calls: attempted ? 1 : 0,
    model_calls_definition: 'generation_requests_attempted_not_billing_proof', native_doubao_call: result.model_source === 'provider_response',
    model: result.model || null, generated_by_model: result.model || null,
    finish_reason: result.finish_reason || null, tokens_used: result.tokens_used || 0, request_id: result.request_id || result.upstream_request_id || null,
    actual_provider: result.provider || null, actual_model: result.model_source === 'provider_response' ? (result.model || null) : null,
    http: result.http ?? null, completion_id: result.completion_id || null,
    output: typeof result.output === 'string' && result.output ? result.output : null,
    output_sha256: typeof result.output === 'string' && result.output ? sha(result.output) : null,
    error: result.ok ? null : result.error || null,
    accepted: false, deployed: false, actual_cloud_deployment: false, independent_review: 'pending_other_provider', finished_at: now()};
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  return {executed: true, task_id: base.task_id, status: receipt.status, model_calls: receipt.model_calls};
}

// Consume pending cards in one run. Each card is still reserved before its
// provider call, and the loop stops at the first card whose reservation is
// uncertain: a write-unknown reservation must never be followed by another
// paid call. Invalid cards are consumed (their rejection receipt is written)
// and do not block the remaining queue.
export async function runBatch({limit = 3, ...options} = {}) {
  const max = Number(limit);
  if (!Number.isSafeInteger(max) || max < 1 || max > 20) throw Error('invalid_batch_limit');
  const results = [];
  for (let index = 0; index < max; index += 1) {
    const result = await runOnce(options);
    results.push(result);
    if (result.reason === 'no_pending_cards') break;
  }
  const executed = results.filter(result => result.executed);
  const last = results[results.length - 1];
  return {
    executed_count: executed.length,
    model_calls: results.reduce((sum, result) => sum + (result.model_calls || 0), 0),
    stopped_reason: last?.reason || 'limit_reached',
    results,
  };
}

export async function durableMainReservation({file, sha256}) {
  assertProxyOnly(process.env);
  if (process.env.GITHUB_REPOSITORY !== 'ltzyz2181-collab/ltzzz' || process.env.GITHUB_REF !== 'refs/heads/main' || !/^[a-f0-9]{40}$/.test(process.env.GITHUB_SHA || '') || !/^(push|workflow_dispatch)$/.test(process.env.GITHUB_EVENT_NAME || '')) throw Error('trusted_main_reservation_required');
  const git = args => execFileSync('git', args, {encoding: 'utf8'}).trim();
  const source_commit = git(['rev-parse', 'HEAD']);
  git(['config', 'user.name', 'ltzzz-bot']); git(['config', 'user.email', 'bot@ltzzz.com']);
  git(['add', '--', file]); git(['commit', '-m', 'Reserve Doubao dispatch before one provider call']);
  execFileSync(process.execPath, ['tools/push-receipt-commit.mjs'], {stdio: 'inherit'});
  const commit = git(['rev-parse', 'HEAD']);
  const response = await fetch('https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/' + commit + '/' + file, {redirect: 'error', cache: 'no-store', signal: AbortSignal.timeout(25000)});
  if (!response.ok || sha(Buffer.from(await response.arrayBuffer())) !== sha256) throw Error('remote_reservation_bytes_unverified');
  return {verified: true, path: file, commit, sha256, executor_source_commit: source_commit};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--list') {
    console.log(JSON.stringify({pending: pending({queueDir: 'ops/dispatch/queue-doubao', receiptDir: 'knowledge/results/doubao-dispatch'})}, null, 2));
  } else {
    const limit = Number(process.env.DISPATCH_MAX_CARDS || 3);
    const batch = await runBatch({limit, reserve: durableMainReservation});
    console.log(JSON.stringify(batch));
    if (batch.results.some(r => r.executed && r.status !== 'draft_delivered_pending_independent_review')) process.exitCode = 1;
  }
}