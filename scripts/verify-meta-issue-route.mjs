import fs from 'node:fs';
const url = String(process.env.META_WORKER_URL || '').replace(/\/+$/, '');
const token = process.env.META_WORKER_TOKEN || '';
if (!url || !token) {
  console.log(JSON.stringify({schema: 'ltzzz.meta-issue-route-verify.v1', error: 'worker_url_or_token_missing'}));
  process.exit(1);
}
const payload = {
  task_id: 'META-ISSUE-ROUTE-' + (process.env.GITHUB_RUN_ID || Date.now()),
  title: 'issue 通道连通性自检',
  body: 'dry_run 自检：不创建 Issue，只验证路由、策略与凭据状态。',
  dry_run: true,
};
const res = await fetch(url + '/issue', {
  method: 'POST',
  headers: {Authorization: 'Bearer ' + token, 'Content-Type': 'application/json'},
  body: JSON.stringify(payload),
  signal: AbortSignal.timeout(20000),
});
const text = await res.text();
let data = null; try { data = JSON.parse(text); } catch { data = null; }
const receipt = {
  schema: 'ltzzz.meta-issue-route-verify.v1',
  at: new Date().toISOString(),
  run_id: process.env.GITHUB_RUN_ID || null,
  worker_host: new URL(url).host,
  http: res.status,
  issues_configured: data ? data.issues_configured === true : null,
  dry_run: data ? data.dry_run === true : null,
  would_create: data && data.would_create ? {repo: data.would_create.repo, labels: data.would_create.labels} : null,
  error: data ? data.error || null : text.slice(0, 200),
  created_issues: 0,
};
fs.mkdirSync('knowledge/results/meta', {recursive: true});
fs.writeFileSync('knowledge/results/meta/issue-route-' + (process.env.GITHUB_RUN_ID || 'local') + '.json', JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt));
process.exit(res.status === 200 && receipt.dry_run === true ? 0 : 1);