#!/usr/bin/env node
// 把 Deep 队列对 ISSUE 卡的真实结果回写到来源 Issue。
//
// 闭环缺口：deep-issue-dispatch.yml 只回写「卡已创建/被拦」，队列执行完后
// 没有任何评论，Issue 永远停在 hub:new，下一次 15 分钟 tick 继续改派/标 stale。
// 本脚本只读队列回执与 autonomy 回执，按 task-hub 的评论协议回写终态。
//
// 不调用模型、不碰资金/签名/凭据，只发一条 Issue 评论。
import fs from 'node:fs';

export const ISSUE_TASK_RE = /^DEEP-SUPERAGENT-\d{8}-ISSUE-([1-9]\d{0,6})(?:-R[1-9])?$/;
export const RESULT_MARKER_PREFIX = '<!-- deep-issue-result:';
export const DEFAULT_REPOSITORY = 'ltzyz2181-collab/ltzzz';

export function issueNumberForTask(taskId = '') {
  const match = ISSUE_TASK_RE.exec(String(taskId || ''));
  return match ? Number(match[1]) : null;
}

export function autonomyReceiptPath(taskId, inputSha256) {
  return `knowledge/results/deep-superagent/autonomy/${taskId}-${inputSha256}.json`;
}

export function resultMarker({taskId, runId}) {
  return `${RESULT_MARKER_PREFIX}${taskId}:${runId} -->`;
}

export function alreadyReported(comments = [], marker) {
  return (Array.isArray(comments) ? comments : []).some((comment) => String(comment?.body || '').includes(marker));
}

function codeAction(autonomy) {
  return (autonomy?.actions || []).find((action) => action?.action === 'code_change') || null;
}

function oneLine(value, fallback = 'unverified') {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  return text || fallback;
}

// 只输出可核对的字段；拿不到真实值就写 unverified，不补猜。
export function buildResultComment({
  taskId,
  item = {},
  autonomy = null,
  runUrl = '',
  issueNumber = null,
  runId = '',
  repository = DEFAULT_REPOSITORY,
} = {}) {
  const code = codeAction(autonomy);
  const autonomyStatus = String(autonomy?.status || '');
  const queueStatus = String(item?.status || 'unknown');
  const merged = autonomyStatus === 'executed' && code?.status === 'merged';
  const marker = resultMarker({taskId, runId});
  if (merged) {
    const prUrl = code?.pr ? `https://github.com/${repository}/pull/${code.pr}` : null;
    const tests = code?.test_ok === false ? 'failed' : 'ci_verified';
    return [
      `[delivered] seat=deep commit=${oneLine(code.merge_sha)} pr=${oneLine(prUrl)} ci=${oneLine(code?.ci?.status, 'unverified')} tests=${tests} deploy=not_deployed smoke=n/a`,
      '',
      '### Deep 执行结果',
      `- 卡：\`${taskId}\`${issueNumber ? `（Issue #${issueNumber}）` : ''}`,
      `- 队列：${runUrl || '未提供'}`,
      `- 自主状态：\`${autonomyStatus}\`；队列状态：\`${queueStatus}\``,
      `- 代码动作：\`${code.status}\`；merge：\`${oneLine(code.merge_sha)}\``,
      `- PR：${prUrl || '未提供'}`,
      '- 测试口径：合并前 CI 工作流已通过；本行不含独立测试命令输出。',
      '- 资金/签名/退款/凭据：未执行（`financial_execution=false`）',
      '',
      marker,
    ].join('\n');
  }
  const reason = autonomyStatus === 'blocked_fiduciary'
    ? 'deep_blocked_fiduciary'
    : autonomyStatus === 'partial'
      ? `deep_partial:${oneLine(code?.error || code?.status, 'unknown')}`
      : autonomyStatus === 'executed'
        ? `deep_code_not_merged:${oneLine(code?.status, 'unknown')}`
        : `deep_status:${oneLine(autonomyStatus || queueStatus, 'unknown')}`;
  return [
    `[blocked] seat=deep reason=${reason.replace(/\s+/g, '_')}`,
    '',
    '### Deep 执行结果',
    `- 卡：\`${taskId}\`${issueNumber ? `（Issue #${issueNumber}）` : ''}`,
    `- 队列：${runUrl || '未提供'}`,
    `- 自主状态：\`${autonomyStatus || 'unverified'}\`；队列状态：\`${queueStatus}\``,
    `- 代码动作：\`${oneLine(code?.status, 'none')}\`${code?.error ? `；原因：\`${oneLine(code.error)}\`` : ''}`,
    '- 资金/签名/退款/凭据：未执行（`financial_execution=false`）',
    '',
    marker,
  ].join('\n');
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function githubRequester(repository, token) {
  return async (method, path, body) => {
    const response = await fetch(`https://api.github.com/repos/${repository}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        accept: 'application/vnd.github+json',
        'user-agent': 'ltzzz-deep-issue-result',
        ...(body === undefined ? {} : {'content-type': 'application/json'}),
      },
      ...(body === undefined ? {} : {body: JSON.stringify(body)}),
    });
    if (!response.ok) throw new Error(`github_${method}_${response.status}:${path}`);
    const text = await response.text();
    return text ? JSON.parse(text) : {};
  };
}

