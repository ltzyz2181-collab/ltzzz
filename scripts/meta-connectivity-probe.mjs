import fs from 'node:fs';
import path from 'node:path';
import {createHmac, randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export const SCHEMA = 'ltzzz.meta-connectivity-probe.v1';
export const WORKER_NAME = 'ltzzz-meta-hosted';

export function classifyVerdict({health, authCheck, probe, echoOk}) {
  if (!health || health.http === 0) return 'network_unreachable';
  if (health.http === 404) return 'worker_not_found';
  if (health.http !== 200 || health.json?.service !== WORKER_NAME) return 'unexpected_health_response';
  if (health.json?.auth_configured === false) return 'auth_not_configured';
  if (!authCheck || authCheck.http !== 200 || authCheck.json?.authorized !== true) return 'deployed_auth_not_ready';
  if (!probe || probe.http !== 200) return 'deployed_inference_failed';
  if (!echoOk) return 'probe_echo_mismatch';
  return 'ok';
}

export async function resolveWorkerUrl({workerUrl, apiToken, accountId, fetchImpl = fetch} = {}) {
  if (workerUrl) return {url: String(workerUrl).replace(/\/+$/, ''), source: 'input'};
  if (!apiToken || !accountId) return {url: '', source: 'missing_credentials'};
  const res = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
    headers: {Authorization: `Bearer ${apiToken}`, Accept: 'application/json'},
  });
  const body = await res.json().catch(() => ({}));
  const subdomain = body?.result?.subdomain;
  if (!res.ok || !subdomain) return {url: '', source: 'subdomain_unavailable', http: res.status};
  return {url: `https://${WORKER_NAME}.${subdomain}.workers.dev`, source: 'cloudflare_api'};
}

async function callJson(url, {method = 'GET', token, body, timeoutMs = 20000, fetchImpl = fetch} = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const started = Date.now();
  try {
    const res = await fetchImpl(url, {
      method,
      signal: controller.signal,
      headers: {
        ...(token ? {Authorization: `Bearer ${token}`} : {}),
        ...(body ? {'Content-Type': 'application/json'} : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    let json = null;
    try { json = JSON.parse(text); } catch { json = null; }
    return {http: res.status, ms: Date.now() - started, json, text: json ? null : text.slice(0, 200)};
  } catch (error) {
    const code = error?.cause?.code || error?.code || (error?.name === 'AbortError' ? 'timeout' : error?.message);
    return {http: 0, ms: Date.now() - started, error: String(code || error).slice(0, 200)};
  } finally {
    clearTimeout(timer);
  }
}

async function diagnoseInference({apiToken, accountId, model, fetchImpl = fetch}) {
  const out = {model: model || null, run: null, meta_models: []};
  if (!apiToken || !accountId) return out;
  try {
    const runRes = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${encodeURIComponent(model || '@cf/meta/llama-3.1-8b-instruct-fp8')}`, {
      method: 'POST',
      headers: {Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json'},
      body: JSON.stringify({messages: [{role: 'user', content: 'ping'}], max_tokens: 8}),
    });
    const text = await runRes.text();
    let body = null; try { body = JSON.parse(text); } catch { body = null; }
    out.run = {
      http: runRes.status,
      success: body ? body.success !== false : null,
      error: String(body?.errors?.[0]?.message || (body ? '' : text.slice(0, 200)) || '').slice(0, 300) || null,
      error_code: body?.errors?.[0]?.code ?? null,
    };
  } catch (error) {
    out.run = {http: 0, error: String(error?.message || error).slice(0, 200)};
  }
  try {
    const listRes = await fetchImpl(`https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search?search=${encodeURIComponent('meta llama')}`, {headers: {Authorization: `Bearer ${apiToken}`}});
    const body = await listRes.json().catch(() => null);
    const items = Array.isArray(body?.result) ? body.result : [];
    out.meta_models = items.map((item) => item?.name || item?.id).filter(Boolean).slice(0, 12);
    out.meta_models_http = listRes.status;
  } catch (error) {
    out.meta_models_http = 0;
  }
  return out;
}
export async function probe({workerUrl, apiToken, accountId, timeoutMs = 20000, fetchImpl = fetch, now = new Date()} = {}) {
  const resolved = await resolveWorkerUrl({workerUrl, apiToken, accountId, fetchImpl});
  const token = process.env.META_WORKER_TOKEN || (apiToken ? createHmac('sha256', apiToken).update('ltzzz-meta-hosted-control-v1').digest('hex') : '');
  const receipt = {
    schema: SCHEMA,
    at: now.toISOString(),
    worker: {name: WORKER_NAME, host: resolved.url ? new URL(resolved.url).host : null, url_source: resolved.source},
    checks: {},
    boundaries: {financial_execution: false, signing: false, model_calls: 0, credentials_persisted: false},
  };
  if (!resolved.url) {
    receipt.verdict = resolved.source === 'subdomain_unavailable' ? 'worker_not_found' : 'missing_credentials';
    receipt.ok = false;
    return receipt;
  }
  const health = await callJson(`${resolved.url}/health`, {timeoutMs, fetchImpl});
  receipt.checks.health = health;
  let authCheck = null;
  let probeRes = null;
  let echoOk = false;
  if (health.http === 200 && token) {
    authCheck = await callJson(`${resolved.url}/auth-check`, {method: 'POST', token, body: {}, timeoutMs, fetchImpl});
    receipt.checks.auth_check = authCheck;
    if (authCheck.http === 200 && authCheck.json?.authorized === true) {
      const nonce = randomBytes(16).toString('hex');
      probeRes = await callJson(`${resolved.url}/task`, {
        method: 'POST',
        token,
        body: {task_id: `META-PROBE-${now.getTime()}`, kind: 'channel_probe', nonce, prompt: 'ltzzz channel probe'},
        timeoutMs,
        fetchImpl,
      });
      receipt.checks.channel_probe = probeRes;
      const output = String(probeRes.json?.output || '').toLowerCase();
      echoOk = output.includes(nonce);
      receipt.boundaries.model_calls = probeRes.http === 200 ? 1 : 0;
      if (probeRes.http !== 200 && apiToken && accountId) {
        receipt.checks.inference_diagnosis = await diagnoseInference({apiToken, accountId, model: health.json?.model, fetchImpl});
      }
      receipt.evidence = {
        request_nonce: nonce,
        echo_matched: echoOk,
        executor: probeRes.json?.executor || null,
        provider: probeRes.json?.provider || null,
        model: probeRes.json?.model || null,
      };
    }
  }
  receipt.verdict = classifyVerdict({health, authCheck, probe: probeRes, echoOk});
  receipt.ok = receipt.verdict === 'ok';
  return receipt;
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const outIndex = argv.indexOf('--out');
  const outFile = outIndex >= 0 ? argv[outIndex + 1] : '';
  const receipt = await probe({
    workerUrl: env.META_WORKER_URL || '',
    apiToken: env.CLOUDFLARE_API_TOKEN || '',
    accountId: env.CLOUDFLARE_ACCOUNT_ID || '',
  });
  const text = JSON.stringify(receipt, null, 2) + '\n';
  if (outFile) {
    fs.mkdirSync(path.dirname(outFile), {recursive: true});
    fs.writeFileSync(outFile, text, 'utf8');
  }
  console.log(JSON.stringify({schema: SCHEMA, verdict: receipt.verdict, ok: receipt.ok, host: receipt.worker.host, out: outFile || null}));
  return receipt.ok ? 0 : 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().then((code) => { process.exitCode = code; }).catch((error) => {
    console.error(JSON.stringify({error: String(error?.message || error)}));
    process.exitCode = 1;
  });
}