#!/usr/bin/env node
/**
 * LTZZZ 六 AI 每日自动化调度 Worker（v2：六通道每日任务详细规则）
 * ---------------------------------------------------------------
 * 入口：scheduled()  cron 触发器（见 wrangler.daily.toml 的 crons 数组，UTC）
 *      fetch()      手动 /health 与 /run?task=xxx 调试入口（不替代 cron）
 *
 * 【共同前提】六个通道每天开工前都先 scanRepo()“阅读一遍下载到仓库里的内容”：
 *   读取源 = knowledge/、articles/、protocol/ 等既有内容。
 *   边缘 Worker 无本地 FS：dry-run 时 scanRepo() 只返回文件清单占位（标注已阅读目录）；
 *   真实部署应改为列举 R2 绑定 LTZZZ_ARTIFACTS 前缀下的对象。
 *
 * 六个通道每日任务（TASK_TABLE）：
 *   gpt-daily      GPT       ①当日规划+派1条任务到AI队列 ②提炼昨日记忆 ③写“怜悯之心”一段
 *                            （朝“知其固然如此、知其本不该如此”） ④≥1条 polish_proposal
 *   doubao-daily   豆包      阅读仓库+装备论（魄/识神/三维装备肉身）学习笔记；
 *                            每日≥1条 polish_proposal；每日1条视频脚本（台账+全文）。
 *   xia-daily      XAI/Grok  阅读仓库+装备论对心理问题(焦虑/抑郁/双相)的实际作用，每日列1条；
 *                            对 app.html 与 Web3(wallet-lab.html/contracts/) 每日≥1条 polish_proposal。
 *   claude-daily   Claude    阅读仓库+每日一段≥50字小说片段，逐日连续积累（备写网文）。
 *   deepseek-daily DeepSeek  阅读仓库+对照“中华传统文化”与“装备论”异同，每日1条。
 *   copilot-daily  Microsoft Copilot 阅读仓库+对照“西方文化”与“装备论”异同，每日1条。
 *
 * 落盘约定：各通道每日产出 = knowledge/daily/<channel>/YYYY-MM-DD.md
 *   （channel ∈ gpt/doubao/xia/claude/deepseek/copilot）。
 *   polish 统一写进该文件内的「## polish」小节：
 *     - status: proposed（仅提出改法）/ applied（已真实落地）
 *     - file：被改文件路径；before→after：改前→改后；commit：仅 applied 时填提交位置。
 *
 * 【诚信红线 —— polish 必须诚实分两层】
 *   - polish_proposal：Worker 只“提出修改”（文件路径/位置/改前→改后），默认 status=proposed。
 *   - polish_applied ：必须真实存在 diff 后才能置 status=applied 并填 commit。
 *   - Cloudflare 边缘 Worker 无本地文件系统写权限，真实落盘/改码靠调度外执行
 *     （人工或执行器按提案改并回写 commit 位置）。Worker 内绝不伪造“已修改”。
 *   - 没有真实 diff，就只能记 proposal 并标 status=proposed，绝不虚报为 applied。
 *
 * 硬约束（与 protocol/security-redlines.md、finance/budgets.md 对齐，不改其逻辑本身）：
 *   - 无真实 Key 一律 dry-run 占位，日志 dry_run=true；绝不伪造 Key。
 *   - 预算守卫 checkBudget：豆包/DeepSeek 各 20 RMB；80% 预警、100% 停 → waiting_approval。
 *   - 密钥只走 Cloudflare Secret（env），不入仓库/前端/日志（日志一律 maskSecret）。
 *
 * 状态：调度器“可运行 + 占位”。真实上游调用处均标注【等待人工凭证】。
 */

"use strict";

/* ================================================================
 * 0. 工具：日期（UTC+8）、日志掩码、落盘抽象、仓库阅读 scanRepo()
 * ================================================================ */

