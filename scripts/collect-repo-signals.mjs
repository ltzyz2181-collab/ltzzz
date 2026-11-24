#!/usr/bin/env node
// GitHub 仓库信号快照：Issues、PR、PR 评论、Actions 失败、部署回执。
//
// 边界：只采公开元数据（编号、标题、标签、时间、run id、回执状态），不采评论正文、
// 不采邮件正文、不写 token。默认只手工运行，不接入定时工作流：intake job 的
// permissions 固定为 contents: write，不能读取 issues/actions；本任务禁止改权限。
//
// 用法：GH_TOKEN=... node scripts/collect-repo-signals.mjs
// 输出：knowledge/results/deep-superagent/repo-signals/latest.json
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const REPO_SIGNALS_SCHEMA = 'ltzzz.deep-superagent.repo-signals.v1';
export const DEFAULT_OUT = 'knowledge/results/deep-superagent/repo-signals/latest.json';
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'ltzyz2181-collab/ltzzz';
const API = 'https://api.github.com';
const AMOUNT = /[¥￥$＄€£]?\s*[0-9][0-9.,]*\s*(?:UT|USDT|CNY|USD|EUR|ETH|BTC|元|美元|港币)?/gi;
const TOKEN = /[A-Za-z0-9_-]{28,}/g;
const TASK_ID = /\b[A-Z][A-Z0-9]*(?:-[A-Za-z0-9]+)*-\d{8}(?:-[A-Za-z0-9]+)*\b/g;

