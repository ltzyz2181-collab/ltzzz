#!/usr/bin/env node
// 部署外部定时器 Worker（Cloudflare Cron -> GitHub workflow_dispatch），并落可回读的部署回执。
//
// 设计边界：
//   - 凭据只从环境读取，经 wrangler secret put 的 stdin 注入，绝不打印；
//   - 验收只做健康回读、cron 配置回读、鉴权三态、真实派发一次并观察 GitHub run；
//   - 任何一步没有证据就写 blocker，不把 draft/tested/merged 说成 deployed。
//
// 用法（在仓库根目录）：
//   CLOUDFLARE_ACCOUNT_ID=... CLOUDFLARE_API_TOKEN=... LTZZZ_AGENT_TOKEN=... TIMER_TRIGGER_TOKEN=... \
//     node scripts/deploy-ops-timer.mjs

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';

const WORKER = 'ltzzz-ops-timer';
const CFG = 'wrangler.ops-timer.toml';
const REVISION = 'ops-timer-v1';
const CRON = '*/15 * * * *';
const REPOSITORY = process.env.REPO || 'ltzyz2181-collab/ltzzz';
const HEALTH_URL = `https://${WORKER}.ltzyz2181.workers.dev/health`;
const AUTH_URL = `https://${WORKER}.ltzyz2181.workers.dev/auth/check`;
const TICK_URL = `https://${WORKER}.ltzyz2181.workers.dev/tick`;

const account = process.env.CLOUDFLARE_ACCOUNT_ID;
const cfToken = process.env.CLOUDFLARE_API_TOKEN;
const ghToken = process.env.LTZZZ_AGENT_TOKEN;
const triggerToken = process.env.TIMER_TRIGGER_TOKEN;
const runId = process.env.GITHUB_RUN_ID || 'local';
const sourceCommit = process.env.GITHUB_SHA || '';
const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, '');

if (!account || !cfToken || !ghToken || !triggerToken) {
  console.error(
    '缺少部署凭据：需要 CLOUDFLARE_ACCOUNT_ID / CLOUDFLARE_API_TOKEN / LTZZZ_AGENT_TOKEN / TIMER_TRIGGER_TOKEN（只检查是否存在，值不打印）',
  );
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(sourceCommit)) {
  console.error('需要精确的 GITHUB_SHA（40 位十六进制）作为部署来源；拒绝在来源不明时部署');
  process.exit(2);
}

const evidence = [];
const blockers = [];
const state = {health: null, tickResult: null, dispatchRun: null, versionId: null, deployOutput: ''};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ok(kind, text) {
  evidence.push({kind, result: 'ok', evidence: text});
}
function failed(kind, text, blocker) {
  evidence.push({kind, result: 'failed', evidence: text});
  if (blocker) blockers.push(blocker);
}

function runWrangler(args, input) {
  return execFileSync('npx', ['--yes', 'wrangler@4', ...args], {
    encoding: 'utf8',
    input,
    stdio: input === undefined ? ['ignore', 'pipe', 'pipe'] : ['pipe', 'pipe', 'pipe'],
  });
}

function wranglerError(error) {
  const parts = [];
  if (error?.stdout) parts.push(String(error.stdout));
  if (error?.stderr) parts.push(String(error.stderr));
  const text = parts.join('\n').replace(/\s+/g, ' ').trim();
  return text ? text.slice(0, 240) : String(error?.message || error).slice(0, 240);
}

async function getJson(url, options = {}) {
  const response = await fetch(url, {...options, signal: AbortSignal.timeout(20000)});
  let body = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  return {status: response.status, ok: response.ok, body};
}

async function cloudflare(route) {
  const {status, ok: httpOk, body} = await getJson(
    `https://api.cloudflare.com/client/v4/accounts/${account}${route}`,
    {headers: {authorization: `Bearer ${cfToken}`}},
  );
  if (!httpOk || !body?.success) throw new Error(`cloudflare_${status}`);
  return body.result;
}

async function healthReadback() {
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      const {ok: httpOk, body} = await getJson(HEALTH_URL);
      if (
        httpOk &&
        body?.ok === true &&
        body.revision === REVISION &&
        body.credential_configured === true &&
        body.trigger_configured === true &&
        body.token_echo === false
      ) {
        return body;
      }
    } catch {
      /* 未就绪，继续轮询；不把一次异常当成成功 */
    }
    if (attempt < 17) await sleep(2000);
  }
  return null;
}

