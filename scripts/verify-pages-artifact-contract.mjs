#!/usr/bin/env node
// CI 守卫：确保一个 workflow run 内 github-pages artifact 恰好一份。
//
// 用法：
//   node scripts/verify-pages-artifact-contract.mjs --mode=pre-upload
//   node scripts/verify-pages-artifact-contract.mjs --mode=pre-deploy
//   node scripts/verify-pages-artifact-contract.mjs --mode=pre-upload --from-file=f.json
//
// 数据源：默认走 GitHub REST（/repos/{repo}/actions/runs/{run}/artifacts），
// 需要 GITHUB_TOKEN（或 GH_TOKEN）+ GITHUB_REPOSITORY + GITHUB_RUN_ID；
// --from-file 用于离线/测试。
//
// 输出：stdout 一行 JSON；若存在 GITHUB_OUTPUT，写 action=<...> 供后续步骤 if 使用。
// 退出码：契约成立 0；契约被破坏 1。

import fs from 'node:fs';
import {
  analyzePagesArtifacts,
  pollPagesArtifacts,
  renderDiagnostics,
  PAGES_ARTIFACT_VISIBILITY_DELAY_MS,
  PAGES_ARTIFACT_VISIBILITY_MAX_ATTEMPTS,
} from './lib/pages-artifact-contract.mjs';

function arg(name, fallback = null) {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return fallback;
  if (hit === `--${name}`) return true;
  return hit.slice(`--${name}=`.length);
}

function intArg(name, fallback) {
  const raw = arg(name, null);
  const n = Number(raw === null || raw === true ? fallback : raw);
  return Number.isFinite(n) && n >= 0 ? Math.trunc(n) : fallback;
}

async function fetchArtifacts() {
  const repository = process.env.GITHUB_REPOSITORY;
  const runId = process.env.GITHUB_RUN_ID;
  const token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
  if (!repository || !runId || !token) throw Error('pages_artifact_api_context_missing');

  const url = `https://api.github.com/repos/${repository}/actions/runs/${runId}/artifacts?per_page=100`;
  const res = await fetch(url, {
    headers: {
      accept: 'application/vnd.github+json',
      authorization: `Bearer ${token}`,
      'user-agent': 'ltzzz-pages-artifact-contract',
      'x-github-api-version': '2022-11-28',
    },
  });
  if (!res.ok) throw Error(`pages_artifact_api_http_${res.status}`);
  const body = await res.json();
  return Array.isArray(body.artifacts) ? body.artifacts : [];
}

async function main() {
  const mode = String(arg('mode', 'pre-upload'));
  const fromFile = arg('from-file', null);

  let result;
  if (fromFile) {
    const raw = JSON.parse(fs.readFileSync(String(fromFile), 'utf8'));
    const artifacts = Array.isArray(raw) ? raw : raw.artifacts;
    result = {...analyzePagesArtifacts(artifacts, {mode}), attempts: 1, visibility_retry: false};
  } else {
    // pre-deploy 的"零份"可能只是列表接口尚未可见，做有界轮询；多份仍立即失败。
    result = await pollPagesArtifacts({
      mode,
      fetchOnce: fetchArtifacts,
      maxAttempts: intArg('poll-attempts', PAGES_ARTIFACT_VISIBILITY_MAX_ATTEMPTS),
      delayMs: intArg('poll-delay-ms', process.env.PAGES_ARTIFACT_POLL_DELAY_MS ?? PAGES_ARTIFACT_VISIBILITY_DELAY_MS),
      onRetry: ({attempt, nextAttempt, delayMs, result: r}) => {
        console.error(
          `pages_artifact_visibility_wait attempt=${attempt} next=${nextAttempt} delay_ms=${delayMs} reason=${r.reason}`,
        );
      },
    });
  }
  const context = {
    mode,
    repository: process.env.GITHUB_REPOSITORY,
    run_id: process.env.GITHUB_RUN_ID,
    run_attempt: process.env.GITHUB_RUN_ATTEMPT,
  };

  console.log(JSON.stringify({mode, ...result}));

  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `action=${result.action}\ncount=${result.count}\n`);
  }

  if (!result.ok) {
    console.error(renderDiagnostics(result, context));
    process.exitCode = 1;
    return;
  }
  if (result.action === 'reuse') {
    console.warn(renderDiagnostics(result, context));
  }
}

main().catch((err) => {
  console.error(`pages_artifact_contract_error: ${err.message}`);
  process.exitCode = 1;
});
