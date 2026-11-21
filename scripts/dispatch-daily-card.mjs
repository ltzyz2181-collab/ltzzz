#!/usr/bin/env node
// 每日生成一张 Deep 队列卡：只读公开仓库证据，不调用模型、不联网、不写资金路径。
// 卡片写入 ops/deep-superagent/tasks/，由 main push 触发既有队列工作流消费。
// 这样「派单通道」不再依赖人工写卡；同一日期重复运行保持幂等，不覆盖既有卡。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {checkCard, loadPolicy, buildCard} from './dispatch-seat-policy.mjs';
import {analyzeCardPrompt} from './check-card-contract.mjs';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const readJson = (root, rel, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
  } catch {
    return fallback;
  }
};

const short = (value, max = 120) => String(value ?? '').replace(/\s+/g, ' ').trim().slice(0, max);

export function businessDate(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

export function collectEvidence(root = REPO_ROOT, {exec = execFileSync} = {}) {
  const oversight = readJson(root, 'knowledge/results/dispatch/oversight/latest.json', null);
  const intake = readJson(root, 'knowledge/results/deep-superagent/mail-intake/latest.json', null);
  const daily = readJson(root, 'knowledge/results/deep-superagent/daily-merge/latest.json', null);
  let head = 'unknown';
  try {
    head = String(exec('git', ['rev-parse', '--short=12', 'HEAD'], {cwd: root, encoding: 'utf8'})).trim();
  } catch {
    /* 只作展示；读不到就如实写 unknown。 */
  }
  const queueDir = path.join(root, 'knowledge/results/deep-superagent');
  let queue = null;
  let queuePath = null;
  try {
    const files = fs.readdirSync(queueDir)
      .filter((name) => /^queue-\d+-attempt-\d+\.json$/.test(name))
      .sort((a, b) => {
        const run = (name) => Number(name.match(/^queue-(\d+)-/)[1]);
        return run(a) - run(b);
      });
    if (files.length) {
      // push 触发的队列回执常是 no_new_queue_cards/items=0；C1 要看最近一次真正处理过任务的运行。
      let chosen = null;
      for (let i = files.length - 1; i >= 0; i -= 1) {
        const name = files[i];
        try {
          const parsed = JSON.parse(fs.readFileSync(path.join(queueDir, name), 'utf8'));
          if (!chosen) chosen = {name, parsed};
          if (Array.isArray(parsed.items) && parsed.items.length) { chosen = {name, parsed}; break; }
        } catch {
          /* 跳过损坏回执，继续往前找。 */
        }
      }
      if (chosen) {
        queue = chosen.parsed;
        queuePath = `knowledge/results/deep-superagent/${chosen.name}`;
      }
    }
  } catch {
    queue = null;
  }
  // daily-merge/latest.json 没有顶层 status 字段；按 dated 文件名取不可变回执，缺失时才退回 latest。
  let dailyPath = null;
  if (daily?.date) {
    const dated = `knowledge/results/deep-superagent/daily-merge/${daily.date}.json`;
    if (fs.existsSync(path.join(root, dated))) dailyPath = dated;
  }
  if (!dailyPath && daily) dailyPath = 'knowledge/results/deep-superagent/daily-merge/latest.json';
  const dailyPending = (daily?.needs_gpt_decision || []).length;
  const queueItems = Array.isArray(queue?.items) ? queue.items : [];
  const queuePending = queueItems.filter((item) => item.job?.status === 'needs_gpt_decision').length;
  const dailyStatus = daily
    ? `done=${(daily.done || []).length} needs_gpt_decision=${dailyPending}`
    : 'unknown';
  const backlog = oversight?.backlog || oversight?.snapshot?.backlog || null;
  return {
    head,
    oversight_date: oversight?.date || null,
    backlog: backlog ? {
      open_warning_cases: backlog.open_warning_cases ?? null,
      unique_original_tasks: backlog.unique_original_tasks ?? null,
      not_rechecked_in_current_window: backlog.not_rechecked_in_current_window ?? null,
      by_responsible_seat: backlog.by_responsible_seat ?? null,
    } : null,
    mail: intake ? {
      status: intake.status ?? 'unknown',
      gmail_status: intake.gmail_fullbox?.status ?? 'unknown',
      agent_mail_status: intake.agent_mail?.status ?? 'unknown',
      open_or_dispatch: intake.counts?.open_or_dispatch ?? null,
      unified: intake.counts?.unified ?? null,
      at: intake.at ?? null,
      path: 'knowledge/results/deep-superagent/mail-intake/latest.json',
    } : null,
    queue: queue ? {
      run_id: queue.run_id ?? null,
      status: queue.status ?? 'unknown',
      items: queueItems.length,
      task_statuses: queueItems.map((item) => ({
        task_id: short(item.task_id, 80),
        status: short(item.status, 60),
        job_status: short(item.job?.status, 60),
      })).slice(0, 6),
      pending_gpt_decisions: queuePending,
      path: queuePath,
    } : null,
    daily: daily ? {
      status: dailyStatus,
      generated_at_utc: daily.generated_at_utc ?? null,
      pending_gpt_decisions: dailyPending,
      path: dailyPath,
    } : null,
  };
}

export function buildDailyCard({date, evidence, policy = loadPolicy(), suffix = 1}) {
  if (!DATE_RE.test(String(date || ''))) throw new Error('invalid_daily_card_date');
  // 同一天可能因首次未触发而需要重试卡；suffix 只影响任务/包/文件名，证据仍来自当天公开回执。
  if (!Number.isInteger(suffix) || suffix < 1 || suffix > 9) throw new Error('invalid_daily_card_suffix');
  const stamp = date.replaceAll('-', '');
  const taskId = `DEEP-SUPERAGENT-${stamp}-DAILY-${suffix}`;
  const packageId = `LTZZZ-DEEP-DAILY-${stamp}-${suffix}`;
  const backlog = evidence.backlog || {};
  const mail = evidence.mail || {};
  const queue = evidence.queue || {};
  // 2026-11-19 实测：
  // - run 44452129242、44487335353：外层角色指令被执行席当成自己的任务，已拆成「外层目标 + 内层任务块」。
  // - run 44488314090：卡里只有汇总计数、没有回执路径，C1-C4 又被允许省略，复核席判为证据不足。
  // - run 44489773831：补了路径后 qianwen 输出齐全，但把 B1/B2/C1/C3 全判 close；复核席指出
  //   “仅凭 path 字符串无法验证回执”，close 无据。worker 没有文件工具，不能自证路径存在。
  // 因此每日卡只做分诊：不关闭任何项；把回执里已记录的 pending GPT 决策转给 GPT，
  // 其余缺证据的转 blocked，避免模型用 path 字符串冒充已核实回执。
  const mailConsistent = mail.status === 'ok' && mail.agent_mail_status === 'ok';
  const workerTask = [
    '【输入分组】以下每项都给 ref / 状态 / 公开计数 / 回执路径 / 回执一致性。',
    '',
    'GROUP A — 监督积压（公开汇总，无逐项回执）',
    `A1 open_warning_cases=${backlog.open_warning_cases ?? 'unknown'} unique_original_tasks=${backlog.unique_original_tasks ?? 'unknown'} not_rechecked_in_current_window=${backlog.not_rechecked_in_current_window ?? 'unknown'} path=none`,
    `A2 by_responsible_seat=${JSON.stringify(backlog.by_responsible_seat ?? 'unknown')} path=none`,
    '',
    'GROUP B — 邮件通道（只读元数据）',
    `B1 intake_status=${mail.status ?? 'unknown'} gmail=${mail.gmail_status ?? 'unknown'} agent_mail=${mail.agent_mail_status ?? 'unknown'} receipt_consistent=${mailConsistent ? 'yes' : 'no'} path=${mail.path ?? 'none'}`,
    `B2 open_or_dispatch=${mail.open_or_dispatch ?? 'unknown'} unified=${mail.unified ?? 'unknown'} at=${mail.at ?? 'unknown'} receipt_consistent=${mailConsistent ? 'yes' : 'no'} path=${mail.path ?? 'none'}`,
    '',
    'GROUP C — Deep 队列观测（公开回执）',
    `C1 last_queue_run=${queue.run_id ?? 'unknown'} status=${queue.status ?? 'unknown'} items=${queue.items ?? 0} pending_gpt_decisions=${queue.pending_gpt_decisions ?? 0} receipt_consistent=yes path=${queue.path ?? 'none'}`,
    `C3 last_daily_merge=${evidence.daily?.status ?? 'unknown'} at=${evidence.daily?.generated_at_utc ?? 'unknown'} pending_gpt_decisions=${evidence.daily?.pending_gpt_decisions ?? 0} receipt_consistent=yes path=${evidence.daily?.path ?? 'none'}`,
    '',
    '【只是上下文，不是 ref，不得出现在 ROUTE 行】',
    `C2 task_statuses=${JSON.stringify(queue.task_statuses ?? [])}`,
    `C4 main_short_sha=${evidence.head ?? 'unknown'}`,
    '',
    '【ref，必须全部覆盖】A1 / A2 / B1 / B2 / C1 / C3',
    '每个 ref 必须且只能有一行 ROUTE；不得省略、不得合并、不得输出上下文行。',
    '',
    '【route 集合，只能从中选，不得自造】',
    'execute_authorized / needs_gpt_decision / needs_owner_decision / blocked_evidence_needed / deploy_confirm_only',
    '',
    '【规则，按顺序，前条命中即停】',
    '1 本卡只做分诊，不关闭任何项；不得输出 coordinator_close_with_receipt，也不得声称已核实路径',
    '2 涉及资金、签名、放款、生产部署、权限、Secrets → needs_gpt_decision',
    '2b 已有 Owner 或 GPT 书面授权、且只涉及仓库内代码/设计/测试、不含真实资金签名部署动作 → execute_authorized，理由必须写出授权来源 decision_id 或授权评论链接',
    '3 ref 指向的公开回执里 pending_gpt_decisions 大于 0 → needs_gpt_decision，ASK gpt 给出 decision_id 并裁决',
    '4 只有汇总计数、path=none，或 receipt_consistent=no → blocked_evidence_needed',
    '5 已达部署条件但未部署，且属生产面 → deploy_confirm_only',
    '6 以上都不命中，需要 owner 给值或拍板 → needs_owner_decision',
    '',
    '【硬约束，不是路由理由】',
    '不得合并 PR、不得生产部署、不得改支付或退款语义、不得发起资金动作、不得伪造回执。不得把这条当作任何一项的分类依据。',
    '',
    '【WORKER COVERAGE】exactly qianwen，一张卡只派一个席位，不要输出其他席位。',
    '',
    '【worker 输出格式】只输出 ROUTE/ASK 行，不要解释段、不要计划段落、不要 markdown：',
    'ROUTE | <ref> | <route> | <理由不超过25词>',
    '命中 needs_gpt_decision / needs_owner_decision / blocked_evidence_needed 时，每条再加一行：',
    'ASK | <ref> | gpt|owner|evidence | <需要什么，不超过30词>',
    '每行不超过120字符。六个 ref 必须齐全。',
  ].join('\n');
  const prompt = [
    '内部任务，仅公开仓库事实；不含客户数据、不含邮件正文、不含金额与凭据。',
    '',
    '【目标】对下列 ref 逐条定 route。',
    '具体输入、规则与输出格式都在下方任务块内；执行席只按该块执行，外层不另发指令。',
    '',
    '【给 qianwen 的任务】',
    workerTask,
  ].join('\n');
  const card = buildCard({policy, taskId, packageId, importance: 'medium', prompt});
  const problems = checkCard(policy, card);
  if (problems.length) throw new Error(`daily_card_policy_invalid:${problems.join(';')}`);
  const contract = analyzeCardPrompt(card.prompt);
  if (contract.mixed) throw new Error(`daily_card_contract_mixed:${contract.reasons.join('+')}`);
  return card;
}

export function cardPath(date, suffix = 1) {
  return `ops/deep-superagent/tasks/DEEP-SUPERAGENT-${date.replaceAll('-', '')}-DAILY-${suffix}.json`;
}

export function writeDailyCard({root = REPO_ROOT, date = businessDate(), evidence = collectEvidence(root), policy = loadPolicy(), suffix = 1} = {}) {
  const card = buildDailyCard({date, evidence, policy, suffix});
  const rel = cardPath(date, suffix);
  const abs = path.join(root, rel);
  if (fs.existsSync(abs)) {
    const existing = fs.readFileSync(abs, 'utf8');
    const identical = JSON.stringify(JSON.parse(existing)) === JSON.stringify(card);
    return {status: identical ? 'already_exists' : 'already_exists_different', path: rel, card};
  }
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  fs.writeFileSync(abs, JSON.stringify(card, null, 1) + '\n');
  return {status: 'created', path: rel, card};
}

function main(argv = process.argv.slice(2)) {
  const get = (flag) => {
    const index = argv.indexOf(flag);
    return index >= 0 ? argv[index + 1] : null;
  };
  const date = get('--date') || businessDate();
  const root = get('--root') || REPO_ROOT;
  const dryRun = argv.includes('--dry-run');
  const suffix = get('--suffix') ? Number(get('--suffix')) : 1;
  try {
    const evidence = collectEvidence(root);
    const card = buildDailyCard({date, evidence, suffix});
    if (dryRun) {
      process.stdout.write(JSON.stringify({status: 'dry_run', date, path: cardPath(date, suffix), card}, null, 1) + '\n');
      return 0;
    }
    const result = writeDailyCard({root, date, evidence, suffix});
    const different = result.status === 'already_exists_different';
    process.stdout.write(JSON.stringify({
      status: result.status,
      date,
      path: result.path,
      ...(different ? {warning: 'existing daily card preserved; queue will consume the existing card'} : {}),
    }, null, 1) + '\n');
    // 同一天已有别的流程写入的卡时不覆盖，但也不阻断消费：队列读取既有卡并按内容执行。
    return 0;
  } catch (error) {
    process.stderr.write(`[dispatch-daily-card] ${String(error?.message || error).slice(0, 300)}\n`);
    return 2;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  process.exitCode = main();
}