async function readCronSchedules() {
  try {
    const result = await cloudflare(`/workers/scripts/${WORKER}/schedules`);
    const list = Array.isArray(result) ? result : Array.isArray(result?.schedules) ? result.schedules : [];
    return list.map((item) => item.cron).filter(Boolean);
  } catch {
    return null;
  }
}

async function githubRunSince(workflow, sinceMs) {
  const headers = {
    authorization: `Bearer ${ghToken}`,
    accept: 'application/vnd.github+json',
    'user-agent': 'ltzzz-ops-timer-deploy',
  };
  for (let attempt = 0; attempt < 18; attempt += 1) {
    try {
      const {ok: httpOk, body} = await getJson(
        `https://api.github.com/repos/${REPOSITORY}/actions/workflows/${encodeURIComponent(workflow)}/runs?event=workflow_dispatch&per_page=20`,
        {headers},
      );
      const runs = httpOk && Array.isArray(body?.workflow_runs) ? body.workflow_runs : [];
      const hit = runs.find(
        (run) =>
          run.event === 'workflow_dispatch' &&
          run.head_branch === 'main' &&
          Date.parse(run.created_at) >= sinceMs - 15000,
      );
      if (hit) {
        return {id: hit.id, html_url: hit.html_url, event: hit.event, status: hit.status, created_at: hit.created_at};
      }
    } catch {
      /* 索引延迟，继续轮询 */
    }
    if (attempt < 17) await sleep(5000);
  }
  return null;
}

function appendLedger(receiptId, green) {
  const doc = 'docs/2026-11-16-已闭环事项登记与勿重复清单.md';
  if (!fs.existsSync(doc)) return false;
  const current = fs.readFileSync(doc, 'utf8');
  if (current.includes(receiptId)) return true;
  const section = [
    '',
    `## ${stamp.slice(0, 4)}-${stamp.slice(4, 6)}-${stamp.slice(6, 8)} 追加：外部定时器部署（${receiptId}）`,
    '',
    '| 事项 | 状态 |',
    '|---|---|',
    `| 回执 | \`ops/deploy-receipts/${receiptId}.json\` |`,
    `| 目标 | Cloudflare Cron \`${CRON}\` → GitHub \`workflow_dispatch\`（\`${WORKER}\`） |`,
    `| 结果 | ${green ? '健康回读 + cron 配置 + 真实派发全部验证通过' : `存在阻碍：${blockers.join('；')}`} |`,
    '| 状态分层 | draft/tested/merged/deployed/submitted 由回执记录；platform_accepted 仅指 Cloudflare 部署与 GitHub run 被观测到，不代表业务验收或任何资金动作 |',
    '',
  ].join('\n');
  fs.appendFileSync(doc, section);
  return true;
}

