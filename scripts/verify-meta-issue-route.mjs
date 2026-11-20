import fs from 'node:fs';
import {createHmac} from 'node:crypto';

async function resolveWorkerUrl() {
  const direct = String(process.env.META_WORKER_URL || '').replace(/\/+$/, '');
  if (direct) return direct;
  const token = process.env.CLOUDFLARE_API_TOKEN;
  const account = process.env.CLOUDFLARE_ACCOUNT_ID;
  if (!token || !account) return '';
  const res = await fetch('https://api.cloudflare.com/client/v4/accounts/' + account + '/workers/subdomain', {headers: {Authorization: 'Bearer ' + token}, signal: AbortSignal.timeout(15000)});
  const body = await res.json().catch(() => null);
  const sub = body && body.result && body.result.subdomain;
  return sub ? 'https://ltzzz-meta-hosted.' + sub + '.workers.dev' : '';
}

function resolveWorkerToken() {
  if (process.env.META_WORKER_TOKEN) return process.env.META_WORKER_TOKEN;
  const cf = process.env.CLOUDFLARE_API_TOKEN;
  if (!cf) return '';
  return createHmac('sha256', cf).update('ltzzz-meta-hosted-control-v1').digest('hex');
}

function writeReceipt(receipt) {
  fs.mkdirSync('knowledge/results/meta', {recursive: true});
  fs.writeFileSync('knowledge/results/meta/issue-route-' + (process.env.GITHUB_RUN_ID || 'local') + '.json', JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
}

const url = await resolveWorkerUrl();
const token = resolveWorkerToken();
if (!url || !token) {
  writeReceipt({schema: 'ltzzz.meta-issue-route-verify.v1', error: 'worker_url_or_token_missing', url_configured: Boolean(url), token_configured: Boolean(token)});
  process.exit(1);
}

const payload = {
  task_id: 'META-ISSUE-ROUTE-' + (process.env.GITHUB_RUN_ID || Date.now()),
  title: 'issue 通道连通性自检',
  body: 'dry_run 自检：不创建 Issue，只验证路由、策略与凭据状态。',
  dry_run: true,
};

let res = null;
let data = null;
let error = null;
try {
  res = await fetch(url + '/issue', {
    method: 'POST',
    headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20000),
  });
  const text = await res.text();
  try { data = JSON.parse(text); } catch { error = text.slice(0, 200); }
} catch (e) {
  error = String((e && e.message) || e).slice(0, 200);
}

const probeRequested = process.env.META_CREATE_PROBE_ISSUE === '1';
let created = null;
if (probeRequested && res && res.status === 200 && data && data.dry_run === true) {
  const createPayload = {
    task_id: 'META-CHANNEL-SELFTEST-20261120',
    title: '通道自检：Meta 可以直接开 Issue 了',
    labels: ['meta-report'],
    body: [
      'Meta 席位 Issue 通道自检。',
      '',
      '- Worker `/issue`：dry_run 与真实创建各跑一次',
      '- 权限：仅 Issues: Read and write，单仓库 ltzyz2181-collab/ltzzz',
      '- 仍未通：Workers AI 推理 401/403，模型暂时还产不出内容',
      '- 下一步：开通 Workers AI 后，Meta 才能自己写提案与复核',
    ].join('\n'),
  };
  try {
    const createRes = await fetch(url + '/issue', {
      method: 'POST',
      headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
      body: JSON.stringify(createPayload),
      signal: AbortSignal.timeout(20000),
    });
    const text = await createRes.text();
    let body = null;
    try { body = JSON.parse(text); } catch { body = null; }
    created = {
      http: createRes.status,
      status: body ? body.status : null,
      number: body ? body.number || null : null,
      url: body ? body.url || null : null,
      error: body ? body.error || null : text.slice(0, 200),
    };
  } catch (e) {
    created = {http: 0, status: null, number: null, url: null, error: String((e && e.message) || e).slice(0, 200)};
  }
}
const receipt = {
  schema: 'ltzzz.meta-issue-route-verify.v1',
  at: new Date().toISOString(),
  run_id: process.env.GITHUB_RUN_ID || null,
  worker_host: url.replace(/^https:\/\//, ''),
  http: res ? res.status : 0,
  issues_configured: data ? data.issues_configured === true : null,
  dry_run: data ? data.dry_run === true : null,
  would_create: data && data.would_create ? {repo: data.would_create.repo, labels: data.would_create.labels} : null,
  error: error || (data ? data.error || null : null),
  probe_issue_requested: probeRequested,
  probe_issue: created,
  created_issues: created && created.status === 'created' ? 1 : 0,
};
writeReceipt(receipt);
const probeOk = !probeRequested || (created && (created.status === 'created' || created.status === 'duplicate_skipped'));
process.exit(res && res.status === 200 && receipt.dry_run === true && probeOk ? 0 : 1);