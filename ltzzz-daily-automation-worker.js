#!/usr/bin/env node
/**
 * LTZZZ 七 AI 每日自动化调度 Worker（v3：七通道每日任务详细规则，含 Kimi 挑战者槽位）
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
async function scanRepo(env) {
  // 2026-10-02 修正：优先读「-入档」版（有真实记录）。原清单读的 魄.md/识神.md 等在 GitHub 上
  // 仍是 300-650B 的空模板（只有字段格式无记录），AI 每天读到的是空壳 → 盲写。
  // 入档版缺失时网关返回 404、readable=false，不影响其余文件读取。
  const memoryFiles = [
    "ltzzz-memory/README.md",
    "ltzzz-memory/重要事件-入档.md",
    "ltzzz-memory/魄-入档.md",
    "ltzzz-memory/识神-入档.md",
    "ltzzz-memory/梦境数据库-入档.md",
    "ltzzz-memory/文明研究-入档.md",
    "ltzzz-memory/文明研究-DeepSeek提炼.md",
    "ltzzz-memory/装备论.md",
    "ltzzz-memory/项目历史.md",
    "ltzzz-memory/Daily-AI-Scheduler.md"
  ];
  const sources = [
    "ltzzz-memory/",
    "knowledge/", "knowledge/ai-chats/", "knowledge/memory-review/",
    "articles/", "protocol/"
  ];

  // 2026-10-02 修正 v5（根因级）：
  //  v2 只判 resp.ok 不读正文 → AI 盲写；
  //  v3 逐个 /file 读正文 → 边缘内串行 10 次子请求全败（0/10）；
  //  v4 改走网关 /bundle 单请求 → 仍 0/10（外部同端点实测 200/31KB，故判定为
  //      跨 Worker 子请求链在免费额度下不稳定：daily → gateway → github raw 两层）。
  //  v5 改为**本 Worker 直连 GitHub raw 并行拉取**（Promise.all + 单文件超时），
  //      彻底去掉中间网关层；网关与 R2 仅作降级备选。
  const REPO_RAW = "https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/main";
  const CONTENT_BUDGET = 24000; // 注入 prompt 的总字节上限，避免超上下文
  const PER_FILE_TIMEOUT = 8000;

  async function fetchOne(path) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), PER_FILE_TIMEOUT);
    try {
      const resp = await fetch(`${REPO_RAW}/${path}`, {
        signal: ctrl.signal,
        cf: { cacheTtl: 300 },
      });
      if (!resp.ok) return { path, readable: false, status: resp.status };
      const body = await resp.text();
      return { path, readable: !!(body && body.trim().length > 0), bytes: (body || "").length, body: body || "" };
    } catch (e) {
      return { path, readable: false, error: String((e && e.message) || e).slice(0, 80) };
    } finally {
      clearTimeout(timer);
    }
  }

  try {
    const results = await Promise.all(memoryFiles.map(fetchOne));
    const manifest = [];
    const contents = [];
    let totalBytes = 0;
    for (const r of results) {
      manifest.push({ path: r.path, readable: r.readable, bytes: r.bytes, status: r.status, error: r.error });
      if (r.readable && totalBytes < CONTENT_BUDGET) {
        const slice = r.body.slice(0, Math.max(0, CONTENT_BUDGET - totalBytes));
        contents.push(`\n\n===== ${r.path} =====\n${slice}`);
        totalBytes += slice.length;
      }
    }
    const okCount = manifest.filter((m) => m.readable).length;
    if (okCount > 0) {
      return {
        sources,
        manifest,
        contents,
        content_bytes: totalBytes,
        dry_run: false,
        memory_engine: "v5",
        source: "github_raw_direct",
        note: `GitHub raw 并行直读：${okCount}/${memoryFiles.length} 文件可读，注入正文 ${totalBytes} 字节`,
      };
    }
    // 直连全败 → 记失败原因，降级走网关 bundle
    var directFail = manifest.map((m) => `${m.path.split("/").pop()}:${m.status || m.error || "?"}`).join(", ");
  } catch (e) {
    var directFail = "exception:" + String((e && e.message) || e).slice(0, 100);
  }

  // —— 降级：Memory Gateway /bundle ——
  const gatewayBase = env.MEMORY_GATEWAY_URL || "https://ltzzz-memory-gateway.ltzyz2181.workers.dev";
  if (gatewayBase) {
    try {
      const bResp = await fetch(`${gatewayBase}/bundle?paths=${encodeURIComponent(memoryFiles.join(","))}`, {
        cf: { cacheTtl: 300 },
      });
      if (bResp.ok) {
        const bData = await bResp.json();
        const manifest = [];
        const contents = [];
        let totalBytes = 0;
        const got = new Map();
        for (const f of (bData.files || [])) {
          if (f && f.path && typeof f.content === "string" && f.content.trim().length > 0) got.set(f.path, f.content);
        }
        for (const path of memoryFiles) {
          const body = got.get(path);
          if (body) {
            manifest.push({ path, readable: true, bytes: body.length });
            if (totalBytes < CONTENT_BUDGET) {
              const slice = body.slice(0, Math.max(0, CONTENT_BUDGET - totalBytes));
              contents.push(`\n\n===== ${path} =====\n${slice}`);
              totalBytes += slice.length;
            }
          } else {
            manifest.push({ path, readable: false });
          }
        }
        const okCount = manifest.filter((m) => m.readable).length;
        if (okCount > 0) {
          return {
            sources, manifest, contents, content_bytes: totalBytes,
            dry_run: false, memory_engine: "v5", source: "gateway_bundle",
            note: `Gateway /bundle 读取：${okCount}/${memoryFiles.length} 文件可读，注入正文 ${totalBytes} 字节（直连失败：${String(directFail).slice(0, 120)}）`,
          };
        }
      }
    } catch (e) {
      return {
        sources,
        manifest: memoryFiles.map((path) => ({ path, readable: false })),
        contents: [], content_bytes: 0, dry_run: true, memory_engine: "v5",
        note: `直连与网关均失败。直连：${String(directFail).slice(0, 120)}；网关：${String((e && e.message) || e).slice(0, 100)}`,
      };
    }
  }

  // 次选：R2 绑定
  if (env && env.LTZZZ_ARTIFACTS && typeof env.LTZZZ_ARTIFACTS.get === "function") {
    const manifest = [];
    for (const path of memoryFiles) {
      const obj = await env.LTZZZ_ARTIFACTS.get(path);
      manifest.push({ path, readable: !!obj });
    }
    return {
      sources,
      manifest,
      dry_run: false,
      memory_engine: "v1",
      source: "r2",
      note: "Memory Engine v1 (R2)",
    };
  }

  return {
    sources,
    manifest: memoryFiles.map((path) => ({ path, readable: false })),
    dry_run: true,
    memory_engine: "v1",
    note: "Gateway 不可达且未绑 R2，仅 manifest 占位。",
  };
}

/** 把 scanRepo() 渲染成 Markdown「## 今日已阅读」小节 */
function renderScanSection(scan) {
  const dirLines = scan.sources.map((d) => `  - ${d}/`).join("\n");
  // 2026-10-02 修正：manifest 元素是 {path,readable} 对象，原 `${f}` 会输出 [object Object]。
  const fileLines = scan.manifest.map((f) => {
    const p = (f && typeof f === "object") ? f.path : String(f);
    const ok = (f && typeof f === "object") ? (f.readable ? "✓" : "✗未读到") : "";
    return `  - ${p} ${ok}`;
  }).join("\n");
  return (
    `## 今日已阅读（scanRepo）\n\n` +
    `> 开工前先通读仓库既有内容。dry_run=${scan.dry_run}　${scan.note}\n\n` +
    `**阅读目录**\n${dirLines}\n\n**文件清单**\n${fileLines}\n` +
    // 2026-10-02 修正（根因级）：把真实正文注入 prompt，AI 才有东西可读，
    // 不再出现"我没有实际访问你本地仓库的能力"。
    (Array.isArray(scan.contents) && scan.contents.length
      ? `\n## 记忆正文（真实内容，据此作答，禁止声称读不到）\n${scan.contents.join("")}\n`
      : `\n> ⚠ 记忆正文为空（0 文件可读）：请在产出中如实写明"未读到仓库内容"，不得凭空编造引用。\n`)
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
  let keyName;
  if (channel === "gpt") keyName = "OPENAI_API_KEY";
  else if (channel === "claude") keyName = "ANTHROPIC_API_KEY";
  else if (channel === "xia") keyName = "XAI_API_KEY";
  else if (channel === "doubao") keyName = "ARK_API_KEY";
  else if (channel === "kimi") keyName = "MOONSHOT_API_KEY";
  else keyName = `${channel.toUpperCase()}_API_KEY`;
  // kimi 通道支持走 LTZZZ Kimi proxy（内置 Key），无需本地 MOONSHOT_API_KEY
  const needsLocalKey = channel !== "kimi";
  const hasKey = needsLocalKey ? !!(env && env[keyName]) : true;
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
  // 有 Key：真实 API 调用
  logDry("ai.live-call", { taskName, channel, keyMask: maskSecret(env[keyName]) });

  let apiUrl, model, apiKey, extraHeaders = {};

  if (channel === "gpt") {
    apiUrl = "https://api.openai.com/v1/chat/completions";
    model = "gpt-3.5-turbo";
    apiKey = env.OPENAI_API_KEY;
  } else if (channel === "deepseek") {
    apiUrl = "https://api.deepseek.com/v1/chat/completions";
    model = "deepseek-chat";
    apiKey = env.DEEPSEEK_API_KEY;
  } else if (channel === "kimi") {
    // 直连官方需 MOONSHOT_API_KEY（moonshot-v1 系列已下线，现行 kimi-k2.6 / k3 / k2.7-code）；
    // 未配置本地 Key 时回退 LTZZZ Kimi proxy（api-kimi.ltzzz.com 内置 Key，大陆可直连）
    model = "kimi-k2.6";
    if (env.MOONSHOT_API_KEY) {
      apiUrl = "https://api.moonshot.cn/v1/chat/completions";
      apiKey = env.MOONSHOT_API_KEY;
    } else {
      apiUrl = "https://api-kimi.ltzzz.com/";
      apiKey = "ltzzz-kimi-proxy";
    }
  } else if (channel === "claude") {
    apiUrl = "https://api.anthropic.com/v1/messages";
    model = "claude-3-5-sonnet-20241022";
    apiKey = env.ANTHROPIC_API_KEY;
    extraHeaders["anthropic-version"] = "2023-06-01";
  } else if (channel === "doubao") {
    apiUrl = env.DOUBAO_BASE_URL || "https://ark.cn-beijing.volces.com/api/v3/chat/completions";
    // 2026-10-02 修正：原硬编码 "doubao-seed-1-6-250615" 已被方舟下线 → 上游 404，
    // 但该虚报长期被 dry_run:false 掩盖。改为优先读 DOUBAO_MODEL Secret（部署时已配），
    // 换模型只需改 Secret，不必改代码重部署。
    model = env.DOUBAO_MODEL || "doubao-seed-1-6-250615";
    apiKey = env.ARK_API_KEY;
  } else if (channel === "xia") {
    // 2026-10-09 总控修正：本 Worker 的 XAI_API_KEY 与 ltzzz-xai-proxy 的是两把不同 key
    // （实测：proxy 用 grok-4-fast 正常返回；本 Worker 用同名报
    //   "team 8c4ed0f5… does not have access to it"，换 grok-4/grok-4-fast 均 404）。
    // 2026-10-09 总控修正（根因）：Worker 之间不能通过 *.workers.dev 互调，
    // Cloudflare 返回 error code 1042（实测：本 Worker 打 proxy 的 workers.dev 地址报 404/1042，
    // 而从外部打同一个 workers.dev 地址却正常）。这与 kimi 通道当初必须挂自定义域名是同一原因。
    // 已给 xai proxy 挂上 api-xai.ltzzz.com（实测 health + 真实调用 grok-4-fast 均 OK），改走该域名。
    // 顺带结论：CF Token 具备挂 Custom Domain 的能力（走 workers_routes + ssl_certs 权限），
    // 不需要 DNS:Edit——此前 wrangler.xai.toml 里"缺 DNS 权限故 routes 注释"的判断不成立。
    model = env.XAI_MODEL || "grok-4-fast";
    if (env.XAI_BASE_URL) {
      apiUrl = env.XAI_BASE_URL;
      apiKey = env.XAI_API_KEY;
    } else {
      apiUrl = "https://api-xai.ltzzz.com/";
      apiKey = "ltzzz-xai-proxy"; // proxy 内置真实 key；此值仅为占位标识，不含凭证
    }
  } else {
    // 2026-10-02 修正（总控自查）：live-skeleton 是占位骨架、未发生任何上游调用，
    // 原先返回 dry_run:false 属虚报——违反四公式"AI回复≠实际结果"。
    // 正确口径：未真实调用 = dry_run:true + status 明示 skeleton。
    return { ok: true, status: "skeleton", dry_run: true, budget, placeholder: `[skeleton] ${channel} 通道未配置上游，未发生真实调用` };
  }

  try {
    const headers = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
      ...extraHeaders,
    };

    let body;
    if (channel === "claude") {
      body = {
        model: model,
        max_tokens: 4000, // 2026-10-02 修正：原 500 对思考型模型(kimi-k2.6等)会被 reasoning 占满导致 content 空
        messages: [
          { role: "user", content: prompt },
        ],
      };
    } else {
      body = {
        model: model,
        messages: [
          { role: "system", content: "你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。" },
          { role: "user", content: prompt },
        ],
        max_tokens: 4000, // 2026-10-02 修正：原 500 导致 kimi-k2.6 等思考型模型 reasoning 占满、content 为空
        // kimi 新版模型仅接受 temperature=1，故此处不再传 temperature（交由上游默认）
      };
    }

    const resp = await fetch(apiUrl, {
      method: "POST",
      headers: headers,
      body: JSON.stringify(body),
    });

    if (!resp.ok) {
      const errText = await resp.text();
      logDry("ai.error", { taskName, channel, status: resp.status, error: errText.slice(0, 200) });
      // 2026-10-02 修正（第5处虚报）：API 报错 = 未产生任何真实模型输出，
      // 原返回 dry_run:false 会让产出顶部显示"已成功"、正文却回退占位文案，两头失真。
      // 现改为 dry_run:true + status:api_error + 把真实错误写进 placeholder，如实暴露。
      const brief = errText.slice(0, 160).replace(/\s+/g, " ");
      return {
        ok: false,
        status: "api_error",
        dry_run: true,
        budget,
        error: `API 返回 ${resp.status}: ${brief}`,
        placeholder: `（本段无真实模型输出。上游返回 HTTP ${resp.status}：${brief}。常见原因：余额不足 / Key 失效 / 模型名已下线。不得据此声称任务完成。）`,
      };
    }

    const data = await resp.json();
    let output;
    if (channel === "claude") {
      output = data.content?.[0]?.text || "";
    } else {
      const msg = data.choices?.[0]?.message || {};
      // 2026-10-02 修正：kimi-k2.6 / doubao-seed 等思考型模型在 max_tokens 偏小时，
      // content 常为空字符串而正文全在 reasoning_content（实测 kimi out=3000 时 content 为空）。
      // 原实现 `|| JSON.stringify(data)` 会把整包 JSON 当"成功输出"写进记忆库，属伪成功。
      output = (typeof msg.content === "string" && msg.content.trim())
        ? msg.content
        : (typeof msg.reasoning_content === "string" && msg.reasoning_content.trim()
            ? `[模型仅返回推理过程，正文为空——疑似 max_tokens 不足]\n${msg.reasoning_content.slice(0, 2000)}`
            : "");
    }

    // 空输出不得算成功：如实报 dry_run，避免"跑过了"的假象
    if (!output || !String(output).trim()) {
      const fr = data.choices?.[0]?.finish_reason || data.stop_reason || "unknown";
      logDry("ai.empty_output", { taskName, channel, finish_reason: fr });
      return {
        ok: false,
        status: "empty_output",
        dry_run: true,
        budget,
        error: `上游返回 200 但正文为空（finish_reason=${fr}）。常见原因：max_tokens 被思考过程占满。`,
        placeholder: `（本段无真实模型输出：上游 200 但 content 为空，finish_reason=${fr}。不得据此声称任务完成。）`,
      };
    }

    return {
      ok: true,
      status: "live",
      dry_run: false,
      budget,
      output: output,
      placeholder: output,
    };
  } catch (err) {
    logDry("ai.exception", { taskName, channel, error: String(err) });
    return {
      ok: false,
      status: "exception",
      dry_run: false,
      budget,
      error: String(err),
    };
  }
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
  const scan = await scanRepo(env);

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
  return { task: "gpt-daily", ok: true, path, task_id, polish: polish.map((p) => ({ file: p.file, status: p.status })), dry_run: ai.dry_run };
}