// 无论成功还是中途失败，都写报告 + 回执 + 登记，避免“失败无证据”。
function finalize() {
  let green = blockers.length === 0;

  fs.mkdirSync('knowledge/results/ops-timer', {recursive: true});
  const report = {
    schema: 'ltzzz.ops-timer.deploy.v1',
    at: new Date().toISOString(),
    run_id: runId,
    source_commit: sourceCommit,
    worker: WORKER,
    revision: REVISION,
    cron: CRON,
    status: green ? 'deployment_health_cron_dispatch_verified' : 'deployment_with_blockers',
    version_id: state.versionId,
    health: state.health,
    tick: state.tickResult,
    dispatch_run: state.dispatchRun,
    evidence,
    blockers,
    secrets_included: false,
    model_calls: 0,
    financial_actions: 0,
  };
  fs.writeFileSync(`knowledge/results/ops-timer/deploy-${runId}.json`, `${JSON.stringify(report, null, 2)}\n`);

  const receiptId = `DR-${stamp}-ops-timer-${runId}`;
  const receipt = {
    schema: 'ltzzz.deploy.receipt.v1',
    receipt_id: receiptId,
    target: 'external-ops-timer',
    platform: 'cloudflare-workers-cron + github-actions-workflow-dispatch',
    env_id: `${REPOSITORY}@main + ${WORKER}`,
    code_commit: sourceCommit,
    code_path: 'workers/ops-timer',
    deployed_at: new Date().toISOString(),
    deployment_status: green ? 'deployed_verified' : 'deployed_with_blockers',
    worker_revision: REVISION,
    cron: CRON,
    task: {task_id: `OPS-TIMER-${stamp}`, run_id: runId},
    states: {
      draft: 'done',
      tested: evidence.some((row) => row.kind === 'worker_unit_tests' && row.result === 'ok') ? 'done' : 'blocked',
      merged: 'done',
      deployed: evidence.some((row) => row.kind === 'worker_deployed' && row.result === 'ok') ? 'done' : 'blocked',
      submitted: 'done',
      platform_accepted: state.dispatchRun ? 'done' : 'blocked',
    },
    verified: evidence,
    blockers,
    next_action: green
      ? null
      : '按下一条 blocker 修复后重新部署；不得把本次部署描述为已验收',
    evidence_ref: `knowledge/results/ops-timer/deploy-${runId}.json`,
  };
  fs.mkdirSync('work', {recursive: true});
  fs.writeFileSync('work/ops-timer-receipt.json', `${JSON.stringify(receipt, null, 2)}\n`);

  try {
    execFileSync('node', ['scripts/deploy-receipt.mjs', 'record', 'work/ops-timer-receipt.json'], {stdio: 'inherit'});
    execFileSync('node', ['scripts/deploy-receipt.mjs', 'verify', receiptId], {stdio: 'inherit'});
  } catch {
    blockers.push('deploy_receipt_record_or_verify_failed');
    green = false;
  }

  appendLedger(receiptId, green);

  const commitMessage = green
    ? `ops-timer: external cron deployed, health+cron+dispatch verified (${receiptId})`
    : `ops-timer: deploy blockers recorded (${receiptId})`;
  fs.writeFileSync(
    'knowledge/results/ops-timer/latest.json',
    `${JSON.stringify(
      {
        status: green ? 'deployment_health_cron_dispatch_verified' : 'deployment_with_blockers',
        receipt_id: receiptId,
        receipt_path: `ops/deploy-receipts/${receiptId}.json`,
        commit_message: commitMessage,
        blockers,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    JSON.stringify({
      status: green ? 'deployment_health_cron_dispatch_verified' : 'deployment_with_blockers',
      receipt_id: receiptId,
      blockers,
      evidence: evidence.map((row) => `${row.result}:${row.kind}`),
    }),
  );
  return green;
}

async function main() {
  // 1) 绑定 secrets（值经 stdin，不打印）
  try {
    runWrangler(['secret', 'put', 'LTZZZ_AGENT_TOKEN', '-c', CFG], ghToken);
    runWrangler(['secret', 'put', 'TIMER_TRIGGER_TOKEN', '-c', CFG], triggerToken);
    ok('secrets_bound', 'wrangler secret put LTZZZ_AGENT_TOKEN / TIMER_TRIGGER_TOKEN 完成（值未打印）');
  } catch (error) {
    failed('secrets_bound', `wrangler secret put 失败：${wranglerError(error)}`, 'wrangler_secret_put_failed');
    return finalize();
  }

  // 2) 部署前先自证当前代码的测试结果（verify job 已跑；这里写进回执证据）
  try {
    const output = execFileSync('node', ['--test', 'scripts/tests/ops-timer-worker.test.mjs'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const pass = /# pass (\d+)/.exec(output)?.[1];
    const fail = /# fail (\d+)/.exec(output)?.[1];
    if (fail && fail !== '0') {
      failed('worker_unit_tests', `node --test：pass=${pass ?? '?'} fail=${fail}`, 'worker_unit_tests_failed');
      return finalize();
    }
    ok('worker_unit_tests', `node --test scripts/tests/ops-timer-worker.test.mjs：pass=${pass ?? '?'} fail=${fail ?? '?'}`);
  } catch (error) {
    const output = `${error?.stdout || ''}\n${error?.stderr || ''}`;
    const pass = /# pass (\d+)/.exec(output)?.[1];
    const fail = /# fail (\d+)/.exec(output)?.[1];
    failed('worker_unit_tests', `测试未通过：pass=${pass ?? '?'} fail=${fail ?? '?'}`, 'worker_unit_tests_failed');
    return finalize();
  }

  // 3) 部署
  try {
    state.deployOutput = runWrangler(['deploy', '-c', CFG]);
    state.versionId =
      /(?:Current\s+)?Version ID:\s*([0-9a-f-]{20,})/i.exec(state.deployOutput)?.[1] || null;
    ok(
      'worker_deployed',
      `wrangler deploy 完成：service=${WORKER}${state.versionId ? ` version=${state.versionId}` : ''}（cron 由 ${CFG} 声明）`,
    );
  } catch (error) {
    failed('worker_deployed', `wrangler deploy 失败：${wranglerError(error)}`, 'wrangler_deploy_failed');
    return finalize();
  }

  // 4) 健康回读
  state.health = await healthReadback();
  if (state.health) {
    ok(
      'health_readback',
      `GET /health 200：revision=${state.health.revision} credential_configured=${state.health.credential_configured} trigger_configured=${state.health.trigger_configured} token_echo=${state.health.token_echo}`,
    );
  } else {
    failed('health_readback', 'GET /health 18 次轮询未达到预期修订与配置状态', 'worker_health_readback_failed');
  }

  // 5) cron 配置回读（Cloudflare API 优先，wrangler 部署输出兜底）
  const cronList = await readCronSchedules();
  if (cronList && cronList.includes(CRON)) {
    ok('cron_schedule_configured', `Cloudflare API 回读 schedules：[${cronList.join(', ')}] 含 ${CRON}`);
  } else if (state.deployOutput.includes(CRON)) {
    ok('cron_schedule_configured', `Cloudflare schedules API 未回读，但 wrangler 部署输出含 ${CRON}`);
  } else {
    failed(
      'cron_schedule_configured',
      `未能回读 ${CRON}：schedules API=${cronList ? `[${cronList.join(', ')}]` : 'unavailable'}；wrangler 输出${state.deployOutput.includes('schedule') ? '含 schedule 行但未匹配表达式' : '无 schedule 行'}`,
      'cron_schedule_unverified',
    );
  }

  // 6) 鉴权三态：匿名 401 / 错误口令 401 / 有效口令 200
  try {
    const anonymous = await getJson(AUTH_URL);
    const wrong = await getJson(AUTH_URL, {headers: {authorization: 'Bearer deliberately-invalid-timer-token'}});
    const valid = await getJson(AUTH_URL, {headers: {authorization: `Bearer ${triggerToken}`}});
    const passed =
      anonymous.status === 401 &&
      wrong.status === 401 &&
      valid.status === 200 &&
      valid.body?.authenticated === true;
    const line = `anonymous=${anonymous.status} wrong=${wrong.status} valid=${valid.status} authenticated=${valid.body?.authenticated === true}`;
    if (passed) ok('auth_three_state', line);
    else failed('auth_three_state', line, 'worker_auth_acceptance_failed');
  } catch (error) {
    failed('auth_three_state', `鉴权回读异常：${String(error?.message || error).slice(0, 160)}`, 'worker_auth_transport_failed');
  }

  // 7) 真实派发一次 task-hub，并确认 GitHub 上出现新的 workflow_dispatch run
  try {
    const tickAt = Date.now();
    const tick = await getJson(TICK_URL, {
      method: 'POST',
      headers: {authorization: `Bearer ${triggerToken}`, 'content-type': 'application/json'},
      body: JSON.stringify({force: ['task-hub']}),
    });
    state.tickResult = {
      status: tick.status,
      ok: tick.body?.ok === true,
      dispatched: tick.body?.dispatched ?? null,
      failed: tick.body?.failed ?? null,
    };
    if (tick.status === 200 && tick.body?.dispatched === 1) {
      state.dispatchRun = await githubRunSince('task-hub.yml', tickAt);
      if (state.dispatchRun) {
        ok(
          'github_dispatch_observed',
          `POST /tick 强制派发 task-hub.yml 成功（204）；GitHub run ${state.dispatchRun.id} ${state.dispatchRun.status} ${state.dispatchRun.html_url}`,
        );
      } else {
        failed(
          'github_dispatch_observed',
          'POST /tick 返回 dispatched=1，但 90 秒内未在 GitHub 观察到新的 task-hub workflow_dispatch run',
          'github_dispatch_run_not_observed',
        );
      }
    } else {
      failed(
        'github_dispatch_observed',
        `POST /tick 未成功：http=${tick.status} ok=${tick.body?.ok} dispatched=${tick.body?.dispatched} failed=${tick.body?.failed} error=${String(tick.body?.error || '').slice(0, 120)}`,
        'worker_tick_dispatch_failed',
      );
    }
  } catch (error) {
    failed('github_dispatch_observed', `POST /tick 异常：${String(error?.message || error).slice(0, 160)}`, 'worker_tick_transport_failed');
  }

  return finalize();
}

const green = await main();
process.exitCode = green ? 0 : 1;
