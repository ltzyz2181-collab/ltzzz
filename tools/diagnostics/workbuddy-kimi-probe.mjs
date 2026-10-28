import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes, createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';

// Local-only connection diagnostic. Never print or export models.json or its keys.
export const STEP = 'WORKBUDDY-KIMI-CONNECTIVITY-20261028-01';
const HOSTS = new Set(['api.moonshot.cn', 'api.moonshot.ai']);
const ORDER = ['kimi-k3', 'kimi-k2.7-code', 'kimi-k2.7-code-highspeed', 'kimi-k2.6', 'kimi-k2.5'];
const URL_FIELDS = ['url', 'baseURL', 'baseUrl', 'base_url', 'apiUrl', 'apiURL', 'endpoint'];
const KEY_FIELDS = ['apiKey', 'api_key', 'apikey'];
const MODEL_FIELDS = ['model', 'modelId', 'model_id', 'id'];
const digest = value => createHash('sha256').update(value).digest('hex');

export function endpoint(value) {
  const u = new URL(value);
  if (u.protocol !== 'https:' || !HOSTS.has(u.hostname) || (u.port && u.port !== '443') || u.username || u.password || u.search || u.hash) throw new Error('unsupported_endpoint');
  if (!['', '/', '/v1', '/v1/', '/v1/chat/completions'].includes(u.pathname)) throw new Error('unsupported_endpoint_path');
  return { origin: u.origin, catalogue: `${u.origin}/v1/models`, chat: `${u.origin}/v1/chat/completions`, region: u.hostname.endsWith('.cn') ? 'cn' : 'ai' };
}

function credential(value, env) {
  if (typeof value !== 'string') return null;
  const reference = value.match(/^\$\{([A-Za-z_][A-Za-z0-9_]{0,80})\}$/);
  const resolved = reference ? env[reference[1]] : value;
  return typeof resolved === 'string' && /^sk-[A-Za-z0-9_-]{12,}$/.test(resolved) ? resolved : null;
}

// Treat only fields on the SAME model record as belonging together. Never borrow
// a DeepSeek key from another model or export raw configuration for inspection.
export function selectConfiguration(config, env = {}) {
  const found = [], blocked = new Set();
  let objects = 0;
  function walk(value, depth = 0) {
    if (!value || typeof value !== 'object' || depth > 8 || ++objects > 3000) return;
    if (!Array.isArray(value)) {
      const rawUrl = URL_FIELDS.map(k => value[k]).find(v => typeof v === 'string');
      const hint = [value.name, value.vendor, value.provider, value.model, value.id].filter(v => typeof v === 'string').join(' ');
      if (rawUrl && (/kimi|moonshot/i.test(hint) || /^https:\/\/api\.moonshot\./i.test(rawUrl))) {
        let target;
        try { target = endpoint(rawUrl); } catch { blocked.add('nonstandard_or_unapproved_endpoint'); }
        if (target) {
          const rawKey = KEY_FIELDS.map(k => value[k]).find(v => typeof v === 'string');
          const key = credential(rawKey, env);
          if (!key) blocked.add('credential_missing_unresolved_or_nonstandard');
          else {
            const model = MODEL_FIELDS.map(k => value[k]).find(v => typeof v === 'string' && /^(kimi-|moonshot-)[A-Za-z0-9._-]+$/.test(v)) || null;
            const outputBudget = value.maxOutputTokens ?? value.max_tokens ?? value.maxTokens;
            found.push({ target, key, model, configured_max_output_tokens: Number.isSafeInteger(outputBudget) && outputBudget > 0 ? outputBudget : null });
          }
        }
      }
    }
    for (const child of Object.values(value)) walk(child, depth + 1);
  }
  walk(config);
  const unique = found.filter((v, i) => found.findIndex(x => x.key === v.key && x.target.chat === v.target.chat && x.model === v.model) === i);
  if (unique.length !== 1) return { ok: false, status: unique.length > 1 ? 'multiple_Kimi_configurations_select_in_UI' : [...blocked][0] || 'configuration_schema_or_Kimi_record_not_detected' };
  return { ok: true, ...unique[0] };
}

function httpStatus(code, stage) {
  return code === 401 ? 'authentication_or_region_mismatch' : code === 403 ? 'permission_or_account_restriction' : code === 404 ? 'endpoint_or_model_not_found' : code === 429 ? 'rate_limit_or_quota' : code === 402 ? 'account_balance_or_payment_required' : `${stage}_http_error`;
}