export function redactMetadata(text, max = 100) {
  return String(text || '')
    .replace(AMOUNT, '<amount>')
    .replace(TOKEN, '<token>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

export function extractTaskIds(...texts) {
  const found = new Set();
  for (const text of texts) {
    if (!text) continue;
    for (const match of String(text).matchAll(TASK_ID)) found.add(match[0].toUpperCase());
  }
  return [...found].sort();
}

function ageDays(value, now) {
  const parsed = Date.parse(value || '');
  return Number.isFinite(parsed) ? Math.max(0, Math.floor((now.getTime() - parsed) / 864e5)) : null;
}

function prNumberFromUrl(url) {
  const match = String(url || '').match(/\/pulls\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

function issueNumberFromUrl(url) {
  const match = String(url || '').match(/\/issues\/(\d+)$/);
  return match ? Number(match[1]) : null;
}

export function buildRepoSignals({
  repo = null,
  issues = [],
  pulls = [],
  runs = [],
  issueComments = [],
  prReviewComments = [],
  deployReceipts = [],
  now = new Date(),
  windowDays = 14,
  source = {},
} = {}) {
  const cutoff = new Date(now.getTime() - windowDays * 864e5).toISOString();
  const openIssues = issues
    .filter((issue) => issue?.state === 'open' && !issue.pull_request)
    .map((issue) => ({
      number: issue.number,
      title_short: redactMetadata(issue.title, 100),
      task_ids: extractTaskIds(issue.title),
      labels: (issue.labels || []).map((label) => (typeof label === 'string' ? label : label?.name)).filter(Boolean).slice(0, 8),
      updated_at: issue.updated_at || null,
      age_days: ageDays(issue.updated_at, now),
      comments: issue.comments ?? null,
      html_url: issue.html_url || null,
    }))
    .sort((a, b) => Number(b.number) - Number(a.number));

  const openPulls = pulls
    .filter((pull) => pull?.state === 'open')
    .map((pull) => ({
      number: pull.number,
      title_short: redactMetadata(pull.title, 100),
      task_ids: extractTaskIds(pull.title),
      draft: pull.draft === true,
      head_ref: pull.head?.ref || null,
      head_sha: pull.head?.sha || null,
      base_ref: pull.base?.ref || null,
      updated_at: pull.updated_at || null,
      age_days: ageDays(pull.updated_at, now),
      html_url: pull.html_url || null,
    }))
    .sort((a, b) => Number(b.number) - Number(a.number));

  const failedRuns = runs
    .filter((run) => ['failure', 'timed_out', 'cancelled', 'startup_failure'].includes(run?.conclusion))
    .filter((run) => String(run.created_at || '') >= cutoff)
    .map((run) => ({
      id: run.id,
      name: redactMetadata(run.name, 80),
      event: run.event || null,
      conclusion: run.conclusion,
      head_sha: run.head_sha || null,
      run_attempt: run.run_attempt ?? null,
      created_at: run.created_at || null,
      html_url: run.html_url || null,
    }))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const issueCommentRefs = issueComments
    .filter((comment) => String(comment.created_at || '') >= cutoff)
    .map((comment) => ({
      id: comment.id,
      issue_number: issueNumberFromUrl(comment.issue_url),
      created_at: comment.created_at || null,
      updated_at: comment.updated_at || null,
    }))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  const prCommentRefs = prReviewComments
    .filter((comment) => String(comment.created_at || '') >= cutoff)
    .map((comment) => ({
      id: comment.id,
      pull_number: prNumberFromUrl(comment.pull_request_url),
      created_at: comment.created_at || null,
      updated_at: comment.updated_at || null,
    }))
    .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

  const unresolvedReceipts = (deployReceipts || []).filter((receipt) => {
    const status = String(receipt?.status || 'unknown').toLowerCase();
    const blockers = Array.isArray(receipt?.blockers) ? receipt.blockers : [];
    return !['ok', 'success', 'verified', 'deployed'].includes(status) || blockers.length > 0;
  }).map((receipt) => ({
    receipt_id: receipt.receipt_id || null,
    path: receipt.path || null,
    status: receipt.status || 'unknown',
    task_id: receipt.task_id || null,
    task_ids: extractTaskIds(receipt.task_id),
    code_commit: receipt.code_commit || null,
    at: receipt.at || receipt.generated_at_utc || null,
    blockers_count: Array.isArray(receipt.blockers) ? receipt.blockers.length : 0,
  }));

  return {
    schema: REPO_SIGNALS_SCHEMA,
    status: 'ok',
    generated_at_utc: now.toISOString(),
    repo: repo ? {
      full_name: repo.full_name || REPO,
      default_branch: repo.default_branch || null,
      private: repo.private === true,
      open_issues_count: repo.open_issues_count ?? null,
      pushed_at: repo.pushed_at || null,
    } : {full_name: REPO},
    window_days: windowDays,
    window_since: cutoff,
    issues: {
      open_count: openIssues.length,
      recent_count: issues.filter((issue) => String(issue.updated_at || '') >= cutoff).length,
      open: openIssues,
    },
    pulls: {
      open_count: openPulls.length,
      open: openPulls,
    },
    actions: {
      failed_count: failedRuns.length,
      failed: failedRuns,
      recent_count: runs.filter((run) => String(run.created_at || '') >= cutoff).length,
      success_count: runs.filter((run) => run.conclusion === 'success').length,
    },
    comments: {
      issue_comments_recent: issueCommentRefs.length,
      pr_review_comments_recent: prCommentRefs.length,
      issue_comment_refs: issueCommentRefs.slice(0, 100),
      pr_review_comment_refs: prCommentRefs.slice(0, 100),
      bodies_collected: false,
      note: '只保留评论编号与所属 issue/PR，不采评论正文；是否进入待办由 is_open 的 issue/PR 项承载。',
    },
    deploy_receipts: {
      scanned: (deployReceipts || []).length,
      unresolved_count: unresolvedReceipts.length,
      unresolved: unresolvedReceipts.slice(0, 100),
    },
    source: {
      collector: 'collect-repo-signals.mjs',
      api: 'github_rest',
      repo: REPO,
      ...source,
    },
    contains_mail_body: false,
    external_model_safe: true,
  };
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'ltzzz-repo-signals',
      'X-GitHub-Api-Version': '2022-11-28',
    },
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok) throw new Error(`github_http_${response.status}:${url.split('/repos/')[1]?.split('?')[0] || ''}`);
  return response.json();
}

function readDeployReceipts(root) {
  const dir = path.join(root, 'ops/deploy-receipts');
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => name.endsWith('.json'));
  } catch {
    return [];
  }
  const receipts = [];
  for (const name of names) {
    try {
      const doc = JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'));
      receipts.push({...doc, path: `ops/deploy-receipts/${name}`});
    } catch {
      receipts.push({path: `ops/deploy-receipts/${name}`, status: 'unparseable'});
    }
  }
  return receipts;
}

