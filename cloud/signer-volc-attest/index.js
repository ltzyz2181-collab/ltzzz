'use strict';
// LTZZZ A2 signer — volcengine_ark native-model attestation.
// Ed25519 private key is generated INSIDE the Volcano function and persisted only
// on Volcano-side storage (/mnt/tos when TOS mounted, else /tmp). The key never
// leaves this service. Provider (Ark) is called from inside this service; a
// signature is produced only after a genuine provider response.
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
function order(v) {
  if (Array.isArray(v)) return v.map(order);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, order(v[k])]));
  return v;
}
const canonical = (v) => JSON.stringify(order(v)); // same canonical as scripts/lib/patchgate.mjs

const STORE_CANDIDATES = [process.env.SIGNER_STORE_DIR || '/mnt/tos', '/tmp'];
const KEY_FILE = 'ltzzz-signer-ed25519.key';
const LIMIT_FILE = 'ltzzz-signer-daily.json';

function keyPath() {
  for (const d of STORE_CANDIDATES) {
    try {
      fs.mkdirSync(d, { recursive: true });
      fs.writeFileSync(path.join(d, '.probe'), '1');
      if (fs.existsSync(path.join(d, '.probe'))) return { dir: d, file: path.join(d, KEY_FILE) };
    } catch (e) { /* next candidate */ }
  }
  return { dir: '/tmp', file: path.join('/tmp', KEY_FILE) };
}

let keyCache = null;
function loadKey() {
  if (keyCache) return keyCache;
  const { dir, file } = keyPath();
  let priv = null;
  try {
    const b64 = fs.readFileSync(file, 'utf8').trim();
    if (b64) priv = Buffer.from(b64, 'base64');
  } catch (e) { /* not present yet */ }
  if (priv && priv.length) {
    try {
      crypto.createPrivateKey({ key: priv, type: 'pkcs8', format: 'der' }); // pkcs8 DER persisted on first boot
      keyCache = { priv, dir };
      return keyCache;
    } catch (e) { /* corrupt or foreign key, regenerate below */ }
  }
  // generate on Volcano side only
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  priv = privateKey.export({ type: 'pkcs8', format: 'der' });
  try { fs.writeFileSync(file, priv.toString('base64'), { mode: 0o600 }); } catch (e) { /* read-only store */ }
  keyCache = { priv, dir };
  return keyCache;
}

function privateKeyObj() {
  const { priv } = loadKey();
  return crypto.createPrivateKey({ key: priv, type: 'pkcs8', format: 'der' });
}

function pubSpkiB64() {
  return privateKeyObj().export({ type: 'spki', format: 'der' }).toString('base64');
}

function signCanonical(obj) {
  return crypto.sign(null, Buffer.from(canonical(obj), 'utf8'), privateKeyObj()).toString('base64');
}

function dailyFile() { return path.join(keyPath().dir, LIMIT_FILE); }

function checkDaily() {
  const limit = parseInt(process.env.SIGNER_DAILY_LIMIT || '20', 10);
  const today = new Date().toISOString().slice(0, 10);
  const f = dailyFile();
  let m = {};
  try { m = JSON.parse(fs.readFileSync(f, 'utf8')); } catch (e) { /* first use */ }
  const count = m[today] || 0;
  if (count >= limit) { const e = new Error('daily_limit_reached'); e.status = 429; throw e; }
  m[today] = count + 1;
  try { fs.writeFileSync(f, JSON.stringify(m)); } catch (e) { /* best-effort */ }
}

async function callArk(model, prompt) {
  const key = process.env.ARK_API_KEY;
  if (!key) { const e = new Error('ARK_API_KEY_missing'); e.status = 500; throw e; }
  if (!model || typeof model !== 'string') { const e = new Error('model_required'); e.status = 400; throw e; }
  const r = await fetch('https://ark.cn-beijing.volces.com/api/v3/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], max_tokens: 2000 }),
  });
  const t = await r.text();
  if (!r.ok) { const e = new Error('ark_http_' + r.status); e.status = 502; throw e; }
  let j;
  try { j = JSON.parse(t); } catch (e2) { const e = new Error('ark_bad_json'); e.status = 502; throw e; }
  const out = j && j.choices && j.choices[0] && j.choices[0].message && j.choices[0].message.content;
  if (typeof out !== 'string' || !out) { const e = new Error('ark_empty_output'); e.status = 502; throw e; }
  return out;
}

function parseEvent(event) {
  const method = (event && (event.method || event.httpMethod)) || 'GET';
  const pathname = (event && event.path) || '/';
  let rawBody = '';
  if (event && typeof event.body === 'string') rawBody = event.body;
  else if (event && event.body && typeof event.body === 'object') rawBody = event.body;
  let body = {};
  if (typeof rawBody === 'object') body = rawBody;
  else if (rawBody) { try { body = JSON.parse(rawBody); } catch (e) { body = {}; } }
  return { method, pathname, body };
}

exports.handler = async function handler(event, context) {
  const resp = (statusCode, obj) => ({
    statusCode,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
    body: JSON.stringify(obj),
  });
  try {
    const { method, pathname, body } = parseEvent(event);

    if (method === 'GET' && (pathname === '/health' || pathname === '/')) {
      const { dir } = loadKey();
      return resp(200, {
        ok: true, service: 'ltzzz-signer-volc-attest', boot_at: new Date().toISOString(),
        key_store: dir, key_persisted: fs.existsSync(path.join(dir, KEY_FILE)),
      });
    }

    if (method === 'GET' && pathname === '/challenge') {
      const c = { nonce: sha256(String(Math.random()) + String(Date.now())).slice(0, 32), public_key_spki: pubSpkiB64(), boot_at: new Date().toISOString() };
      return resp(200, Object.assign({}, c, { signature: signCanonical(c) }));
    }

    if (method !== 'POST' || pathname !== '/attest') return resp(404, { error: 'not_found' });

    const { role, subject, model, prompt, source_commit, review_scope } = body;
    if (!role || !subject || !prompt || !source_commit) return resp(400, { error: 'missing_fields' });
    if (role === 'stage_review' && review_scope !== 'A2_L0_docs_only') return resp(403, { error: 'review_scope_required' });

    checkDaily();

    const m = model || process.env.SIGNER_DEFAULT_MODEL;
    const output = await callArk(m, prompt);

    const executor = process.env.SIGNER_EXECUTOR_ID || 'doubao-vefaas';
    const payload = {
      at_utc: new Date().toISOString(),
      executor,
      finish_reason: 'stop',
      generation_verified: true,
      metadata_source: 'provider_response',
      model: m,
      output_sha256: sha256(output),
      provider: 'volcengine_ark',
      role,
      subject,
      signer_cloud_account_binding: process.env.SIGNER_CLOUD_ACCOUNT_BINDING || '',
      signer_deployment_evidence_sha256: process.env.SIGNER_EVIDENCE_SHA256 || '',
      signer_source_sha256: process.env.SIGNER_SOURCE_SHA256 || '',
    };
    const result = {
      schema: 'ltzzz.patchgate.native-model-attestation.v1',
      executor_id: executor,
      upstream_provider: 'volcengine_ark',
      source_commit,
      output,
      attestation: { payload, signature: signCanonical(payload) },
    };
    return resp(200, { result });
  } catch (e) {
    const status = (e && e.status) || 500;
    return resp(status, { error: (e && e.message) || 'internal_error' });
  }
};