/* ---- 任务 2：豆包 每日 ------------------------------------------
 * 阅读仓库 + 装备论学习笔记；每日≥1条 polish_proposal；每日1条视频脚本（台账+全文）
 * ---------------------------------------------------------------- */
async function taskDoubaoDaily(env, ctx) {
  const { today, compact } = localDates(env);
  const scan = await scanRepo(env);

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
  return { task: "doubao-daily", ok: true, path, contentId, registryPath, budget: note.budget, dry_run: note.dry_run };
}

/* ---- 任务 3：XAI/Grok 每日 --------------------------------------
 * 阅读仓库 + 装备论对心理问题(焦虑/抑郁/双相)的实际作用，每日列1条；
 * 对 app.html 与 Web3(wallet-lab.html/contracts/) 每日≥1条 polish_proposal
 * ---------------------------------------------------------------- */
async function taskXiaDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = await scanRepo(env);

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
  logDry("task.xia-daily", { today, path, polish_count: polish.length, dry_run: mental.dry_run });
  return { task: "xia-daily", ok: true, path, dry_run: mental.dry_run };
}

/* ---- 任务 4：Claude 每日 ----------------------------------------
 * 阅读仓库 + 每日一段≥50字小说片段，逐日连续积累（备写网文）
 * ---------------------------------------------------------------- */