export async function collectRepoSignals({token, root = REPO_ROOT, now = new Date(), windowDays = 14} = {}) {
  if (!token) {
    return {
      schema: REPO_SIGNALS_SCHEMA,
      status: 'blocked',
      block_code: 'BLOCKED_EVIDENCE',
      generated_at_utc: now.toISOString(),
      error: 'github_token_missing',
      contains_mail_body: false,
      external_model_safe: true,
    };
  }
  const since = new Date(now.getTime() - windowDays * 864e5).toISOString();
  const errors = [];
  const safe = async (name, url, fallback) => {
    try {
      return await fetchJson(url, token);
    } catch (error) {
      errors.push(`${name}:${String(error.message || error).slice(0, 120)}`);
      return fallback;
    }
  };
  const repo = await safe('repo', `${API}/repos/${REPO}`, {});
  const issues = await safe('issues', `${API}/repos/${REPO}/issues?state=all&sort=updated&direction=desc&per_page=100`, []);
  const pulls = await safe('pulls', `${API}/repos/${REPO}/pulls?state=open&per_page=100&sort=updated&direction=desc`, []);
  const runsPayload = await safe('actions', `${API}/repos/${REPO}/actions/runs?per_page=50`, {workflow_runs: []});
  const issueComments = await safe('issue_comments', `${API}/repos/${REPO}/issues/comments?since=${encodeURIComponent(since)}&per_page=100&sort=updated&direction=desc`, []);
  const prComments = await safe('pr_comments', `${API}/repos/${REPO}/pulls/comments?since=${encodeURIComponent(since)}&per_page=100&sort=updated&direction=desc`, []);
  const doc = buildRepoSignals({
    repo,
    issues: Array.isArray(issues) ? issues : [],
    pulls: Array.isArray(pulls) ? pulls : [],
    runs: Array.isArray(runsPayload?.workflow_runs) ? runsPayload.workflow_runs : [],
    issueComments: Array.isArray(issueComments) ? issueComments : [],
    prReviewComments: Array.isArray(prComments) ? prComments : [],
    deployReceipts: readDeployReceipts(root),
    now,
    windowDays,
    source: {generated_at_utc: now.toISOString()},
  });
  if (errors.length) {
    doc.status = 'partial';
    doc.collection_errors = errors;
    doc.note = '部分 GitHub 信号读取失败；不得把缺失块当成“没有待办”。';
  }
  return doc;
}

export function writeRepoSignals(doc, root = REPO_ROOT) {
  const out = path.join(root, DEFAULT_OUT);
  fs.mkdirSync(path.dirname(out), {recursive: true});
  fs.writeFileSync(out, JSON.stringify(doc, null, 1) + '\n');
  return out;
}

async function main() {
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '';
  const doc = await collectRepoSignals({token});
  writeRepoSignals(doc);
  console.log(JSON.stringify({
    status: doc.status,
    block_code: doc.block_code || null,
    issues_open: doc.issues?.open_count ?? null,
    pulls_open: doc.pulls?.open_count ?? null,
    failed_runs: doc.actions?.failed_count ?? null,
    deploy_receipts_unresolved: doc.deploy_receipts?.unresolved_count ?? null,
    comments: doc.comments ? {
      issue: doc.comments.issue_comments_recent,
      pr_review: doc.comments.pr_review_comments_recent,
    } : null,
  }));
  process.exitCode = doc.status === 'ok' ? 0 : doc.status === 'blocked' ? 2 : 2;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
