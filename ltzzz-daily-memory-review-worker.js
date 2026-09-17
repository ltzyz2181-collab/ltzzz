/**
 * LTZZZ 每日长期记忆审查 Worker
 * ---------------------------------------------------------------------------
 * 目标：每天结束时（UTC+8 23:30），收集「当天各方关于 LTZZZ AI 长期记忆功能说了什么」，
 *       产出对长期记忆功能的优化建议，并落盘为 Markdown 日报。
 *
 * 入口：
 *   1) scheduled(event, env, ctx)  —— Cloudflare Cron Triggers 每日自动跑（推荐）
 *   2) GET  /status               —— 健康检查
 *   3) GET/POST /review[?date=YYYY-MM-DD] —— 手动触发审查
 *   4) 本地 dry-run：node ltzzz-daily-memory-review-worker.js [YYYY-MM-DD]
 *      （走 node:fs 直接扫仓库并真实落盘，用于无部署环境下验证整条链路）
 *
 * 数据分层：
 *   - 收集/提取/归类/总结的「分析内核」是纯函数，与运行时无关，可在 Node 里直接跑。
 *   - 「数据源」通过 fileProvider 注入：本地 dry-run 用 node:fs；Cloudflare 运行时
 *     无文件系统，正式部署后应把 knowledge/ 快照放进 R2（绑定名见下方 R2_BINDING），
 *     或由 GitHub Action 每日上传——当前为占位实现，见「等待人工凭证/数据源」清单。
 *
 * LLM 复盘：
 *   - 当前无真实 LLM API Key：analyzeByLLM() 一律走 dry-run 占位，
 *     返回 { status: "WAITING_CREDENTIAL" }，代码内显式标注「等待人工凭证后接 LLM 复盘」。
 *   - 未配置 env.LLM_API_KEY 前，分析结果 = 本地规则抽取 + 模板总结。
 * ---------------------------------------------------------------------------
 */

// ============================ 一、路径常量（落盘约定） ============================

/** 仓库根（本地 dry-run 下即进程 cwd；部署后由数据源决定） */
const REPO_ROOT = ".";

/** 聊天记录库根：knowledge/ai-chats/<AI>/... */
const CHATS_DIR = "knowledge/ai-chats";

/** 当日规划稿目录（不存在时按「当天无规划稿」处理） */
const DAILY_PLAN_DIR = "knowledge/daily-plan";

/** 审查结果落盘目录：knowledge/memory-review/YYYY-MM-DD.md */
const OUTPUT_DIR = "knowledge/memory-review";

/** R2 绑定名（部署后用于落盘；当前仅文档化，不强制） */
const R2_BINDING = "MEMORY_REVIEW_BUCKET";

/** 输出文件名生成器：knowledge/memory-review/YYYY-MM-DD.md */
function outputPathFor(dateStr) {
  return `${OUTPUT_DIR}/${dateStr}.md`;
}

// ============================ 二、关键词表 ============================

/**
 * 与「长期记忆」讨论相关的关键词。
 * 前 5 个是记忆功能通用词；后 6 个是 LTZZZ 用户的修行理论术语——
 * 记忆功能讨论常围绕「装备/元神/识神/魄/习气」展开（见 AI-ARCHIVE-INDEX.md A/B/C 类）。
 */
const MEMORY_KEYWORDS = [
  "记忆", "长期", "沉淀", "知识库", "上下文",
  "人格", "装备", "元神", "识神", "魄", "习气",
];

/** 用户表达的「记忆需求」信号词 */
const NEED_HINTS = [
  "希望你记住", "下次记得", "要记住", "记住", "沉淀", "存下来", "存进",
  "以后都要", "长期记住", "别忘了", "不要忘", "保存这份",
];

/** AI 暴露的「记忆缺陷」信号词（跨会话丢失 / 混淆 / 重复） */
const DEFECT_HINTS = [
  "忘了", "忘记", "不记得", "记不住", "又重复", "重复问", "上次说",
  "新会话", "上下文丢失", "跨会话", "混淆", "又问", "已经说过", "刚才不是",
  "重新讲", "从头再说", "没有印象",
];