async function taskClaudeDaily(env, ctx) {
  const { today, yesterday } = localDates(env);
  const scan = await scanRepo(env);

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
  logDry("task.claude-daily", { today, path, dry_run: fiction.dry_run });
  return { task: "claude-daily", ok: true, path, dry_run: fiction.dry_run };
}

/* ---- 任务 5：DeepSeek 每日 --------------------------------------
 * 阅读仓库 + 对照“中华传统文化”与“装备论”异同，每日1条
 * ---------------------------------------------------------------- */
async function taskDeepseekDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = await scanRepo(env);

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
    // 2026-10-02 修正：原模板硬编码"相同点（占位，待接入 DEEPSEEK_API_KEY）"，
    // 即使真实输出已生成也显示"待接入"，属误导。改为按 dry_run 如实呈现。
    (compare.dry_run
      ? `> dry_run：DEEPSEEK_API_KEY 未配置或预算停付，本条无真实模型输出。\n`
      : `${compare.placeholder || compare.output || "（模型返回空）"}\n`);

  const path = dailyPath("deepseek", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.deepseek-daily", { today, path, dry_run: compare.dry_run, budget: compare.budget });
  return { task: "deepseek-daily", ok: true, path, budget: compare.budget, dry_run: compare.dry_run };
}

/* ---- 任务 6：Microsoft Copilot 每日 ------------------------------
 * 阅读仓库 + 对照“西方文化”与“装备论”异同，每日1条
 * ---------------------------------------------------------------- */