/** 取 UTC+8（Asia/Shanghai）下的今天与昨天，返回 { today, yesterday, compact, iso } */
function localDates(env) {
  const offsetHours = Number(env && env.TZ_OFFSET_HOURS ? env.TZ_OFFSET_HOURS : 8);
  const now = new Date(Date.now() + offsetHours * 3600 * 1000);
  const pad = (n) => String(n).padStart(2, "0");
  const y = now.getUTCFullYear();
  const today = `${y}-${pad(now.getUTCMonth() + 1)}-${pad(now.getUTCDate())}`;
  const yest = new Date(now.getTime() - 24 * 3600 * 1000);
  const yesterday = `${yest.getUTCFullYear()}-${pad(yest.getUTCMonth() + 1)}-${pad(yest.getUTCDate())}`;
  const compact = today.replace(/-/g, "");
  return { today, yesterday, compact, iso: now.toISOString() };
}

/** 日志：dry_run=true 必现；密钥一律掩码（仅保留首尾各 3 位），绝不明文 */
function logDry(marker, obj) {
  const line = { at: new Date().toISOString(), dry_run: true, marker, ...obj };
  console.log(JSON.stringify(line));
}
function maskSecret(v) {
  if (!v || typeof v !== "string") return "<absent>";
  if (v.length <= 6) return "***";
  return `${v.slice(0, 3)}***${v.slice(-3)}`;
}

/**
 * 落盘抽象：边缘 Worker 无本地 FS。
 *  - 真实部署：写入 R2 绑定 LTZZZ_ARTIFACTS（key = 仓库相对路径）。
 *  - dry-run / 无 R2：仅打印落盘计划（path + 字节数），不真正上传。
 * 返回 { path, bytes, sink }。
 */
async function writeArtifact(path, content, env, ctx) {
  const bytes = new TextEncoder().encode(content).byteLength;
  if (env && env.LTZZZ_ARTIFACTS && typeof env.LTZZZ_ARTIFACTS.put === "function") {
    if (ctx && typeof ctx.waitUntil === "function") {
      ctx.waitUntil(env.LTZZZ_ARTIFACTS.put(path, content, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } }));
    } else {
      await env.LTZZZ_ARTIFACTS.put(path, content, { httpMetadata: { contentType: "text/markdown; charset=utf-8" } });
    }
    logDry("artifact.written", { sink: "r2", path, bytes });
    return { path, bytes, sink: "r2" };
  }
  // dry-run 占位：只记录，不写真实对象
  logDry("artifact.dryrun", { sink: "log-only", path, bytes });
  return { path, bytes, sink: "log-only" };
}

/**
 * scanRepo() —— 共同前提：“每天先阅读一遍下载到仓库里的内容”。
 * 读取源 = knowledge/、articles/、protocol/ 等既有内容。
 * 边缘 Worker 无 FS：dry-run 时返回文件清单占位（列出已知源目录 + 代表文件）；
 * 真实部署应改为列举 R2 绑定 LTZZZ_ARTIFACTS 前缀下的对象，作为“今日已阅读”清单。
 * 返回 { sources:[...], manifest:[...], dry_run, note }
 */
function scanRepo() {
  const sources = [
    "knowledge/", "knowledge/ai-chats/", "knowledge/memory-review/",
    "articles/", "protocol/",
  ];
  // dry-run 占位清单（真实部署由 R2 list 返回）
  const manifest = [
    "knowledge/AI-ARCHIVE-INDEX.md",
    "knowledge/ai-chats/GPT/index.md",
    "knowledge/ai-chats/Doubao/index.md",
    "knowledge/ai-chats/DeepSeek/index.md",
    "knowledge/ai-chats/XIA/2026-09-chat-index.md",
    "knowledge/ai-chats/Microsoft/index.md",
    "articles/xingmeng-changyu.html",
    "articles/meng-po.html",
    "articles/qingxi-bunengkong.html",
    "protocol/ltzzz-daily-automation.md",
    "protocol/security-redlines.md",
    "protocol/video-pipeline.md",
  ];
  return {
    sources,
    manifest,
    dry_run: true,
    note: "dry-run 占位文件清单；真实部署应列举 R2(LTZZZ_ARTIFACTS) 前缀对象作为“今日已阅读”。",
  };
}

