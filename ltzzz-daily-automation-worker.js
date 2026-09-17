#!/usr/bin/env node
/**
 * LTZZZ 六 AI 每日自动化调度 Worker
 * ---------------------------------------------------------------
 * 入口：scheduled()  cron 触发器（见 wrangler.daily.toml 的 crons 数组）
 *      fetch()      手动 /health 与 /run?task=xxx 调试入口（不替代 cron）
 *
 * 六个 AI 每日任务（任务表 TASK_TABLE + dispatchTask 分派）：
 *   1. gpt-daily-plan     GPT       当日规划（选题/任务清单）+ 下发 1 条可执行任务
 *   2. deepseek-clean     DeepSeek  清洗前一日 knowledge/ai-chats/ 新增记录 → 清洗稿
 *   3. claude-review      Claude    对当日清洗稿做批判性复盘 → review 笔记
 *   4. doubao-video       豆包      每日 1 条视频（video-pipeline.md 管线）+ 登记台账
 *   5. copilot-western    Microsoft Copilot  西方视角对照笔记
 *   6. xia-altview        XIA(Grok)  另类视角/大胆预测短评
 *
 * 硬约束（与 protocol/security-redlines.md、finance/budgets.md 对齐）：
 *   - 无真实 Key 时一律走 dry-run 占位分支，日志标记 dry_run=true；绝不伪造 Key。
 *   - 预算守卫 BudgetGuard：豆包/DeepSeek 各 20 RMB；80% 预警、100% 停止并返回 waiting_approval。
 *   - 密钥只走 Cloudflare Secret（env），不入仓库/前端/日志（日志一律掩码）。
 *   - 资金类一律 dry-run/模拟，不做真实扣款。
 *
 * 状态：调度器“可运行 + 占位”。真实上游调用处均标注【等待人工凭证】。
 */

"use strict";

/* ================================================================
 * 0. 工具：日期（UTC+8）、日志掩码、落盘抽象
 * ================================================================ */

/** 取 UTC+8（Asia/Shanghai）下的今天与昨天，返回 { today:'YYYY-MM-DD', yesterday:'YYYY-MM-DD', compact:'YYYYMMDD' } */
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

/* ================================================================
 * 1. 预算守卫（代码强制，不可被上游绕过）
 *    豆包/DeepSeek 各 20 RMB；80% 预警；100% 停止 → waiting_approval
 * ================================================================ */

const DEFAULT_BUDGET = { doubao: 20, deepseek: 20 }; // RMB，对齐 finance/budgets.md

/**
 * checkBudget(channel, env)
 * channel: 'doubao' | 'deepseek'
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
 * 2. 任务表（六个 AI 每日任务规范）+ 分派
 * ================================================================ */

/** 内容 ID：CONTENT-YYYYMMDD-NNN（对齐 video-pipeline.md） */
function makeContentId(compact, seq) {
  return `CONTENT-${compact}-${String(seq).padStart(3, "0")}`;
}

/* ---- 任务 1：GPT 当日规划 + 下发可执行任务 --------------------- */
async function taskGptDailyPlan(env, ctx) {
  const { today } = localDates(env);
  const ai = await callAI({
    channel: "gpt", env, ctx, taskName: "gpt-daily-plan",
    prompt: `输出 ${today} 的当日规划：3-5 个选题方向 + 当日任务清单草稿。`,
    expect: "当日规划草稿",
  });

  const planPath = `knowledge/daily-plan/${today}.md`;
  const task_id = `TASK-${today.replace(/-/g, "")}-001`;
  const executableTask = {
    task_id,
    目标: "从当日 ai-chats 高价值片段产出 1 条脱敏视频脚本候选",
    验收标准: "脱敏完成、含 1 个核心论点、口播稿 ≥150 字、登记 CONTENT-ID",
    截止: `${today} 23:00 (UTC+8)`,
  };
  const body =
    `# 当日规划 · ${today}（GPT）\n\n` +
    `> dry_run=${ai.dry_run}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    `## 选题/任务清单草稿\n\n${ai.placeholder || "（真实输出待接入 OpenAI Key）"}\n\n` +
    `## 已下发到 AI 队列的具体可执行任务\n\n` +
    "```json\n" + JSON.stringify(executableTask, null, 2) + "\n```\n";
  const written = await writeArtifact(planPath, body, env, ctx);

  logDry("task.gpt-daily-plan", { today, planPath, task_id, dry_run: ai.dry_run });
  return { task: "gpt-daily-plan", ok: true, planPath, task_id, dry_run: true };
}