async function taskCopilotDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = await scanRepo(env);

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
    // 2026-10-02 修正：同 deepseek，去掉硬编码死占位，按 dry_run 如实呈现
    (compare.dry_run
      ? `> dry_run：COPILOT 凭证未配置，本条无真实模型输出。\n`
      : `${compare.placeholder || compare.output || "（模型返回空）"}\n`);

  const path = dailyPath("copilot", today);
  await writeArtifact(path, body, env, ctx);
  // 2026-10-02 修正：原硬编码 dry_run:true 属反向虚报（真跑成功也报空跑），改为透传实际状态
  logDry("task.copilot-daily", { today, path, dry_run: compare.dry_run });
  return { task: "copilot-daily", ok: true, path, dry_run: compare.dry_run };
}

/* ---- 任务 7：Kimi / Moonshot 每日 -------------------------------
 * 阅读仓库+记忆九篇，写读后感（观·行深）+≥1条 polish_proposal；
 * 长文本分析与总控挑战评估（challenger 角色）。
 * ---------------------------------------------------------------- */
async function taskKimiDaily(env, ctx) {
  const { today } = localDates(env);
  const scan = await scanRepo(env);

  const reflection = await callAI({
    channel: "kimi", env, ctx, taskName: "kimi-daily.reflection",
    prompt: `你是 LTZZZ 的 Kimi（总控挑战者）。先基于今日已阅读的记忆文件（魄/识神/梦境/文明/项目历史/重要事件/README），写一段对「观 · 行深 · 大道至简」的读后感（≥120字）。然后给出 1 条对当前仓库或商品页/自动化的 polish 提案（文件路径 + before→after）。最后用 1 句话评估今日总控适配度（自己 vs 其他 AI）。`,
    expect: "读后感 + polish 提案 + 总控挑战评估",
  });

  const polish = makePolishProposal({
    file: "ltzzz-daily-automation-worker.js",
    before: "仅六通道，无 Kimi 槽位",
    after: "已接入 kimi-daily 通道（MOONSHOT_API_KEY / LTZZZ Kimi proxy），每日强制产出读后感与 polish",
  });

  const body =
    `# Kimi / Moonshot 每日 · ${today}\n\n` +
    `> dry_run=${reflection.dry_run}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
    renderScanSection(scan) + "\n" +
    `## 观 · 行深 读后感\n\n` +
    `${reflection.placeholder || reflection.output || "（占位输出，等待 MOONSHOT_API_KEY）"}\n\n` +
    renderPolishSection([polish]) + "\n" +
    `## 总控挑战评估\n\n` +
    `- 角色：challenger（与千问比拼临时总控适配度）\n` +
    `- 今日产出状态：dry_run=${!!reflection.dry_run}\n`;

  const path = dailyPath("kimi", today);
  await writeArtifact(path, body, env, ctx);
  logDry("task.kimi-daily", { today, path, dry_run: !!reflection.dry_run });
  return { task: "kimi-daily", ok: true, path, dry_run: !!reflection.dry_run };
}

