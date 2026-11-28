#!/usr/bin/env node
// 每日席位派单：把 Deep 调度要派的活写成带 `seat:<seat>` 标签的 GitHub Issue，
// 交给 Task Hub（每 15 分钟的 sync/reap/reassign）消费；没人在 24h 内 [claimed] 的卡
// 由 task-hub 自动改派并用 `mail:send` 卡叫醒新席位。
//
// 设计约束：
//   - 默认 dry-run：只有显式 `--apply` 且未设 DRY_RUN=1 时才创建 Issue；
//   - 幂等：同一 date+seat 的 task_id 已存在于开放卡中就不再创建；
//   - 标签由 seat 计算，不接受计划文件自带标签，避免越权改派；
//   - 不碰资金/退款/签名/私钥/钱包/Secret，也不做生产部署。
//
// 用法：
//   DRY_RUN=1 node scripts/dispatch-daily.mjs
//   node scripts/dispatch-daily.mjs --date 2026-11-28 --seats desktop-claude,desktop-codex
//   node scripts/dispatch-daily.mjs --apply            # 需要 LTZZZ_AGENT_TOKEN 或 GITHUB_TOKEN
//   node scripts/dispatch-daily.mjs --plan path.json   # cards[] 覆盖默认席位卡
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {SEATS, normalizeSeat, renderTaskBody, taskField} from './lib/task-hub.mjs';
import {githubClient} from './task-hub.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PLAN_SCHEMA = 'ltzzz.dispatch.daily-plan.v1';
export const DEFAULT_PLAN_PATH = 'knowledge/results/deep-superagent/dispatch-plan/latest.json';
export const DEFAULT_SEATS = ['desktop-claude', 'desktop-codex'];
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const asDate = (now = new Date()) => now.toISOString().slice(0, 10);
const seatToken = (seat) => String(seat).replace(/[^a-z0-9]+/gi, '-').toUpperCase();

export function seatTaskId(seat, date) {
  if (!DATE_RE.test(String(date || ''))) throw Error('invalid_dispatch_date');
  if (!SEATS.includes(seat)) throw Error(`unknown_dispatch_seat:${seat}`);
  return `LTZZZ-SEAT-DAILY-${date.replaceAll('-', '')}-${seatToken(seat)}`;
}

// 默认计划：每个在册席位每天一张「开工/回执」卡。卡片本身不含交付物，
// 只要求席位轮询 Task Hub、最多认领一张开放卡并按协议回执，没人领就交给自动改派。
export function defaultSeatPlan({date = asDate(), seats = DEFAULT_SEATS} = {}) {
  const cards = seats.map((rawSeat) => {
    const seat = normalizeSeat(rawSeat) || rawSeat;
    const taskId = seatTaskId(seat, date);
    const body = renderTaskBody({
      task_id: taskId,
      decision_id: 'none',
      seat,
      goal: `每日开工：轮询 Task Hub 中 seat:${seat} 的开放任务，最多认领一张并按协议回执；没有可领取任务时如实回报空队列。`,
      scope: '只读取 GitHub Issue / 评论 / 仓库公开证据；只在本卡评论回执；不修改其他席位的卡片或标签。',
      forbidden: '不动资金、退款终态、签名、私钥/助记词、钱包（含五签）；不改 Secret；不做生产部署；不实际付款；不伪造回执。',
      acceptance: [
        `node scripts/task-hub.mjs poll --seat ${seat}`,
        `有可领取任务：node scripts/task-hub.mjs claim --issue <N> --seat ${seat} --branch <branch>，然后按该卡交付；`,
        `没有可领取任务：在本卡评论 [blocked] reason=no_open_task evidence=<poll 摘要> need=task-hub；`,
        '24h 内无人 [claimed] 时 Task Hub 会自动改派并发出叫醒通知，原席位无需补动作。',
      ].join('\n'),
      deploy_requirement: 'not_required',
      evidence: '- poll 原始输出（可截断）\n- 认领的 issue 编号或 no_open_task\n- 回执评论链接',
    });
    return {
      task_id: taskId,
      seat,
      title: `[TASK][${seat}] ${taskId} 每日开工与队列回执`,
      body,
      labels: ['dispatch', `seat:${seat}`],
      source: 'default_seat_plan',
    };
  });
  return {schema: PLAN_SCHEMA, date, cards};
}

