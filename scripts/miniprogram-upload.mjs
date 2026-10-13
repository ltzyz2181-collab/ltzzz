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
try {
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
      const ci = require('miniprogram-ci');
      const project = new ci.Project({ appid: receipt.appid, type: 'miniProgram', projectPath: path.resolve('miniprogram'), privateKeyPath: keyPath, ignores: ['README.md'] });
      receipt.upload_attempted = true;
      await ci.upload({ project, version: receipt.version, desc: 'LTZZZ four-product display; no payment or automatic fulfillment', setting: { es6: true, minify: true }, onProgressUpdate: () => {} });
      receipt.status = 'uploaded_development_version';
      receipt.uploaded = true;
    }
  }
} catch (error) {
  receipt.status = receipt.upload_attempted ? 'upload_outcome_unknown' : 'upload_failed_before_request';
  // Do not put SDK errors containing key contents, tokens or request objects in public receipts.
  receipt.error_code = typeof error?.code === 'number' ? error.code : null;
  receipt.error_name = /^[A-Za-z0-9_]{1,60}$/.test(error?.name || '') ? error.name : 'UploadError';
} finally {
  if (temporary) await fs.rm(temporary, { recursive: true, force: true });
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}