export async function reportQueueReceipt({
  receipt,
  root = process.cwd(),
  repository = DEFAULT_REPOSITORY,
  token = '',
  runUrl = '',
  runId = '',
  request = null,
} = {}) {
  const items = Array.isArray(receipt?.items) ? receipt.items : [];
  const send = request || githubRequester(repository, token);
  const results = [];
  for (const item of items) {
    const issueNumber = issueNumberForTask(item?.task_id);
    if (!issueNumber) continue;
    const autonomyFile = item?.input_sha256 ? autonomyReceiptPath(item.task_id, item.input_sha256) : null;
    const autonomy = autonomyFile ? readJson(`${root}/${autonomyFile}`) : null;
    const marker = resultMarker({taskId: item.task_id, runId});
    const comments = await send('GET', `/issues/${issueNumber}/comments?per_page=100`);
    if (alreadyReported(comments, marker)) {
      results.push({issue: issueNumber, task_id: item.task_id, status: 'already_reported'});
      continue;
    }
    const body = buildResultComment({taskId: item.task_id, item, autonomy, runUrl, issueNumber, runId, repository});
    await send('POST', `/issues/${issueNumber}/comments`, {body});
    results.push({issue: issueNumber, task_id: item.task_id, status: 'posted', kind: body.startsWith('[delivered]') ? 'delivered' : 'blocked'});
  }
  return results;
}

async function main() {
  const file = process.env.QUEUE_RECEIPT || `knowledge/results/deep-superagent/queue-${process.env.GITHUB_RUN_ID}-attempt-${process.env.GITHUB_RUN_ATTEMPT}.json`;
  if (!fs.existsSync(file)) {
    console.log(JSON.stringify({status: 'no_receipt', file}));
    return 0;
  }
  const receipt = readJson(file);
  if (!receipt) throw new Error('invalid_queue_receipt');
  const token = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;
  if (!token) throw new Error('github_token_missing');
  const repository = process.env.GITHUB_REPOSITORY || DEFAULT_REPOSITORY;
  const results = await reportQueueReceipt({
    receipt,
    root: process.cwd(),
    repository,
    token,
    runId: String(process.env.GITHUB_RUN_ID || ''),
    runUrl: process.env.GITHUB_RUN_ID ? `https://github.com/${repository}/actions/runs/${process.env.GITHUB_RUN_ID}` : '',
  });
  console.log(JSON.stringify({status: 'reported', results}));
  return 0;
}

if (process.argv[1] && process.argv[1].endsWith('report-deep-issue-result.mjs')) {
  process.exitCode = await main();
}