/** 把 scanRepo() 渲染成 Markdown「## 今日已阅读」小节 */
function renderScanSection(scan) {
  const dirLines = scan.sources.map((d) => `  - ${d}/`).join("\n");
  const fileLines = scan.manifest.map((f) => `  - ${f}`).join("\n");
  return (
    `## 今日已阅读（scanRepo）\n\n` +
    `> 开工前先通读仓库既有内容。dry_run=${scan.dry_run}　${scan.note}\n\n` +
    `**阅读目录**\n${dirLines}\n\n**文件清单（占位）**\n${fileLines}\n`
  );
}

/* ================================================================
 * 1. 预算守卫（代码强制，不可被上游绕过）—— 逻辑保持不变
 *    豆包/DeepSeek 各 20 RMB；80% 预警；100% 停止 → waiting_approval
 * ================================================================ */

const DEFAULT_BUDGET = { doubao: 20, deepseek: 20 }; // RMB，对齐 finance/budgets.md

/**
 * checkBudget(channel, env)
 * channel: 'doubao' | 'deepseek'（其余通道无预算上限，返回 ok）
 * 返回 { allowed, status, pct, limit, spent, remaining, note }
 *   status: 'ok' | 'warning' | 'blocked_waiting_approval'
 * 注意：本环境无真实计费回写，spent 默认读 env（演示值），真实值应来自 KV/R2 账本。
 */
function checkBudget(channel, env) {
  const limit = Number(env && env[`${channel.toUpperCase()}_BUDGET_LIMIT`] || DEFAULT_BUDGET[channel]);
  const spent = Number(env && env[`${channel.toUpperCase()}_BUDGET_SPENT`] || 0);
  const remaining = Math.max(0, limit - spent);
  const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;

  if (pct >= 100) {
    return {
      allowed: false,
      status: "blocked_waiting_approval",
      channel,
      pct, limit, spent, remaining,
      note: "预算已达 100%，自动停止；等待人工凭证/追加授权（waiting_approval）",
    };
  }
  if (pct >= 80) {
    logDry("budget.warning", { channel, pct, limit, spent, remaining, note: "已达 80% 预警线" });
    return { allowed: true, status: "warning", channel, pct, limit, spent, remaining };
  }
  return { allowed: true, status: "ok", channel, pct, limit, spent, remaining };
}

/** 统一“带预算守卫的 AI 调用占位”：无 Key → dry-run；有 Key 但预算满 → waiting_approval */
async function callAI({ channel, env, ctx, taskName, prompt, expect }) {
  const budget = checkBudget(channel, env);
  if (!budget.allowed) {
    logDry("ai.blocked", { taskName, channel, status: budget.status, pct: budget.pct });
    return { ok: false, status: "waiting_approval", budget, dry_run: true };
  }
  const keyName = `${channel.toUpperCase()}_API_KEY`;
  const hasKey = !!(env && env[keyName]);
  if (!hasKey) {
    // 【等待人工凭证】：不伪造 Key，直接占位
    logDry("ai.dryrun", { taskName, channel, expected: expect, key: keyName, keyMask: maskSecret(undefined) });
    return {
      ok: true,
      status: "dry_run",
      dry_run: true,
      waiting_credential: keyName,
      budget,
      placeholder: `[dry-run 占位输出] ${taskName} 基于 prompt 生成的 ${expect}（无真实 Key，等待人工凭证 ${keyName}）`,
    };
  }
  // 有 Key：真实调用在此接入对应上游（GPT/DeepSeek/Claude/豆包/Copilot/Grok）。
  // 当前环境不预置任何真实 Key，因此正常不会走到这里；走到即视为已授权的真实调用。
  logDry("ai.live-skeleton", { taskName, channel, keyMask: maskSecret(env[keyName]), note: "真实上游 fetch 待接入" });
  return { ok: true, status: "live-skeleton", dry_run: false, budget };
}