// 计划文件只提供业务字段；seat 必须是在册席位，labels 一律重新计算。
export function normalizePlan(input, {date = asDate()} = {}) {
  if (!input || typeof input !== 'object') throw Error('dispatch_plan_invalid');
  const planDate = DATE_RE.test(String(input.date || '')) ? input.date : date;
  const cards = Array.isArray(input.cards) ? input.cards : [];
  if (!cards.length) throw Error('dispatch_plan_empty');
  return {
    schema: PLAN_SCHEMA,
    date: planDate,
    cards: cards.map((card, index) => {
      const seat = normalizeSeat(card?.seat) || null;
      if (!seat || !SEATS.includes(seat)) throw Error(`dispatch_plan_unknown_seat:${index}`);
      const taskId = String(card?.task_id || seatTaskId(seat, planDate)).trim();
      if (!taskId) throw Error(`dispatch_plan_task_id_missing:${index}`);
      const body = String(card?.body || '').trim()
        || renderTaskBody({
          task_id: taskId,
          decision_id: card?.decision_id || 'none',
          seat,
          goal: card?.goal || '',
          scope: card?.scope || '',
          forbidden: card?.forbidden || '',
          acceptance: card?.acceptance || '',
          deploy_requirement: card?.deploy_requirement || 'not_required',
          evidence: card?.evidence || '',
        });
      return {
        task_id: taskId,
        seat,
        title: String(card?.title || `[TASK][${seat}] ${taskId}`).trim(),
        body,
        labels: ['dispatch', `seat:${seat}`],
        source: 'plan_file',
      };
    }),
  };
}

export function readPlan({root = REPO_ROOT, planPath = null, date = asDate(), seats = DEFAULT_SEATS} = {}) {
  const rel = planPath || DEFAULT_PLAN_PATH;
  const abs = path.isAbsolute(rel) ? rel : path.join(root, rel);
  if (fs.existsSync(abs)) {
    return normalizePlan(JSON.parse(fs.readFileSync(abs, 'utf8')), {date});
  }
  return defaultSeatPlan({date, seats});
}

// dry-run 只做计划与去重判定；apply 才 POST Issue。同一 task_id 的开放卡视为已派发。
export async function dispatchPlan({plan, client = null, apply = false} = {}) {
  if (!plan || !Array.isArray(plan.cards)) throw Error('dispatch_plan_invalid');
  const existingIds = new Set();
  if (apply) {
    if (!client) throw Error('dispatch_client_required');
    const issues = await client.listOpenDispatches();
    for (const issue of issues) {
      const id = taskField(issue?.body, 'task_id');
      if (id) existingIds.add(id);
    }
  }
  const results = [];
  for (const card of plan.cards) {
    const base = {task_id: card.task_id, seat: card.seat, title: card.title, labels: card.labels, source: card.source};
    if (existingIds.has(card.task_id)) {
      results.push({...base, status: 'already_exists'});
      continue;
    }
    if (!apply) {
      results.push({...base, status: 'planned'});
      continue;
    }
    const created = await client.api('issues', {method: 'POST', body: {title: card.title, body: card.body, labels: card.labels}});
    existingIds.add(card.task_id);
    results.push({...base, status: 'created', number: created?.data?.number ?? null, url: created?.data?.html_url ?? null});
  }
  return {
    schema: 'ltzzz.dispatch.daily-result.v1',
    date: plan.date,
    dry_run: !apply,
    planned: results.filter((row) => row.status === 'planned').length,
    created: results.filter((row) => row.status === 'created').length,
    already_exists: results.filter((row) => row.status === 'already_exists').length,
    cards: results,
  };
}

const argOf = (argv, name, fallback = null) => {
  const index = argv.indexOf(name);
  return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback;
};

export async function main(argv = process.argv.slice(2), {env = process.env, root = REPO_ROOT} = {}) {
  try {
    const date = argOf(argv, '--date', asDate()) || asDate();
    if (!DATE_RE.test(date)) throw Error('invalid_dispatch_date');
    const seats = (argOf(argv, '--seats', DEFAULT_SEATS.join(',')) || '')
      .split(',').map((item) => item.trim()).filter(Boolean);
    const plan = readPlan({root, planPath: argOf(argv, '--plan'), date, seats: seats.length ? seats : DEFAULT_SEATS});
    const apply = argv.includes('--apply') && env.DRY_RUN !== '1';
    const token = env.LTZZZ_AGENT_TOKEN || env.GITHUB_TOKEN || '';
    if (apply && !token) throw Error('dispatch_token_required');
    const client = apply ? githubClient({token, repository: env.GITHUB_REPOSITORY || 'ltzyz2181-collab/ltzzz'}) : null;
    const result = await dispatchPlan({plan, client, apply});
    process.stdout.write(JSON.stringify(result, null, 1) + '\n');
    return 0;
  } catch (error) {
    process.stderr.write(`[dispatch-daily] ${String(error?.message || error).slice(0, 300)}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = await main();
}