/* ---- 任务 2：DeepSeek 清洗前一日聊天记录 ---------------------- */
async function taskDeepseekClean(env, ctx) {
  const { yesterday } = localDates(env);
  const ai = await callAI({
    channel: "deepseek", env, ctx, taskName: "deepseek-clean",
    prompt: `清洗 knowledge/ai-chats/ 中 ${yesterday} 新增聊天记录：脱敏、去噪、提取要点。`,
    expect: "清洗稿",
  });
  const cleanPath = `knowledge/daily-clean/${yesterday}.cleaned.md`;
  const body =
    `# 清洗稿 · ${yesterday}（DeepSeek）\n\n` +
    `> 来源：knowledge/ai-chats/（${yesterday} 新增）　dry_run=${ai.dry_run}\n` +
    `> 处理：脱敏（<REDACTED>）→ 去噪 → 提取要点\n\n` +
    `## 清洗结果（占位）\n\n${ai.placeholder || "（真实清洗输出待接入 DeepSeek Key）"}\n\n` +
    `## 高价值片段标记\n\n- [ ] 片段待 GPT 价值判定后选作次日视频素材\n`;
  const written = await writeArtifact(cleanPath, body, env, ctx);
  logDry("task.deepseek-clean", { yesterday, cleanPath, dry_run: ai.dry_run, budget: ai.budget });
  return { task: "deepseek-clean", ok: true, cleanPath, dry_run: true, budget: ai.budget };
}

/* ---- 任务 3：Claude 批判性复盘 -------------------------------- */
async function taskClaudeReview(env, ctx) {
  const { today } = localDates(env);
  const ai = await callAI({
    channel: "claude", env, ctx, taskName: "claude-review",
    prompt: `对 ${today} 的清洗稿做一轮批判性复盘：挑矛盾点 / 遗漏，产出 review 笔记。`,
    expect: "批判性复盘笔记",
  });
  const reviewPath = `knowledge/daily-clean/${today}.review.md`;
  const body =
    `# 批判性复盘 · ${today}（Claude）\n\n` +
    `> 对象：当日清洗稿　dry_run=${ai.dry_run}\n\n` +
    `## 矛盾点\n- （占位）\n\n## 遗漏\n- （占位）\n\n## 原文\n\n${ai.placeholder || "（真实复盘输出待接入 Claude Key）"}\n`;
  await writeArtifact(reviewPath, body, env, ctx);
  logDry("task.claude-review", { today, reviewPath, dry_run: true });
  return { task: "claude-review", ok: true, reviewPath, dry_run: true };
}

/* ---- 任务 4：豆包每日 1 条视频（管线 + fallback + 台账） ----- */
async function taskDoubaoVideo(env, ctx) {
  const { today, compact } = localDates(env);
  // (a) 选题：来自当日清洗稿中 GPT 判定高价值的一段（占位）
  const topicPick = await callAI({
    channel: "gpt", env, ctx, taskName: "doubao-video.topic",
    prompt: `从 ${today} 清洗稿中选出 1 段 GPT 判定高价值内容作为视频选题。`,
    expect: "选题",
  });
  // (b) 中文口播文案
  const script = await callAI({
    channel: "doubao", env, ctx, taskName: "doubao-video.script",
    prompt: `基于选题产出 1 条中文口播文案（≤60 秒，9:16）。`,
    expect: "中文口播文案",
  });
  // (c) 视频制作：引擎 fallback  Gemini/Veo → Seedance → 本地占位
  const engineOrder = ["Gemini/Veo", "Seedance", "local-placeholder"];
  let engine = engineOrder[2]; // 无 Key 直接落到本地占位
  if (env && env.GEMINI_VIDEO_KEY) engine = engineOrder[0];
  else if (env && env.SEEDANCE_KEY) engine = engineOrder[1];
  logDry("video.engine-fallback", { order: engineOrder, chosen: engine, dry_run: true });

  // (d) 登记 CONTENT-YYYYMMDD-NNN 台账
  const seq = Number(env && env.TODAY_CONTENT_SEQ || 1);
  const contentId = makeContentId(compact, seq);
  const registryPath = "knowledge/content-registry.md";
  const registryRow =
    `| ${contentId} | 待补 | ${topicPick.placeholder || "（选题占位）"} | ${today}.cleaned.md | ` +
    `${script.placeholder ? "已起草" : "待起草"} | ${engine} | 未发布(私密待授权) | -\n`;
  await writeArtifact(registryPath, registryRow, env, ctx);

  // (e) 当天排好次日计划（写次日规划占位）
  const next = new Date(Date.now() + (Number(env.TZ_OFFSET_HOURS || 8) + 24) * 3600 * 1000);
  const nextDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, "0")}-${String(next.getUTCDate()).padStart(2, "0")}`;
  await writeArtifact(`knowledge/daily-plan/${nextDate}.md`,
    `# 次日预排 · ${nextDate}\n\n> 由 doubao-video 当日自动排产（占位，dry_run=true）\n- [ ] 选题延续：${topicPick.placeholder || "待选"}\n`, env, ctx);

  logDry("task.doubao-video", { today, contentId, engine, registryPath, dry_run: true, budget: script.budget });
  return { task: "doubao-video", ok: true, contentId, engine, registryPath, dry_run: true, budget: script.budget };
}

