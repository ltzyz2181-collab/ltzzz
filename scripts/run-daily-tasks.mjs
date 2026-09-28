#!/usr/bin/env node
/**
 * run-daily-tasks.mjs — LTZZZ 六通道每日任务编排（JSON 持久化版）
 * -----------------------------------------------------------------
 * 流程（对每个已部署通道）：
 *   1. 读 data/memory/<agent>.json（缺失则建种子）
 *   2. 从 data/tasks/daily-tasks.json 取当日任务定义
 *   3. prompt = 任务 + context_summary + 最近 3 条 entries
 *   4. 调用 scripts/call-<module>.mjs（密钥只来自环境变量 / GitHub Secrets）
 *   5. 成功 → 追加 entry、更新 context_summary、写回；失败 → 记 failures，不伪造
 * 收尾：写 data/results/YYYY-MM-DD.json + data/reports/latest.md
 *
 * 微软席：默认不部署（MICROSOFT_ENABLED=true 时才执行），results 记 skipped。
 * 用法：node scripts/run-daily-tasks.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(ROOT, "data");

function pad(n) { return String(n).padStart(2, "0"); }
function todayCST() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}
function nowCST() {
  const d = new Date(Date.now() + 8 * 3600 * 1000);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}+08:00`;
}

const today = todayCST();
const MICROSOFT_ENABLED = process.env.MICROSOFT_ENABLED === "true";

// 通道 → 调用模块 / 密钥名 / 每日任务文案
const CHANNELS = [
  { agent: "gpt", module: "call-openai.mjs", key: "OPENAI_API_KEY",
    task: "读取仓库内容（knowledge/、articles/、protocol/），规划并记录一条任务；对记忆/任务模板做一次小修订（以 proposal 形式提出，不伪造已落地）" },
  { agent: "doubao", module: "call-doubao.mjs", key: "DOUBAO_API_KEY",
    task: "读取仓库内容，整理一次；产出一份视频脚本草稿（≤60 秒、9:16、中文口播，围绕装备论/观行深主题）" },
  { agent: "grok", module: "call-grok.mjs", key: "XAI_API_KEY",
    task: "读取仓库内容，记录一条「AI 对心理健康某方面的实际作用」（装备论视角：三维装备/魄含尸狗/识神元神/习气/网状因果）；并对 App/Web3 代码（app.html、wallet-lab.html、contracts/）提出 polish 提案" },
  { agent: "claude", module: "call-claude.mjs", key: "ANTHROPIC_API_KEY",
    task: "读取仓库内容，写一段不少于 50 字的小说片段，承接前日连载（逐日连续积累，备写网文）" },
  { agent: "deepseek", module: "call-deepseek.mjs", key: "DEEPSEEK_API_KEY",
    task: "读取仓库内容，对照中华传统文化（道家/佛家/中医等）与项目理念（装备论：观/行深/三维装备/魄/识神/习气/网状因果），记录一条异同" },
  ...(MICROSOFT_ENABLED
    ? [{ agent: "microsoft", module: "call-microsoft.mjs", key: "MICROSOFT_API_KEY",
        task: "读取仓库内容，对照西方文化（身心二元/个体主义/现代心理与医学）与项目理念（装备论），记录一条异同" }]
    : []),
];

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function readJson(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return fallback; }
}

function writeJson(p, obj) {
  ensureDir(path.dirname(p));
  fs.writeFileSync(p, JSON.stringify(obj, null, 2) + "\n", "utf8");
}

async function main() {
  ensureDir(path.join(DATA, "memory"));
  ensureDir(path.join(DATA, "results"));
  ensureDir(path.join(DATA, "reports"));

  const taskDefs = readJson(path.join(DATA, "tasks", "daily-tasks.json"), { tasks: [] });
  const tasks = [];
  const failures = [];
  const userActionRequired = [];

  for (const ch of CHANNELS) {
    const memPath = path.join(DATA, "memory", `${ch.agent}.json`);
    const mem = readJson(memPath, { agent: ch.agent, last_updated: null, context_summary: "", entries: [], constraints: [] });
    const def = taskDefs.tasks?.find((t) => t.agent === ch.agent);
    const last3 = mem.entries.slice(-3).map((e) => `[${e.date}] ${e.task}：${String(e.output).slice(0, 200)}`).join("\n");

    const prompt =
      `今天是 ${today}（UTC+8）。你的每日任务：${ch.task}\n\n` +
      `长期记忆摘要（context_summary）：${mem.context_summary || "（空）"}\n\n` +
      (last3 ? `最近产出（续上下文）：\n${last3}\n\n` : "") +
      `请直接输出当日产出，不需要解释过程。`;

    let mod;
    try { mod = await import(`./${ch.module}`); }
    catch (e) {
      failures.push({ agent: ch.agent, status: "load_error", error: String(e) });
      tasks.push({ agent: ch.agent, task: ch.task, status: "load_error", output_preview: "", full_output_file: `data/memory/${ch.agent}.json` });
      continue;
    }

    const res = await mod.callAgent({ apiKey: process.env[ch.key] || "", prompt });
    if (res.ok) {
      mem.entries.push({ date: today, task: ch.task, output: res.output, tokens_used: res.tokens_used || 0 });
      mem.context_summary = `${ch.agent} ${today}：${res.output.slice(0, 140)}`;
      mem.last_updated = nowCST();
      writeJson(memPath, mem);
      tasks.push({ agent: ch.agent, task: ch.task, status: "success", output_preview: res.output.slice(0, 120), full_output_file: `data/memory/${ch.agent}.json` });
      console.log(`[run-daily-tasks] ${ch.agent}: success`);
    } else {
      failures.push({ agent: ch.agent, task: ch.task, status: res.status, error: res.error });
      tasks.push({ agent: ch.agent, task: ch.task, status: res.status, output_preview: res.status === "not_configured" ? "无 API Key，未调用（dry-run）" : "调用失败，见 failures", full_output_file: `data/memory/${ch.agent}.json` });
      console.log(`[run-daily-tasks] ${ch.agent}: ${res.status}`);
    }
  }

  // 微软席（未启用时）在结果中显式标注 skipped
  if (!MICROSOFT_ENABLED) {
    tasks.push({
      agent: "microsoft", task: "西方文化 × 项目理念 异同 1 条",
      status: "skipped",
      output_preview: "按用户指示暂不部署（Copilot API 面向企业 M365）",
      full_output_file: "data/memory/microsoft.json",
    });
    userActionRequired.push("确认微软席执行方案：A. 委托 GPT/Claude 执行（results 标注 executed_by）；B. 申请 Microsoft 365 Copilot API");
  }

  const result = {
    date: today,
    generated_at: nowCST(),
    tasks,
    failures,
    user_action_required: userActionRequired,
  };
  writeJson(path.join(DATA, "results", `${today}.json`), result);

  // 每日报告
  const lines = [
    `# LTZZZ 每日报告 · ${today}`,
    "",
    "## 各 AI 状态",
    "",
    "| AI | 状态 | 产出预览 |",
    "|---|---|---|",
    ...tasks.map((t) => `| ${t.agent} | ${t.status} | ${String(t.output_preview || "").replace(/\|/g, "\\|").slice(0, 80)} |`),
    "",
    failures.length ? `## 失败/未配置\n\n${failures.map((f) => `- ${f.agent}: ${f.status} — ${f.error}`).join("\n")}\n` : "",
    userActionRequired.length ? `## 需要用户操作\n\n${userActionRequired.map((u) => `- [ ] ${u}`).join("\n")}\n` : "",
  ];
  fs.writeFileSync(path.join(DATA, "reports", "latest.md"), lines.join("\n"), "utf8");
  console.log(`[run-daily-tasks] done -> data/results/${today}.json, data/reports/latest.md`);
}

main().catch((e) => {
  console.error("[run-daily-tasks] fatal:", e);
  process.exit(1);
});
