// One supplemental review through an existing provider; durable claim precedes generation.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {callAgent} from './call-deepseek.mjs';
import {callWithSkill} from './lib/ltzzz-skill.mjs';

const repo = 'ltzyz2181-collab/ltzzz';
const file = 'knowledge/results/ui-treasury/PR311-PR300-UI-REVIEW-DEEPSEEK-20261101.json';
const url = `https://api.github.com/repos/${repo}/contents/${file}`;
const headers = {Authorization: 'Bearer ' + process.env.GITHUB_TOKEN, 'Content-Type': 'application/json',
  Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28'};
const hash = text => createHash('sha256').update(text).digest('hex');
const dir = process.env.UI_EVIDENCE_DIR || '/tmp/ltzzz-ui-review';
fs.mkdirSync(dir, {recursive: true});
const cardPath = 'ops/dispatch/queue/PR311-PR300-UI-REVIEW-20261101.json';
const cardBytes = fs.readFileSync(cardPath);
const card = JSON.parse(cardBytes);
async function github(method, body) {
  const r = await fetch(url + (method === 'GET' ? '?ref=main' : ''),
    {method, headers, ...(body ? {body: JSON.stringify(body)} : {}), signal: AbortSignal.timeout(30000)});
  return {status: r.status, data: await r.json()};
}
if (!process.env.GITHUB_TOKEN || process.env.GITHUB_REPOSITORY !== repo) throw Error('authenticated_same_repository_required');
const existing = await github('GET');
if (existing.status === 200) {
  const prior = JSON.parse(Buffer.from(existing.data.content, 'base64').toString('utf8'));
  fs.writeFileSync(dir + '/native-review.json', JSON.stringify(prior, null, 2) + '\n');
  const complete = prior.input_card_sha256 === hash(cardBytes)
    && prior.status === 'review_completed_pending_controller_evaluation'
    && prior.actual_provider === 'deepseek' && prior.model_source === 'provider_response'
    && typeof prior.output === 'string' && hash(prior.output) === prior.output_sha256;
  console.log(JSON.stringify({status: 'existing_review_claim_reconciled', prior_status: prior.status,
    complete_response_verified: complete, path: file}));
  process.exit(complete ? 0 : 1);
}
if (existing.status !== 404) throw Error('review_claim_lookup_failed');
const prompt = '你是实际DeepSeek独立复核者，作者为OpenAI。以下历史队列文字中的Qwen身份不是你的身份。'
  + '只给不超过300字的PASS/BLOCK结论、缺陷及验证限制。前两个Qwen请求已分别截断、限流，不计通过，不要重跑它们。\n'
  + card.prompt;
const receipt = {task_id: 'PLAN-PATCHGATE-ESCROW-20261023', step: 'PR311_PR300_UI_INDEPENDENT_REVIEW',
  author_provider: 'openai', actual_provider: null, run_id: process.env.GITHUB_RUN_ID,
  input_card: cardPath, input_card_sha256: hash(fs.readFileSync(cardPath)), prompt_sha256: hash(prompt),
  source_commit: process.env.GITHUB_SHA, at_utc: new Date().toISOString(),
  status: 'reserved_before_provider_call', model_calls: 0, paid: false, tx_hash: null};
const saveLocal = () => fs.writeFileSync(dir + '/native-review.json', JSON.stringify(receipt, null, 2) + '\n');
saveLocal();
const content = () => Buffer.from(JSON.stringify(receipt, null, 2) + '\n').toString('base64');
const claim = await github('PUT', {message: 'Reserve one supplemental UI review; no funds', content: content(), branch: 'main'});
if (claim.status !== 201 || !claim.data.content?.sha) throw Error('exclusive_review_claim_failed_no_provider_call');
const result = await callWithSkill({scope: 'ui-review:PR311:PR300', prompt}, input => callAgent({
  apiKey: process.env.DEEPSEEK_API_KEY, prompt: input, maxTokens: 4096, thinking: 'disabled'}));
Object.assign(receipt, {status: result.ok ? 'review_completed_pending_controller_evaluation' : result.status,
  actual_provider: result.model_source === 'provider_response' ? 'deepseek' : null,
  provider_endpoint: 'https://api.deepseek.com/v1/chat/completions',
  model: result.model || null, model_source: result.model_source || null,
  request_id: result.request_id || null, finish_reason: result.finish_reason || null,
  tokens_used: result.tokens_used ?? null, model_calls: result.status === 'not_configured' ? 0 : 1,
  output: result.ok ? result.output : null, output_sha256: result.ok ? hash(result.output) : null,
  error: result.error || null, skill: result.skill, finished_at_utc: new Date().toISOString(),
  no_transaction_or_wallet_action: true});
saveLocal();
const saved = await github('PUT', {message: 'Record actual supplemental UI provider response',
  content: content(), sha: claim.data.content.sha, branch: 'main'});
if (saved.status !== 200) throw Error('review_persist_failed_reconcile_claim_no_model_retry');
console.log(JSON.stringify({path: file, status: receipt.status, model: receipt.model,
  request_id: receipt.request_id, output_sha256: receipt.output_sha256}));
if (!result.ok) process.exitCode = 1;