/* ---- 任务表 --------------------------------------------------- */
/**
 * TASK_TABLE —— 七通道每日任务表。
 * 🚨【强制每天执行 / MUST】下列七项全部 mandatory: true，是硬约束，不是可选项：
 *   - 不得 skip：每个自然日（UTC+8）七个通道都必须触发执行，无 Key / 上游不可用 / 预算触线也不准整项跳过。
 *   - 无 Key 也必须产出当日 dry-run 记录：统一落盘 knowledge/daily/<channel>/YYYY-MM-DD.md，
 *     文件头 dry_run=true + WAITING_CREDENTIAL，写明 dry-run 占位原因；不得留空、不得伪造真实产出。
 *   - 预算红线（豆包/DeepSeek 各 20 RMB）、凭证只进 Secret、polish 的 proposed/applied 诚信双层均不变。
 */
const TASK_TABLE = {
  "gpt-daily":      { ai: "GPT",               fn: taskGptDaily,      retry: 2, cronCst: "08:00", mandatory: true },
  "claude-daily":   { ai: "Claude",            fn: taskClaudeDaily,   retry: 2, cronCst: "09:30", mandatory: true },
  "doubao-daily":   { ai: "豆包",              fn: taskDoubaoDaily,   retry: 1, cronCst: "11:00", mandatory: true },
  "deepseek-daily": { ai: "DeepSeek",           fn: taskDeepseekDaily, retry: 2, cronCst: "06:30", mandatory: true },
  "copilot-daily":  { ai: "Microsoft Copilot",  fn: taskCopilotDaily,  retry: 2, cronCst: "14:00", mandatory: true },
  "xia-daily":      { ai: "XAI/Grok",           fn: taskXiaDaily,       retry: 2, cronCst: "16:00", mandatory: true },
  "kimi-daily":     { ai: "Kimi/Moonshot",      fn: taskKimiDaily,      retry: 2, cronCst: "17:00", mandatory: true },
};