export async function probe(record, configuration, { fetcher = fetch, save = async () => {} } = {}) {
  if (!configuration.ok) { record.status = configuration.status; await save(record); return record; }
  const { target, key, model } = configuration;
  Object.assign(record, { endpoint_origin: target.origin, api_region: target.region, configured_provider: 'moonshot', configured_model: model, configured_max_output_tokens: configuration.configured_max_output_tokens, credential_resolved: true, client_model_mapping_verified: false });
  const finish = async status => { record.status = status; record.completed_at_utc = new Date().toISOString(); await save(record); return record; };
  try {
    const r = await fetcher(target.catalogue, { headers: { Authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(20000) });
    record.catalogue_http = r.status;
    if (!r.ok) return finish(httpStatus(r.status, 'catalogue'));
    const body = await r.json();
    const ids = (Array.isArray(body.data) ? body.data : []).map(v => v.id).filter(v => typeof v === 'string' && /^(kimi-|moonshot-)[A-Za-z0-9._-]{1,100}$/.test(v));
    record.available_models = ids;
    if (model && !ids.includes(model)) return finish('configured_model_not_in_official_catalogue');
    const chosen = model || ORDER.find(v => ids.includes(v));
    if (!chosen) return finish('no_verified_supported_model');
    record.requested_model = chosen;
    record.model_selection_source = model ? 'existing_local_model_record' : 'official_catalogue_probe_only_UI_mapping_unverified';
    record.nonce = `LTZZZ_KIMI_${randomBytes(12).toString('hex')}`;
    record.model_calls_attempted = 1;
    record.status = 'generation_started_completion_unknown_no_retry';
    await save(record); // Durable one-use reservation BEFORE a billable request.
    const response = await fetcher(target.chat, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, redirect: 'error', signal: AbortSignal.timeout(280000), body: JSON.stringify({ model: chosen, messages: [{ role: 'user', content: `Connection test only. Reply with exactly this string: ${record.nonce}` }], temperature: 1, max_tokens: 16384, stream: false }) });
    record.call_http = response.status;
    if (!response.ok) return finish(httpStatus(response.status, 'generation'));
    const data = await response.json();
    const choice = data.choices?.[0], output = typeof choice?.message?.content === 'string' ? choice.message.content.trim() : '';
    record.finish_reason = typeof choice?.finish_reason === 'string' && /^[a-z_]{1,40}$/.test(choice.finish_reason) ? choice.finish_reason : null;
    record.actual_model = typeof data.model === 'string' && /^(kimi-|moonshot-)[A-Za-z0-9._-]{1,100}$/.test(data.model) ? data.model : null;
    record.model_source = record.actual_model ? 'provider_response' : null;
    record.actual_provider = record.actual_model ? 'moonshot' : null;
    record.metadata_source = record.actual_model ? 'official_endpoint_provider_response' : null;
    const requestId = response.headers?.get('x-request-id') || response.headers?.get('request-id');
    record.request_id = typeof requestId === 'string' && /^[A-Za-z0-9._:-]{1,200}$/.test(requestId) ? requestId : null;
    record.usage = Object.fromEntries(['prompt_tokens', 'completion_tokens', 'total_tokens'].map(k => [k, Number.isSafeInteger(data.usage?.[k]) && data.usage[k] >= 0 ? data.usage[k] : null]));
    record.output_sha256 = digest(output);
    record.output_nonempty = output.length > 0;
    record.nonce_matched = output === record.nonce;
    record.generation_verified = record.output_nonempty && record.finish_reason === 'stop' && Boolean(record.actual_model);
    record.connection_verified = record.generation_verified && record.nonce_matched;
    return finish(record.connection_verified ? 'verified_local_configuration_native_nonce' : !output ? 'empty_output_not_success' : record.finish_reason !== 'stop' ? 'incomplete_output_not_success' : 'response_not_bound_to_nonce_or_model');
  } catch { return finish(record.model_calls_attempted ? 'generation_outcome_unknown_do_not_retry' : 'catalogue_network_TLS_proxy_or_parse_error'); }
}

export async function runLocal({ home = process.env.USERPROFILE || os.homedir(), outputFile = path.resolve('results/workbuddy/WORKBUDDY-A2-CHECKS-20261028-01/kimi-connectivity.json'), fetcher = fetch, env = process.env } = {}) {
  fs.mkdirSync(path.dirname(outputFile), { recursive: true });
  let fd;
  try { fd = fs.openSync(outputFile, 'wx', 0o600); } catch (e) { if (e.code === 'EEXIST') return { status: 'existing_receipt_do_not_repeat', receipt_file: path.basename(outputFile), no_model_call: true }; throw e; }
  const record = { schema: 'ltzzz.workbuddy.local_Kimi_probe.v1', task_id: 'PLAN-PATCHGATE-ESCROW-20261023', step_id: STEP, at_utc: new Date().toISOString(), client: 'WorkBuddy_local_Node_diagnostic', actual_provider: null, model_calls_attempted: 0, generation_verified: false, connection_verified: false, original_artifact_review_performed: false, unattended_execution_verified: false, status: 'reserved', settlement_kind: 'none', paid: false, tx_hash: null, limitations: ['Local direct configuration diagnostic; not a deployed shared-queue adapter.', 'Model API usage may be billed by Moonshot; no wallet or settlement is used.', 'A successful nonce is not independent review of the original engineering artifacts.', 'No model settings are changed; no automatic retry, account-region fallback or third-party gateway use.'] };
  const save = async value => { const data = JSON.stringify(value, null, 2) + '\n'; fs.ftruncateSync(fd, 0); fs.writeSync(fd, data, 0, 'utf8'); fs.fsyncSync(fd); };
  try {
    await save(record);
    const kinds = ['.workbuddy', '.codebuddy'];
    const kind = kinds.find(k => fs.existsSync(path.join(home, k, 'models.json')));
    if (!kind) { record.status = 'local_model_configuration_not_found'; await save(record); return record; }
    record.config_source = `${kind}/models.json`;
    let config;
    try { config = JSON.parse(fs.readFileSync(path.join(home, kind, 'models.json'), 'utf8').replace(/^\uFEFF/, '')); } catch { record.status = 'local_configuration_unreadable_or_invalid_JSON'; await save(record); return record; }
    const selected = selectConfiguration(config, env);
    return await probe(record, selected, { fetcher, save });
  } finally { fs.closeSync(fd); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try { const result = await runLocal(); console.log(JSON.stringify(result, null, 2)); if (!result.connection_verified && result.status !== 'existing_receipt_do_not_repeat') process.exitCode = 2; }
  catch { console.error('Local diagnostic could not save its one-use receipt. No automatic retry.'); process.exitCode = 2; }
}