/* ---- 任务 5：Microsoft Copilot 西方视角对照 ------------------- */
async function taskCopilotWestern(env, ctx) {
  const { today } = localDates(env);
  const ai = await callAI({
    channel: "copilot", env, ctx, taskName: "copilot-western",
    prompt: `就当日同一选题，整理西方主流 AI（Microsoft/Copilot 生态）的说法作对照。`,
    expect: "西方视角对照笔记",
  });
  const path = `knowledge/daily-plan/${today}.western.md`;
  await writeArtifact(path,
    `# 西方视角对照 · ${today}（Microsoft Copilot）\n\n` +
    `> dry_run=true　同一选题下西方主流 AI 说法对照\n\n${ai.placeholder || "（占位，待接入凭证）"}\n`, env, ctx);
  logDry("task.copilot-western", { today, path, dry_run: true });
  return { task: "copilot-western", ok: true, path, dry_run: true };
}

/* ---- 任务 6：XIA(Grok) 另类视角/大胆预测 ---------------------- */
async function taskXiaAltView(env, ctx) {
  const { today } = localDates(env);
  const ai = await callAI({
    channel: "xia", env, ctx, taskName: "xia-altview",
    prompt: `就当日选题写一条另类视角 / 大胆预测短评（≤200 字）。`,
    expect: "另类视角短评",
  });
  const path = `knowledge/daily-plan/${today}.altview.md`;
  await writeArtifact(path,
    `# 另类视角 · 大胆预测 · ${today}（XIA/Grok）\n\n` +
    `> dry_run=true　仅作观点发散，不构成事实断言/投资建议\n\n${ai.placeholder || "（占位，待接入凭证）"}\n`, env, ctx);
  logDry("task.xia-altview", { today, path, dry_run: true });
  return { task: "xia-altview", ok: true, path, dry_run: true };
}

/* ---- 任务表 --------------------------------------------------- */
const TASK_TABLE = {
  "deepseek-clean": { ai: "DeepSeek", fn: taskDeepseekClean, retry: 2, cronCst: "06:30" },
  "gpt-daily-plan": { ai: "GPT", fn: taskGptDailyPlan, retry: 2, cronCst: "08:00" },
  "claude-review": { ai: "Claude", fn: taskClaudeReview, retry: 2, cronCst: "09:30" },
  "doubao-video": { ai: "豆包", fn: taskDoubaoVideo, retry: 1, cronCst: "11:00" },
  "copilot-western": { ai: "Microsoft Copilot", fn: taskCopilotWestern, retry: 2, cronCst: "14:00" },
  "xia-altview": { ai: "XIA(Grok)", fn: taskXiaAltView, retry: 2, cronCst: "16:00" },
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
   * 通过 CRON_MAP 把 cron 字符串映射到任务 key（与 wrangler.daily.toml 对齐）。
   */
  async scheduled(event, env, ctx) {
    const CRON_MAP = {
      "30 22 * * *": "deepseek-clean",     // 22:30 UTC = 次日 06:30 UTC+8
      "0 0 * * *": "gpt-daily-plan",       // 00:00 UTC = 08:00 UTC+8
      "30 1 * * *": "claude-review",       // 01:30 UTC = 09:30 UTC+8
      "0 3 * * *": "doubao-video",         // 03:00 UTC = 11:00 UTC+8
      "0 6 * * *": "copilot-western",      // 06:00 UTC = 14:00 UTC+8
      "0 8 * * *": "xia-altview",          // 08:00 UTC = 16:00 UTC+8
    };
    const key = CRON_MAP[event.cron] || "gpt-daily-plan"; // 兜底跑一次规划
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
      const key = url.searchParams.get("task") || "gpt-daily-plan";
      const result = await dispatchTask(key, env, ctx);
      return new Response(JSON.stringify(result), { headers: { "Content-Type": "application/json; charset=utf-8" } });
    }
    return new Response(JSON.stringify({ ok: false, error: "not found" }), { status: 404 });
  },
};