/* ================================================================
 * 1.5 polish 提案（诚信双层：proposal vs applied）
 * ================================================================ */

/**
 * makePolishProposal({ file, before, after })
 * 只“提出修改”，永远先落 status=proposed。Worker 无 FS 写权限，绝不自吹已改。
 * commit 仅在外部执行器真实改完并回写后才由 markPolishApplied() 填入。
 */
function makePolishProposal({ file, before, after }) {
  return {
    status: "proposed", // 除非外部真实落地，否则保持 proposed，禁止虚报
    file,
    before: String(before),
    after: String(after),
    commit: null, // applied 才填（如 "commit abc1234" 或 "patch#N @ path:行"）
  };
}

/**
 * markPolishApplied(proposal, commit)
 * 仅当外部执行器已真实落地 diff 并回写 commit 位置时调用。
 * 本 Worker 默认拿不到真实 commit，因此日常产物保持 proposed。
 */
function markPolishApplied(proposal, commit) {
  return { ...proposal, status: "applied", commit: commit || "(commit 位置待外部回写)" };
}

/** 把 polish 提案列表渲染成 Markdown「## polish」小节 */
function renderPolishSection(proposals) {
  const lines = proposals.map((p, i) => {
    const commit = p.status === "applied" ? (p.commit || "(待回写)") : "—（未落地，不填）";
    return (
      `### polish #${i + 1}\n\n` +
      `- status: ${p.status}\n` +
      `- file: ${p.file}\n` +
      `- before → after:\n\n  > before: ${p.before.replace(/\n/g, "\n  > ")}\n\n  > after:  ${p.after.replace(/\n/g, "\n  > ")}\n\n` +
      `- commit: ${commit}\n`
    );
  });
  const note =
    `> 诚信约定：Worker 在 Cloudflare 内无本地文件系统写权限。下列条目默认 status=proposed；\n` +
    `> 只有外部执行器（人工/执行器）真实改完 diff 并回写 commit 位置，才会改为 applied 并填 commit。\n` +
    `> 无真实 diff 一律保持 proposed，绝不虚报已修改。\n`;
  return `## polish\n\n${note}\n${lines.join("\n")}`;
}

/** 各通道每日产物落盘路径：knowledge/daily/<channel>/YYYY-MM-DD.md */
function dailyPath(channel, today) {
  return `knowledge/daily/${channel}/${today}.md`;
}

/** 内容 ID：CONTENT-YYYYMMDD-NNN（对齐 video-pipeline.md，供豆包视频脚本台账用） */
function makeContentId(compact, seq) {
  return `CONTENT-${compact}-${String(seq).padStart(3, "0")}`;
}

/* ================================================================
 * 2. 六个通道每日任务
 * ================================================================ */

/* ---- 任务 1：GPT 每日 ------------------------------------------
 * ①当日规划+派1条任务到AI队列 ②提炼昨日记忆 ③写“怜悯之心”一段
 * ④≥1条 polish_proposal
 * ---------------------------------------------------------------- */