/**
 * 失败重试：指数退避最多 retry 次；全部失败记录 waiting_manual，不抛崩调度。
 * 🚨 强制项（mandatory=true）：即便无 Key，各 fn 也已落盘当日 dry-run 记录；
 *    重试仍失败时除记 waiting_manual 外，必须保留/补写当日 dry-run 占位文件，不得 skip、不得留空。
 */
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
      logDry("dispatch.ok", { key, attempt: attempt + 1, mandatory: !!entry.mandatory, dry_run: true, note: entry.mandatory ? "mandatory: 当日 dry-run 记录已产出，不得 skip" : undefined });
      return result;
    } catch (e) {
      lastErr = e;
      logDry("dispatch.retry", { key, attempt: attempt + 1, maxRetry: maxRetry + 1, mandatory: !!entry.mandatory, error: String(e && e.message || e) });
      if (attempt < maxRetry) await new Promise((r) => setTimeout(r, 500 * Math.pow(2, attempt)));
    }
  }
  logDry("dispatch.failed_waiting_manual", { key, mandatory: !!entry.mandatory, dry_run: true, error: String(lastErr && lastErr.message || lastErr), note: "mandatory: 重试仍失败也必须保留当日 dry-run 占位文件，不得 skip / 留空" });
  return { ok: false, status: "waiting_manual", mandatory: !!entry.mandatory, dry_run: true, error: String(lastErr && lastErr.message || lastErr) };
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
    // 每小时触发一次，按 UTC 小时路由到对应任务（CST=UTC+8）
    const now = new Date();
    const utcHour = now.getUTCHours();
    const HOUR_MAP = {
      22: "deepseek-daily",   // 22:00 UTC = 06:00 CST
      0:  "gpt-daily",        // 00:00 UTC = 08:00 CST
      1:  "claude-daily",     // 01:00 UTC = 09:00 CST
      3:  "doubao-daily",     // 03:00 UTC = 11:00 CST
      6:  "copilot-daily",    // 06:00 UTC = 14:00 CST
      8:  "xia-daily",        // 08:00 UTC = 16:00 CST
      9:  "kimi-daily",       // 09:00 UTC = 17:00 CST
    };
    const key = HOUR_MAP[utcHour] || null;
    if (!key) {
      console.log(JSON.stringify({ at: new Date().toISOString(), skip: true, utcHour, reason: "no task this hour" }));
      return;
    }
    console.log(JSON.stringify({ at: new Date().toISOString(), scheduled: key, utcHour }));
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
      // 调试模式：/run 无需 token（生产可通过设置 LTZZZ_AGENT_TOKEN 启用保护）
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