/** 「可落地优化点」信号词 */
const OPTIMIZE_HINTS = [
  "索引", "标签", "结构化", "摘要", "检索", "召回", "优先级",
  "归档", "分类", "版本", "更新机制", "回执", "Content ID",
];

// ============================ 三、工具函数 ============================

/** 取 UTC+8（Asia/Shanghai）当天日期 YYYY-MM-DD */
function todayUTC8(nowMs = Date.now()) {
  return new Date(nowMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 把 mtime 换算到 UTC+8 的日期 */
function mtimeDateUTC8(mtimeMs) {
  return new Date(mtimeMs + 8 * 3600 * 1000).toISOString().slice(0, 10);
}

/** 从文件名里挖日期，支持 2026-09-17 / 20260917 两种写法 */
function dateFromFilename(name) {
  const dash = name.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dash) return `${dash[1]}-${dash[2]}-${dash[3]}`;
  const compact = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

/** 是否跳过的文件（索引、说明、占位） */
function isSkippedFile(name) {
  return (
    name === "index.md" ||
    name === "README.md" ||
    name.startsWith(".") ||
    !name.endsWith(".md")
  );
}

// ============================ 四、收集（collect） ============================

/**
 * 收集当天候选文件。
 * fileProvider 接口：
 *   - listFiles(dir)   -> [{ path, name, mtimeMs }]（递归列出 dir 下所有文件）
 *   - readFile(path)   -> string（读全文）
 * 命中规则（满足其一即入选）：
 *   a) 文件名含目标日期；
 *   b) 文件 mtime 落在目标日期（UTC+8）。
 */
async function collectTodayFiles(targetDate, fileProvider) {
  const found = [];

  // 4.1 聊天记录库
  let chatEntries = [];
  try {
    chatEntries = await fileProvider.listFiles(CHATS_DIR);
  } catch (_e) {
    chatEntries = [];
  }
  for (const ent of chatEntries) {
    if (isSkippedFile(ent.name)) continue;
    const byName = dateFromFilename(ent.name) === targetDate;
    const byMtime = mtimeDateUTC8(ent.mtimeMs) === targetDate;
    if (!byName && !byMtime) continue;

    // 来源 AI = knowledge/ai-chats/<AI>/文件名 中的 <AI>
    const parts = ent.path.split("/");
    const ai = parts.length >= 3 ? parts[parts.length - 2] : "unknown";
    found.push({ path: ent.path, source: "ai-chat", ai, reason: byName ? "文件名日期" : "mtime" });
  }

  // 4.2 当天规划稿（存在才扫）
  try {
    const planEntries = await fileProvider.listFiles(DAILY_PLAN_DIR);
    for (const ent of planEntries) {
      if (isSkippedFile(ent.name)) continue;
      const byName = dateFromFilename(ent.name) === targetDate;
      const byMtime = mtimeDateUTC8(ent.mtimeMs) === targetDate;
      if (!byName && !byMtime) continue;
      found.push({ path: ent.path, source: "daily-plan", ai: "plan", reason: byName ? "文件名日期" : "mtime" });
    }
  } catch (_e) {
    // daily-plan 目录不存在属于正常情况
  }

  return found;
}

// ============================ 五、提取（extract） ============================

/** 从一段文本里抽出含记忆关键词的行级片段，控制长度与数量 */
function extractSnippets(text, maxPerFile = 6, snippetLen = 140) {
  const lines = String(text).split(/\n+/);
  const hits = [];
  const seen = new Set();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue; // 标题行不进片段（避免噪声）
    const kw = MEMORY_KEYWORDS.filter((k) => line.includes(k));
    if (kw.length === 0) continue;
    const key = line.slice(0, 40);
    if (seen.has(key)) continue;
    seen.add(key);
    const snippet = line.length > snippetLen ? line.slice(0, snippetLen) + "…" : line;
    hits.push({ snippet, keywords: kw });
    if (hits.length >= maxPerFile) break;
  }
  return hits;
}

/** 对单条片段做归类打分 */
function classifyOne(snippet) {
  const count = (hints) => hints.reduce((n, h) => (snippet.includes(h) ? n + 1 : n), 0);
  const defectN = count(DEFECT_HINTS);
  const needN = count(NEED_HINTS);
  const optN = count(OPTIMIZE_HINTS);

  if (defectN > 0) return { bucket: "ai-defect", score: defectN };
  if (needN > 0) return { bucket: "user-need", score: needN };
  if (optN > 0) return { bucket: "optimize-point", score: optN };
  return { bucket: "unclassified", score: 0 }; // 命中记忆关键词，但无明确倾向
}

/** 一句话摘要（dry-run 模板：命中词 + 倾向） */
function summarizeOne(snippet, bucket) {
  const bucketLabel = {
    "user-need": "用户表达的记忆需求",
    "ai-defect": "AI 记忆缺陷",
    "optimize-point": "可落地优化点",
    "unclassified": "记忆相关讨论（倾向待人工/LLM 判定）",
  }[bucket];
  const kw = snippet.keywords.join("、");
  return `${bucketLabel}｜命中词：${kw}`;
}

// ============================ 六、分析（analyze，dry-run 占位） ============================

/**
 * 【dry-run 占位】真实 LLM 复盘入口。
 * 等待人工凭证（env.LLM_API_KEY / 模型 endpoint）后，把这里换成真正的复盘调用。
 * 当前无凭证：只返回占位状态，不做真实 LLM 推理。
 */
async function analyzeByLLM(_items, env = {}) {
  // 等待人工凭证后接 LLM 复盘：
  //   1) 在 env 里配置 LLM_API_KEY 与 LLM_BASE_URL / LLM_MODEL；
  //   2) 把下面的 fetch 打开，用「当日讨论清单」做 prompt；
  //   3) 让 LLM 输出：归类理由 + Top5 优化建议 + 待办，替换模板结果。
  if (!env.LLM_API_KEY) {
    return {
      status: "WAITING_CREDENTIAL",
      note: "等待人工凭证后接 LLM 复盘（当前使用本地规则抽取 + 模板总结 dry-run）",
    };
  }
  // —— 预留：真实调用示例（未启用）——
  // const resp = await fetch(env.LLM_BASE_URL, {
  //   method: "POST",
  //   headers: { Authorization: `Bearer ${env.LLM_API_KEY}`, "Content-Type": "application/json" },
  //   body: JSON.stringify({ model: env.LLM_MODEL || "gpt-4o-mini", messages: [...] }),
  // });
  return {
    status: "CREDENTIAL_PRESENT_BUT_STUB",
    note: "检测到 LLM_API_KEY，但 LLM 复盘分支尚未接线，仍走 dry-run 模板总结",
  };
}

/** 模板化 Top5 优化建议（无 LLM 时的兜底） */
function buildTop5(buckets, targetDate) {
  const { "user-need": userNeed, "ai-defect": aiDefect, "optimize-point": optimizePoint } = buckets;
  const tips = [];

  if (aiDefect.length > 0) {
    tips.push(
      `今日检出 ${aiDefect.length} 条「AI 记忆缺陷」信号（忘/重复/跨会话丢失），优先建缺陷台账：` +
      `把缺陷片段逐条登记到 knowledge/memory-review/defect-log.md，按周统计复发率。`
    );
  }
  if (userNeed.length > 0) {
    tips.push(
      `今日检出 ${userNeed.length} 条「用户记忆需求」：凡是用户说「记住/沉淀」的句子，` +
      `当场落盘到 knowledge/ 并回执 Content ID（规则：LTZZZ-${targetDate.replace(/-/g, "")}-MEM001），否则视为未完成。`
    );
  }
  if (optimizePoint.length > 0) {
    tips.push(
      `今日检出 ${optimizePoint.length} 条「优化点」线索：把索引/标签/结构化类建议排进下周记忆功能迭代 backlog。`
    );
  }

  // 常驻建议（与当日数据无关）
  tips.push(
    "对照 AI-ARCHIVE-INDEX.md 分类体系（A 观·行深·识神·元神 / B 梦·魄·醒梦 / C 身体装备·睡眠 / E AI·多Agent），" +
    "把每日记忆讨论清单自动挂到对应类目下，避免讨论散落在聊天记录里。"
  );
  tips.push(
    "跨 AI 记忆对账：同一天 GPT / Doubao / DeepSeek 对「装备、元神、识神、魄、习气」等概念的表述做差异表，" +
    "防止跨会话混淆与人设漂移。"
  );
  tips.push(
    "记忆写入分级：用户偏好类结论 → 长期记忆区；单次任务结论 → 当日 memory-review 日报；" +
    "凭证/密钥类 → 永不进仓库，只进 Secrets（与 ai-chats/README.md 脱敏红线一致）。"
  );
  tips.push(
    "每周日做一次「记忆去重与冲突合并」：把一周 memory-review 日报里重复出现的结论合并成一条长期记忆条目，" +
    "标注版本、首次日期与来源 AI，避免同一事实越记越乱。"
  );
  tips.push(
    "凭证接入：补齐 LLM_API_KEY 后，把本 worker 的模板总结替换为 analyzeByLLM() 真实复盘；" +
    "接口已预留，无需改调用方。"
  );

  return tips.slice(0, 5);
}

// ============================ 七、产出（render） ============================

function bucketLabelEn(b) {
  return { "user-need": "用户记忆需求", "ai-defect": "AI 记忆缺陷", "optimize-point": "可落地优化点", "unclassified": "记忆相关讨论（待判定）" }[b];
}

function buildMarkdown(report) {
  const { date, generatedAt, items, buckets, top5, todo, llm, stats } = report;
  const L = [];
  L.push(`# 每日长期记忆审查 · ${date}`);
  L.push("");
  L.push(`> 生成时间：${generatedAt}（UTC+8）`);
  L.push(`> 生成方式：dry-run 规则抽取（本地关键词 + 模板总结）`);
  L.push(`> LLM 复盘状态：${llm.status} — ${llm.note}`);
  L.push(`> 落盘路径：\`${outputPathFor(date)}\``);
  L.push("");
  L.push(`## 一、收集概况`);
  L.push("");
  L.push(`- 扫描聊天记录：\`${CHATS_DIR}/\`（按文件名日期 + mtime 双重判定）`);
  L.push(`- 扫描当日规划稿：\`${DAILY_PLAN_DIR}/\``);
  L.push(`- 当日候选文件：${stats.filesScanned} 个；命中记忆关键词片段：${items.length} 条`);
  L.push("");

  L.push(`## 二、当日「记忆功能讨论清单」`);
  L.push("");
  if (items.length === 0) {
    L.push("_当日候选文件中未检出长期记忆相关言论片段（无关键词命中）。_");
  } else {
    L.push(`| # | 来源文件 | AI | 命中词 | 原文片段 | 归类/摘要 |`);
    L.push(`|---|---|---|---|---|---|`);
    items.forEach((it, i) => {
      const src = it.path.replace(/^knowledge\//, "knowledge/");
      const snippet = it.snippet.replace(/\|/g, "\\|");
      const summary = `${bucketLabelEn(it.bucket)}：${it.keywords.join("、")}`;
      L.push(`| ${i + 1} | \`${src}\` | ${it.ai} | ${it.keywords.join("、")} | ${snippet} | ${summary} |`);
    });
  }
  L.push("");

  L.push(`## 三、归类`);
  L.push("");
  L.push(`### 3.1 用户已表达的记忆需求（${buckets["user-need"].length}）`);
  if (buckets["user-need"].length === 0) L.push("_无_");
  else buckets["user-need"].forEach((it, i) => L.push(`${i + 1}. \`${it.path}\`（${it.ai}）：${it.snippet}`));
  L.push("");
  L.push(`### 3.2 AI 暴露的记忆缺陷（跨会话丢失 / 混淆 / 重复）（${buckets["ai-defect"].length}）`);
  if (buckets["ai-defect"].length === 0) L.push("_无_");
  else buckets["ai-defect"].forEach((it, i) => L.push(`${i + 1}. \`${it.path}\`（${it.ai}）：${it.snippet}`));
  L.push("");
  L.push(`### 3.3 可落地的优化点（${buckets["optimize-point"].length}）`);
  if (buckets["optimize-point"].length === 0) L.push("_无_");
  else buckets["optimize-point"].forEach((it, i) => L.push(`${i + 1}. \`${it.path}\`（${it.ai}）：${it.snippet}`));
  L.push("");

  L.push(`## 四、优化建议 Top5`);
  L.push("");
  top5.forEach((t, i) => L.push(`${i + 1}. ${t}`));
  L.push("");

  L.push(`## 五、待办`);
  L.push("");
  todo.forEach((t) => L.push(`- [ ] ${t}`));
  L.push("");

  L.push(`## 六、运行参数`);
  L.push("");
  L.push(`- cron：每日 UTC+8 23:30（= UTC 15:30，\`30 15 * * *\`）`);
  L.push(`- 落盘目录：\`${OUTPUT_DIR}/\``);
  L.push(`- R2 绑定（部署后）：\`${R2_BINDING}\``);
  L.push("");
  return L.join("\n");
}

// ============================ 八、主编排（collect→extract→classify→render） ============================

async function runReview(targetDate, fileProvider, env = {}) {
  // 1) 收集
  const files = await collectTodayFiles(targetDate, fileProvider);

  // 2) 提取 + 归类
  const items = [];
  for (const f of files) {
    const text = await fileProvider.readFile(f.path);
    const snips = extractSnippets(text);
    for (const s of snips) {
      const { bucket } = classifyOne(s.snippet);
      items.push({ ...f, snippet: s.snippet, keywords: s.keywords, bucket });
    }
  }

  const buckets = {
    "user-need": items.filter((i) => i.bucket === "user-need"),
    "ai-defect": items.filter((i) => i.bucket === "ai-defect"),
    "optimize-point": items.filter((i) => i.bucket === "optimize-point"),
    "unclassified": items.filter((i) => i.bucket === "unclassified"),
  };

  // 3) 分析（LLM 复盘为 dry-run 占位）
  const llm = await analyzeByLLM(items, env);

  // 4) 总结 + 待办
  const top5 = buildTop5(buckets, targetDate);
  const todo = [
    "接入真实 LLM 凭证后，把 analyzeByLLM() 从 dry-run 切到真实复盘",
    "确认 knowledge/memory-review/ 目录已加入 git 跟踪（.gitignore 勿忽略）",
    `对照 AI-ARCHIVE-INDEX.md，把今日讨论挂到对应类目（A/B/C/E）`,
  ];

  const report = {
    date: targetDate,
    generatedAt: new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 19).replace("T", " "),
    items,
    buckets,
    top5,
    todo,
    llm,
    stats: { filesScanned: files.length, itemsFound: items.length },
  };
  report.markdown = buildMarkdown(report);
  report.outputRelPath = outputPathFor(targetDate);
  return report;
}

// ============================ 九、Cloudflare Worker 入口 ============================

export default {
  /** 每日 cron：UTC+8 23:30 = UTC 15:30 */
  async scheduled(_event, env, _ctx) {
    const date = todayUTC8();
    // 部署环境无本地 FS：当前为占位，真实数据源待 R2/KV 或 GitHub Action 快照接入
    const provider = emptyProvider();
    const report = await runReview(date, provider, env);
    // 正式落盘应写 R2：await env[R2_BINDING].put(report.outputRelPath, report.markdown)
    // —— 等待人工配置 R2 绑定后启用
    console.log(`[memory-review] ${date} files=${report.stats.filesScanned} items=${report.stats.itemsFound} (dry-run, no FS in Worker runtime)`);
    return report;
  },

  /** HTTP 入口 */
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors() });
    }

    try {
      // /status 健康检查
      if (path === "/status" && request.method === "GET") {
        return json({
          ok: true,
          worker: "ltzzz-daily-memory-review",
          cron: "30 15 * * * (UTC) = 每日 UTC+8 23:30",
          outputDir: OUTPUT_DIR,
          llm: "dry-run（等待人工凭证后接 LLM 复盘）",
          ts: Date.now(),
        }, cors());
      }

      // /review 手动触发
      if (path === "/review" && (request.method === "GET" || request.method === "POST")) {
        // 可选：配置 REVIEW_TOKEN 后要求 Bearer
        if (env.REVIEW_TOKEN) {
          const auth = request.headers.get("Authorization") || "";
          if (auth !== `Bearer ${env.REVIEW_TOKEN}`) {
            return json({ ok: false, error: "unauthorized" }, { status: 401, ...cors() });
          }
        }
        const date = url.searchParams.get("date") || todayUTC8();
        // 部署环境无本地 FS：占位 provider，真实数据源待接入
        const provider = emptyProvider();
        const report = await runReview(date, provider, env);
        return json({
          ok: true,
          date,
          outputRelPath: report.outputRelPath,
          stats: report.stats,
          llm: report.llm,
          markdown: report.markdown,
          note: "Cloudflare 运行时无本地文件系统：当前为占位结果；本地 dry-run 请用 `node ltzzz-daily-memory-review-worker.js`",
        }, cors());
      }

      return json({ ok: false, error: "not_found" }, { status: 404, ...cors() });
    } catch (e) {
      return json({ ok: false, error: "internal", detail: String((e && e.message) || e) }, { status: 500, ...cors() });
    }
  },
};

