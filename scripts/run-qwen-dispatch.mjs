import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {callAgent} from './call-qwen.mjs';
import {KIMI_PROFILE} from '../lib/kimi-profile.js';

/**
 * Qwen dispatch consumer. Cards: ops/dispatch/queue/*.json (agent "qianwen").
 * A card is pending while no receipt exists. At most one card per run, reserved BEFORE the
 * provider call so a crash can never cause a second paid call. Output is a DRAFT only:
 * never accepted/deployed/paid; independent review by another provider is still required.
 */
const ID = /^[A-Z0-9][A-Z0-9_-]{6,80}$/;
const sha = s => createHash('sha256').update(s).digest('hex');

export function validateCard(card, file) {
  const errors = [];
  if (!card || typeof card !== 'object') return ['not_an_object'];
  if (!ID.test(card.id || '')) errors.push('invalid_id');
  if (path.basename(file, '.json') !== card.id) errors.push('filename_must_equal_id');
  if (card.agent !== 'qianwen') errors.push('agent_must_be_qianwen');
  if (typeof card.prompt !== 'string' || card.prompt.trim().length < 20 || card.prompt.length > 6000) errors.push('prompt_20_to_6000_chars');
  // Per-model token budgets, kept in separate lanes so neither loosens the other:
  // - qwen (default): 64..2048 — the original ceiling, must not be widened for kimi.
  // - kimi: floor 3000 (lib/kimi-profile.js minimum_output_tokens; below it the API
  //   returns empty content and looks like a false success), ceiling 16384 (profile
  //   default_output_tokens).
  const mt = card.max_tokens ?? 1024;
  const isKimi = /^kimi/i.test(card.model ?? '');
  if (!Number.isSafeInteger(mt) || mt < 64) errors.push('max_tokens_too_small');
  if (!isKimi && mt > 2048) errors.push('max_tokens_qwen_ceiling_2048');
  if (isKimi && (mt < KIMI_PROFILE.minimum_output_tokens || mt > KIMI_PROFILE.default_output_tokens)) errors.push(`kimi_max_tokens_must_be_${KIMI_PROFILE.minimum_output_tokens}_to_${KIMI_PROFILE.default_output_tokens}`);
  if (card.model !== undefined && !/^(qwen|kimi)[a-zA-Z0-9_.-]*$/i.test(card.model)) errors.push('invalid_model');
  if (card.real_money === true) errors.push('real_money_not_allowed_in_qwen_dispatch');
  return errors;
}

export function pending({queueDir, receiptDir}) {
  if (!fs.existsSync(queueDir)) return [];
  return fs.readdirSync(queueDir).filter(f => f.endsWith('.json')).sort()
    .filter(f => !fs.existsSync(path.join(receiptDir, f)));
}

export async function runOnce({queueDir = 'ops/dispatch/queue', receiptDir = 'knowledge/results/qwen-dispatch', call = callAgent, runId = process.env.GITHUB_RUN_ID || 'local', now = () => new Date().toISOString()} = {}) {
  const todo = pending({queueDir, receiptDir});
  if (!todo.length) return {executed: false, reason: 'no_pending_cards', model_calls: 0};
  const f = todo[0], file = path.join(queueDir, f), bytes = fs.readFileSync(file, 'utf8');
  fs.mkdirSync(receiptDir, {recursive: true});
  const out = path.join(receiptDir, f);
  let card; try { card = JSON.parse(bytes); } catch { card = null; }
  const errors = validateCard(card, file);
  const base = {task_id: card?.id || path.basename(f, '.json'), card_sha256: sha(bytes), run_id: runId, executor: 'qianwen', queue_dispatcher: 'qianwen', at: now(), paid: false, tx_hash: null, financial_execution: false};
  if (errors.length) { fs.writeFileSync(out, JSON.stringify({...base, status: 'rejected_invalid_card', errors, model_calls: 0}, null, 2) + '\n'); return {executed: false, reason: 'invalid_card', errors, model_calls: 0}; }
  fs.writeFileSync(out, JSON.stringify({...base, status: 'reserved_before_provider_call', model_calls: 0}, null, 2) + '\n');
  const result = await call({prompt: card.prompt, maxTokens: card.max_tokens ?? 1024, model: card.model});
  const attempted = !['not_configured', 'configuration_error'].includes(result.status);
  // Provenance split: who queued the card (queue_dispatcher=qianwen) vs which model
  // actually generated the output. kimi cards ride the qianwen queue but the output
  // must be attributed to kimi, not charged/credited to the qianwen seat.
  const generatedBy = result.model || null;
  const attributionNote = generatedBy && !/^qwen/i.test(generatedBy)
    ? `qianwen seat only queued/dispatched; actual generation by ${generatedBy} — attribute cost and credit to ${generatedBy}, not qianwen`
    : generatedBy
      ? `generation by ${generatedBy} via qianwen queue`
      : null;
  const receipt = {...base, status: result.ok ? 'draft_delivered_pending_independent_review' : result.status, model_calls: attempted ? 1 : 0,
    model_calls_definition: 'generation_requests_attempted_not_billing_proof', native_qwen_call: result.native_qwen_call === true,
    model: result.model || null, generated_by_model: generatedBy, attribution_note: attributionNote,
    finish_reason: result.finish_reason || null, tokens_used: result.tokens_used || 0, request_id: result.request_id || null,
    output: result.ok ? result.output : null, output_sha256: result.ok ? sha(result.output) : null, error: result.ok ? null : result.error || null,
    accepted: false, deployed: false, independent_review: 'pending_other_provider', finished_at: now()};
  fs.writeFileSync(out, JSON.stringify(receipt, null, 2) + '\n');
  return {executed: true, task_id: base.task_id, status: receipt.status, model_calls: receipt.model_calls};
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--list') {
    console.log(JSON.stringify({pending: pending({queueDir: 'ops/dispatch/queue', receiptDir: 'knowledge/results/qwen-dispatch'})}, null, 2));
  } else {
    const r = await runOnce();
    console.log(JSON.stringify(r));
    if (r.executed && r.status !== 'draft_delivered_pending_independent_review') process.exitCode = 1;
  }
}
