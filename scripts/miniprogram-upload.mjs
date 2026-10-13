import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

const receipt = {
  run_id: process.env.GITHUB_RUN_ID || null,
  source_commit: process.env.GITHUB_SHA || null,
  appid: process.env.MINI_APPID || 'wx0b43a6cf2cb2b07d',
  appid_source: process.env.MINI_APPID ? 'configured_secret' : 'repository_historical_key_filename',
  status: 'blocked_configuration', upload_attempted: false, uploaded: false, published: false,
  version: '0.1.' + (process.env.GITHUB_RUN_NUMBER || '0'),
  missing: [],
};
const output = 'results/commerce/miniprogram-upload-latest.json';
let temporary;
let uploadTimer;
async function checkpoint(phase) {
  receipt.phase = phase;
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log('Mini program phase: ' + phase);
}
try {
  await checkpoint('credential_check');
  if (!/^wx[0-9a-f]{16}$/i.test(receipt.appid)) receipt.missing.push('valid_mini_program_appid');
  const supplied = process.env.MINI_UPLOAD_KEY || '';
  if (!supplied) receipt.missing.push('mini_program_upload_private_key');
  if (!receipt.missing.length) {
    const key = supplied.includes('-----BEGIN') ? supplied.replace(/\\n/g, '\n') : Buffer.from(supplied, 'base64').toString('utf8');
    if (!/-----BEGIN (?:RSA )?PRIVATE KEY-----/.test(key)) {
      receipt.status = 'blocked_invalid_private_key_format';
    } else {
      temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'ltzzz-mini-upload-'));
      const keyPath = path.join(temporary, 'upload.key');
      await fs.writeFile(keyPath, key, { mode: 0o600 });
      const { createRequire } = await import('node:module');
      const require = createRequire(path.resolve(process.env.MINI_CI_PACKAGE_ROOT, 'package.json'));
      await checkpoint('load_sdk');
      const ci = require('miniprogram-ci');
      await checkpoint('create_project');
      const project = new ci.Project({ appid: receipt.appid, type: 'miniProgram', projectPath: path.resolve('miniprogram'), privateKeyPath: keyPath, ignores: ['README.md'] });
      receipt.upload_attempted = true;
      await checkpoint('upload_request');
      let progressReported = false;
      await Promise.race([
        ci.upload({ project, version: receipt.version, desc: 'LTZZZ four-product display; no payment or automatic fulfillment', setting: { es6: true, minify: true }, onProgressUpdate: () => {
          if (!progressReported) { console.log('Mini program SDK progress received'); progressReported = true; }
        } }),
        new Promise((_, reject) => {
          uploadTimer = setTimeout(() => reject(new Error('Upload timed out after 180 seconds')), 180000);
        }),
      ]);
      receipt.status = 'uploaded_development_version';
      receipt.uploaded = true;
    }
  }
} catch (error) {
  receipt.status = receipt.upload_attempted ? 'upload_outcome_unknown' : 'upload_failed_before_request';
  // Do not put SDK errors containing key contents, tokens or request objects in public receipts.
  const errorText = [error?.message, error?.errMsg, error?.msg].filter(value => typeof value === 'string').join(' ');
  const codes = [error?.errCode, error?.errcode, error?.code].filter(value => value !== null && value !== undefined).map(Number);
  receipt.error_code = codes.find(value => Number.isFinite(value)) ?? null;
  receipt.failure_reason = /invalid\s+ip|white.?list|白名单/i.test(errorText) ? 'upload_ip_not_authorized'
    : /invalid.*appid|appid.*invalid/i.test(errorText) ? 'appid_rejected'
    : /signature|private.?key|签名/i.test(errorText) ? 'upload_signature_rejected'
    : /timeout|timed out|ETIMEDOUT/i.test(errorText) ? 'network_timeout'
    : 'sdk_error_requires_review';
  const remoteCode = errorText.match(/errCode["']?\s*:\s*(-?\d+)/i);
  receipt.remote_error_code = remoteCode ? Number(remoteCode[1]) : null;
  if (receipt.failure_reason === 'upload_ip_not_authorized') receipt.status = 'blocked_upload_ip_whitelist';
  // Only extract bounded IP values, never the raw SDK request/message.
  receipt.observed_ips = [...new Set(errorText.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) || [])]
    .filter(ip => ip.split('.').every(part => Number(part) <= 255)).slice(0, 3);
  receipt.error_name = /^[A-Za-z0-9_]{1,60}$/.test(error?.name || '') ? error.name : 'UploadError';
} finally {
  clearTimeout(uploadTimer);
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}

// SDK handles must not keep this CLI alive after its receipt is persisted.
process.exit(0);