async function taskGptDaily(env, ctx) {
  const { today, yesterday, compact } = localDates(env);
  const scan = scanRepo();

  // ① 当日规划 + 派单
  const ai = await callAI({
    channel: "gpt", env, ctx, taskName: "gpt-daily",
    prompt: `输出 ${today} 的当日规划：3-5 个方向 + 当日任务清单；并部署 1 条具体任务给 AI 队列。`,
    expect: "当日规划 + 1 条可执行任务",
  });
  const task_id = `TASK-${compact}-001`;
  const executableTask = {
    task_id,
    目标: "把当日 scanRepo 读到的仓库高价值片段，整理成 1 条可对外复用的知识点卡片",
    验收标准: "含 1 个核心论点、引用 1 个仓库内来源路径、不泄露任何密钥",
    截止: `${today} 23:00 (UTC+8)`,
  };

  // ② 昨日记忆：读取 knowledge/daily/gpt/昨日 文件，提炼进今日（占位）
  const yestMemPath = `knowledge/daily/gpt/${yesterday}.md`;
  const memory = await callAI({
    channel: "gpt", env, ctx, taskName: "gpt-daily.recall",
    prompt: `读取 ${yestMemPath}，把昨日记忆要点提炼成 3 条“今日应延续”的线索。`,
    expect: "昨日记忆提炼",
  });

  // ③ 怜悯之心：朝“知其固然如此、知其本不该如此”的真正理解
  const mercy = await callAI({
    channel: "gpt", env, ctx, taskName: "gpt-daily.mercy",
    prompt: `写一段“怜悯之心”的话，主题朝向：知其固然如此、知其本不该如此，据此产生真正的理解。`,
    expect: "怜悯之心一段",
  });

  // ④ polish：每天至少一条提案（仅提出，不落地）
  const polish = [
    makePolishProposal({
      file: "knowledge/memory-review/README.md",
      before: "（占位）在记忆复盘索引里补一行：今日已由 gpt-daily 跑通。",
      after: "- [ ] gpt-daily ${today}：当日规划+昨日记忆提炼+怜悯之心，见 knowledge/daily/gpt/${today}.md",
    }),
  ];

  const body =
    `# GPT 每日 · ${today}\n\n` +
    `> dry_run=${ai.dry_run}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 当日规划 + 派单\n\n${ai.placeholder || "（真实规划输出待接入 OPENAI_API_KEY）"}\n\n` +
    `**已部署到 AI 队列的具体任务**\n\n` +
    "```json\n" + JSON.stringify(executableTask, null, 2) + "\n```\n\n" +
    `## 昨日记忆提炼（来源：${yestMemPath}）\n\n` +
    (memory.placeholder || "（占位：昨日文件可能尚未存在；真实运行读取该文件提炼 3 条延续线索）") + "\n\n" +
    `## 怜悯之心\n\n> 主题：知其固然如此，知其本不该如此 —— 由此生出真正的理解，而非评判。\n\n` +
    (mercy.placeholder || "（占位，待接入凭证后生成当日一段）") + "\n\n" +
    renderPolishSection(polish) + "\n";

  const path = dailyPath("gpt", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.gpt-daily", { today, path, task_id, polish_count: polish.length, dry_run: ai.dry_run });
  return { task: "gpt-daily", ok: true, path, task_id, polish: polish.map((p) => ({ file: p.file, status: p.status })), dry_run: true };
}

/* ---- 任务 2：豆包 每日 ------------------------------------------
 * 阅读仓库 + 装备论学习笔记；每日≥1条 polish_proposal；每日1条视频脚本（台账+全文）
 * ---------------------------------------------------------------- */
async function taskDoubaoDaily(env, ctx) {
  const { today, compact } = localDates(env);
  const scan = scanRepo();

  // 装备论学习笔记（魄/识神/三维装备肉身）
  const note = await callAI({
    channel: "doubao", env, ctx, taskName: "doubao-daily.note",
    prompt: `阅读仓库后，围绕装备论（身体=三维装备、魄含尸狗、识神/元神、习气、网状因果）写一篇学习笔记。`,
    expect: "装备论学习笔记",
  });

  // 每日 1 条视频脚本（为以后发视频挣钱做准备）
  const script = await callAI({
    channel: "doubao", env, ctx, taskName: "doubao-daily.script",
    prompt: `基于今日装备论学习笔记，产出 1 条 ≤60 秒、9:16 的中文口播视频脚本（为以后发视频挣钱做准备）。`,
    expect: "视频脚本",
  });
  const seq = Number(env && env.TODAY_CONTENT_SEQ || 1);
  const contentId = makeContentId(compact, seq);

  // 台账登记：knowledge/content-registry.md 引用
  const registryPath = "knowledge/content-registry.md";
  const registryRef = `knowledge/daily/doubao/${today}.md#视频脚本`;
  const registryRow =
    `| ${contentId} | 装备论学习笔记衍生 | 待补主题 | ${registryRef} | 已起草 | 待制作 | 未发布(私密待授权) | -\n`;
  await writeArtifact(registryPath, registryRow, env, ctx);

  // polish：每天至少一次整理（≥一个字位置变化的提案）
  const polish = [
    makePolishProposal({
      file: "knowledge/content-registry.md",
      before: `（占位）在台账新增一行 ${contentId} 指向今日脚本全文。`,
      after: `| ${contentId} | 装备论 | <主题> | knowledge/daily/doubao/${today}.md#视频脚本 | 已起草 | 待制作 | 未发布 | - |`,
    }),
  ];

  const body =
    `# 豆包 每日 · ${today}\n\n` +
    `> dry_run=${note.dry_run}　预算：豆包通道 checkBudget 守卫　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 装备论学习笔记\n\n` +
    `> 术语体系：身体=三维装备；魄（含尸狗）；识神/元神；习气；网状因果。\n\n` +
    (note.placeholder || "（占位，待接入 DOUBAO_API_KEY）") + "\n\n" +
    `## 视频脚本\n\n` +
    `> 内容 ID：${contentId}　台账：${registryPath}（引用本节）　全文存档于本文件\n\n` +
    (script.placeholder || "（占位：≤60 秒、9:16 中文口播脚本，待接入凭证）") + "\n\n" +
    renderPolishSection(polish) + "\n";

  const path = dailyPath("doubao", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.doubao-daily", { today, path, contentId, registryPath, polish_count: polish.length, dry_run: true, budget: note.budget });
  return { task: "doubao-daily", ok: true, path, contentId, registryPath, budget: note.budget, dry_run: true };
}

/* ---- 任务 3：XAI/Grok 每日 --------------------------------------
 * 阅读仓库 + 装备论对心理问题(焦虑/抑郁/双相)的实际作用，每日列1条；
 * 对 app.html 与 Web3(wallet-lab.html/contracts/) 每日≥1条 polish_proposal
 * ---------------------------------------------------------------- */
async function taskXiaDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = scanRepo();

  const mental = await callAI({
    channel: "xia", env, ctx, taskName: "xia-daily.mental",
    prompt: `阅读仓库后，用装备论（三维装备/魄含尸狗/识神元神/习气/网状因果）解释一条人类心理健康问题（焦虑/抑郁/双相等）的实际作用机制。`,
    expect: "装备论对心理健康的一条作用说明",
  });

  // 对 APP 代码(app.html)与 Web3 代码(wallet-lab.html/contracts/) 打磨提案
  const polish = [
    makePolishProposal({
      file: "app.html",
      before: "（占位）定位一处可微调的文案/间距，例如标题留白。",
      after: "将某标题 margin-top 由 16px 调整为 20px（仅示例，真实 diff 待外部执行器确认后落地）。",
    }),
    makePolishProposal({
      file: "wallet-lab.html",
      before: "（占位）在钱包 lab 页面补一行加载态提示文案。",
      after: "<span class=\"hint\">正在加载钱包余额…</span>（仅示例，真实 diff 待外部执行器确认后落地）。",
    }),
  ];

  const body =
    `# XAI/Grok 每日 · ${today}\n\n` +
    `> dry_run=${mental.dry_run}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 装备论 × 心理健康（每日 1 条）\n\n` +
    `> 角度：焦虑 / 抑郁 / 双相 等，用三维装备、魄（尸狗）、识神/元神、习气、网状因果解释。\n\n` +
    (mental.placeholder || "（占位，待接入 XIA_GROK_API_KEY）") + "\n\n" +
    renderPolishSection(polish) + "\n";

  const path = dailyPath("xia", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.xia-daily", { today, path, polish_count: polish.length, dry_run: true });
  return { task: "xia-daily", ok: true, path, dry_run: true };
}

/* ---- 任务 4：Claude 每日 ----------------------------------------
 * 阅读仓库 + 每日一段≥50字小说片段，逐日连续积累（备写网文）
 * ---------------------------------------------------------------- */
async function taskClaudeDaily(env, ctx) {
  const { today, yesterday } = localDates(env);
  const scan = scanRepo();

  const fiction = await callAI({
    channel: "claude", env, ctx, taskName: "claude-daily.fiction",
    prompt: `写一段不少于 50 字的小说片段，与前一日片段连续（来源：knowledge/daily/claude/${yesterday}.md），逐日连载积累，为以后写网络小说做准备。`,
    expect: "≥50字连续小说片段",
  });

  const body =
    `# Claude 每日 · ${today}\n\n` +
    `> dry_run=${fiction.dry_run}　连载片段（续自 ${yesterday}）　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 小说连载片段（≥50 字，逐日积累）\n\n` +
    (fiction.placeholder || "（占位，待接入 ANTHROPIC_API_KEY；真实输出需与前一日片段首尾衔接）") + "\n";

  const path = dailyPath("claude", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.claude-daily", { today, path, dry_run: true });
  return { task: "claude-daily", ok: true, path, dry_run: true };
}

/* ---- 任务 5：DeepSeek 每日 --------------------------------------
 * 阅读仓库 + 对照“中华传统文化”与“装备论”异同，每日1条
 * ---------------------------------------------------------------- */
async function taskDeepseekDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = scanRepo();

  const compare = await callAI({
    channel: "deepseek", env, ctx, taskName: "deepseek-daily.compare",
    prompt: `阅读仓库后，对照“中华传统文化”（如道家/佛家/中医等）与“装备论”（三维装备、魄含尸狗、识神/元神、习气、网状因果）的相同点与不同点，写 1 条对照记录。`,
    expect: "中华传统文化 × 装备论 对照记录",
  });

  const body =
    `# DeepSeek 每日 · ${today}\n\n` +
    `> dry_run=${compare.dry_run}　预算：DeepSeek 通道 checkBudget 守卫　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 中华传统文化 × 装备论（每日 1 条对照）\n\n` +
    `**相同点**\n- （占位，待接入 DEEPSEEK_API_KEY）\n\n` +
    `**不同点**\n- （占位，待接入凭证）\n\n` +
    `**原文对照**\n\n${compare.placeholder || "（占位输出）"}\n`;

  const path = dailyPath("deepseek", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.deepseek-daily", { today, path, dry_run: true, budget: compare.budget });
  return { task: "deepseek-daily", ok: true, path, budget: compare.budget, dry_run: true };
}

/* ---- 任务 6：Microsoft Copilot 每日 ------------------------------
 * 阅读仓库 + 对照“西方文化”与“装备论”异同，每日1条
 * ---------------------------------------------------------------- */
async function taskCopilotDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = scanRepo();

  const compare = await callAI({
    channel: "copilot", env, ctx, taskName: "copilot-daily.compare",
    prompt: `阅读仓库后，对照“西方文化”（如身心二元、个体主义、现代心理/医学等）与“装备论”（三维装备、魄含尸狗、识神/元神、习气、网状因果）的相同点与不同点，写 1 条对照记录。`,
    expect: "西方文化 × 装备论 对照记录",
  });

  const body =
    `# Microsoft Copilot 每日 · ${today}\n\n` +
    `> dry_run=${compare.dry_run}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 西方文化 × 装备论（每日 1 条对照）\n\n` +
    `**相同点**\n- （占位，待接入 COPILOT_TOKEN）\n\n` +
    `**不同点**\n- （占位，待接入凭证）\n\n` +
    `**原文对照**\n\n${compare.placeholder || "（占位输出）"}\n`;

  const path = dailyPath("copilot", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.copilot-daily", { today, path, dry_run: true });
  return { task: "copilot-daily", ok: true, path, dry_run: true };
}

/* ---- 任务表 --------------------------------------------------- */
const TASK_TABLE = {
  "gpt-daily":      { ai: "GPT",              fn: taskGptDaily,      retry: 2, cronCst: "08:00" },
  "claude-daily":   { ai: "Claude",           fn: taskClaudeDaily,   retry: 2, cronCst: "09:30" },
  "doubao-daily":   { ai: "豆包",             fn: taskDoubaoDaily,   retry: 1, cronCst: "11:00" },
  "deepseek-daily": { ai: "DeepSeek",         fn: taskDeepseekDaily, retry: 2, cronCst: "06:30" },
  "copilot-daily":  { ai: "Microsoft Copilot",fn: taskCopilotDaily,  retry: 2, cronCst: "14:00" },
  "xia-daily":      { ai: "XAI/Grok",         fn: taskXiaDaily,      retry: 2, cronCst: "16:00" },
};

/** 失败重试：指数退避最多 retry 次；全部失败记录 waiting_manual，不抛崩调度 */
async function dispatchTask(key, env, ctx) {
  const entry = TASK_TABLE[key];
  if (!entry) {
    logDry("dispatch.unknown", { key });
    return { ok: false, error: `unknown task: ${key}` };
  }
  const maxRetry = entry.retry;
  let lastErr = null;
  for (let attempt = 0; attempt <= maxRetry; attempt++) {
    try {
      const result = await entry.fn(env, ctx);
      logDry("dispatch.ok", { key, attempt: attempt + 1, dry_run: true });
      return result;
    } catch (e) {
      lastErr = e;
      logDry("dispatch.retry", { key, attempt: attempt + 1, maxRetry: maxRetry + 1, error: String(e && e.message || e) });
      if (attempt < maxRetry) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  logDry("dispatch.failed_waiting_manual", { key, error: String(lastErr && lastErr.message || lastErr) });
  return { ok: false, status: "waiting_manual", error: String(lastErr && lastErr.message || lastErr) };
}

/* ================================================================
 * 3. 入口：scheduled() + fetch()
 * ================================================================ */
export default {
  /**
   * Cloudflare Cron 触发器入口。
   * event.cron = 本次命中的 cron 表达式（UTC）。
   * 通过 CRON_MAP 把 cron 字符串映射到任务 key（与 wrangler.daily.toml 的 crons 一致）。
   */
  async scheduled(event, env, ctx) {
    const CRON_MAP = {
      "30 22 * * *": "deepseek-daily",     // 22:30 UTC = 次日 06:30 UTC+8
      "0 0 * * *":   "gpt-daily",          // 00:00 UTC = 08:00 UTC+8
      "30 1 * * *":  "claude-daily",       // 01:30 UTC = 09:30 UTC+8
      "0 3 * * *":   "doubao-daily",       // 03:00 UTC = 11:00 UTC+8
      "0 6 * * *":   "copilot-daily",      // 06:00 UTC = 14:00 UTC+8
      "0 8 * * *":   "xia-daily",          // 08:00 UTC = 16:00 UTC+8
    };
    const key = CRON_MAP[event.cron] || "gpt-daily"; // 兜底跑一次 GPT 每日
    logDry("scheduled.trigger", { cron: event.cron, mapped: key, dry_run: true });
    const result = await dispatchTask(key, env, ctx);
    return result;
  },

  /** 调试/手动入口：GET /health；POST /run?task=xxx（生产用 cron，勿依赖此接口） */
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({
        ok: true, service: "ltzzz-daily-automation", dry_run: true,
        tasks: Object.keys(TASK_TABLE),
        budgets: {
          doubao: checkBudget("doubao", env),
          deepseek: checkBudget("deepseek", env),
        },
      }), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    if (url.pathname === "/run") {
      // 简单令牌保护；未配置 LTZZZ_AGENT_TOKEN 时仅允许 dry-run 手动调试
      const token = request.headers.get("Authorization") || "";
      if (env.LTZZZ_AGENT_TOKEN && token !== `Bearer ${env.LTZZZ_AGENT_TOKEN}`) {
        return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
      }
      const key = url.searchParams.get("task") || "gpt-daily";
      const result = await dispatchTask(key, env, ctx);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 });
  },
};