/** 部署环境占位数据源（无 FS） */
function emptyProvider() {
  return {
    async listFiles() {
      return [];
    },
    async readFile() {
      return "";
    },
  };
}

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
  };
}

function json(obj, extra = {}) {
  return new Response(JSON.stringify(obj, null, 2), {
    status: 200,
    headers: { "Content-Type": "application/json; charset=utf-8", ...extra },
  });
}

// ============================ 十、本地 dry-run CLI（Node 直跑） ============================
// 用法：node ltzzz-daily-memory-review-worker.js [YYYY-MM-DD]
// 说明：仅在直接被 node 执行时启动；Cloudflare 运行时无 process，不会进入此分支。
if (
  typeof process !== "undefined" &&
  process.argv &&
  Array.isArray(process.argv) &&
  /ltzzz-daily-memory-review-worker\.(m?js)$/.test(process.argv[1] || "")
) {
  const fs = await import("node:fs");
  const path = await import("node:path");

  // 递归列出目录下所有文件
  function listFilesRecursive(dir, base = dir) {
    const out = [];
    let entries = [];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch (_e) {
      return out;
    }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        out.push(...listFilesRecursive(full, base));
      } else if (ent.isFile()) {
        const st = fs.statSync(full);
        out.push({ path: full.split(path.sep).join("/"), name: ent.name, mtimeMs: st.mtimeMs });
      }
    }
    return out;
  }

  const fileProvider = {
    async listFiles(dir) {
      return listFilesRecursive(dir);
    },
    async readFile(p) {
      try {
        return fs.readFileSync(p, "utf8");
      } catch (_e) {
        return "";
      }
    },
  };

  const targetDate = process.argv[2] && /^\d{4}-\d{2}-\d{2}$/.test(process.argv[2])
    ? process.argv[2]
    : todayUTC8();

  const report = await runReview(targetDate, fileProvider, {});

  // 落盘：knowledge/memory-review/YYYY-MM-DD.md
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  const outFile = path.join(REPO_ROOT, report.outputRelPath);
  fs.writeFileSync(outFile, report.markdown, "utf8");

  console.log(`[memory-review] 日期=${targetDate}`);
  console.log(`[memory-review] 候选文件=${report.stats.filesScanned} 命中片段=${report.stats.itemsFound}`);
  console.log(`[memory-review] LLM 状态=${report.llm.status}（${report.llm.note}）`);
  console.log(`[memory-review] 已落盘: ${outFile}`);
}
