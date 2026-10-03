#!/usr/bin/env node
/**
 * build-daily-data.js — LTZZZ 前端数据生成器（v1.1）
 * ---------------------------------------------------------------
 * 读取 results/daily/YYYY-MM-DD.md（按文件名取最新一日）：
 *   ## 📊 总览      → summary + ais[]      （| AI | 状态 | 今日产出 | 错误 |）
 *   ## 🟡 发布状态  → publish[]            （| 平台 | 状态 | 说明 |）
 *   ## 📋 下一步    → next_steps[]         （1. ... 有序列表）
 * 读取 memory/state/CURRENT.json          → memory {}（state_id / files_read / gateway）
 * 输出 daily-data.json（仓库根，供 daily.html fetch）
 *
 * 用法：node scripts/build-daily-data.js
 * 状态映射：🟢→ok  🟡→waiting  🔴→blocked  ⚪→off  （与 daily.html STATUS_MAP 一致）
 * 诚实约束：ai_calls_realized 只在确认真实外部 API 调用时置 true；无证据一律 false。
 */

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DAILY_DIR = path.join(ROOT, "results", "daily");
const OUT = path.join(ROOT, "daily-data.json");
const CURRENT_MEM = path.join(ROOT, "memory", "state", "CURRENT.json");
const GATEWAY_URL = "https://ltzzz-memory-gateway.ltzyz2181.workers.dev";

const STATUS_EMOJI = { "🟢": "ok", "🟡": "waiting", "🔴": "blocked", "⚪": "off" };
const STATUS_LABEL = { ok: "🟢 已执行", waiting: "🟡 等凭证", blocked: "🔴 等 API", off: "⚪ 未启用" };

function latestDailyFile() {
  if (!fs.existsSync(DAILY_DIR)) return null;
  const files = fs
    .readdirSync(DAILY_DIR)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
    .sort();
  return files.length ? files[files.length - 1] : null;
}

function parseTableRows(lines, startIdx) {
  const rows = [];
  for (let i = startIdx; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue; // 跳过空行（表格前常有空行）
    if (!line.startsWith("|")) break;
    const cells = line
      .slice(1, -1)
      .split("|")
      .map((c) => c.trim());
    if (cells.every((c) => c.includes("-"))) continue; // 分隔行
    if (cells.length < 2) continue;
    rows.push(cells);
  }
  return rows;
}

function pickSection(lines, markers) {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].startsWith("##") && markers.some((m) => lines[i].includes(m))) {
      return i;
    }
  }
  return -1;
}

function build() {
  const fileName = latestDailyFile();
  if (!fileName) {
    console.error("[build-daily-data] no daily result found, keeping existing daily-data.json");
    process.exit(0);
  }
  const date = fileName.replace(/\.md$/, "");
  const text = fs.readFileSync(path.join(DAILY_DIR, fileName), "utf8");
  const lines = text.split("\n");

  // --- 总览表 ---
  const ais = [];
  let summary = { ais_total: 0, ais_ok: 0, ais_waiting: 0, ais_blocked: 0, ais_off: 0, ais_unknown: 0 };
  const overviewIdx = pickSection(lines, ["总览", "总览表"]);
  if (overviewIdx >= 0) {
    const rows = parseTableRows(lines, overviewIdx + 1);
    for (const cells of rows) {
      const [name, statusCell, output = "", error = ""] = cells;
      if (!name || !statusCell) continue;
      if (["AI", "平台", "通道"].includes(name.trim())) continue; // 表头行
      const emoji = [...statusCell.trim()][0] || "";
      const status = STATUS_EMOJI[emoji] || "unknown";
      summary.ais_total += 1;
      summary[`ais_${status}`] = (summary[`ais_${status}`] || 0) + 1;
      ais.push({
        name: name.replace(/^\s*\*\*|\*\*\s*$/g, "").trim(),
        status,
        statusText: STATUS_LABEL[status] || statusCell.trim(),
        output: output.replace(/^—+$/, "").trim(),
        error: error.replace(/^—+$/, "").trim(),
      });
    }
  }

  // --- 发布状态表 ---
  const publish = [];
  const pubIdx = pickSection(lines, ["发布状态", "🟡 发布"]);
  if (pubIdx >= 0) {
    const rows = parseTableRows(lines, pubIdx + 1);
    for (const cells of rows) {
      const [channel, statusCell, note = ""] = cells;
      if (!channel || !statusCell) continue;
      if (["AI", "平台", "通道"].includes(channel.trim())) continue; // 表头行
      const emoji = [...statusCell.trim()][0] || "";
      const status = STATUS_EMOJI[emoji] || "unknown";
      publish.push({ channel: channel.trim(), status, statusText: STATUS_LABEL[status] || statusCell.trim(), note: note.replace(/^—+$/, "").trim() });
    }
  }

  // --- 下一步 ---
  const nextSteps = [];
  const nextIdx = pickSection(lines, ["下一步", "📋 下一步"]);
  if (nextIdx >= 0) {
    for (let i = nextIdx + 1; i < lines.length; i++) {
      const m = lines[i].trim().match(/^\s*(?:\d+[.、]|[-*])\s*(.+)/);
      if (m) nextSteps.push(m[1].trim());
      else if (lines[i].trim() && lines[i].startsWith("##")) break;
    }
  }

  // --- Memory 快照 ---
  let memory = { state_id: null, files_read: 0, gateway_url: GATEWAY_URL };
  try {
    const mem = JSON.parse(fs.readFileSync(CURRENT_MEM, "utf8"));
    memory = {
      state_id: mem.memory_id || null,
      files_read: Array.isArray(mem.files_read) ? mem.files_read.length : 0,
      gateway_url: GATEWAY_URL,
      files_missing: Array.isArray(mem.files_missing) ? mem.files_missing.length : 0,
    };
  } catch (_e) {
    /* CURRENT.json 缺失时保留默认值 */
  }

  const data = {
    date,
    generated_at: new Date().toISOString(),
    source: `results/daily/${fileName}`,
    schema_version: "1.1",
    honesty: {
      ai_calls_realized: false,
      note: "JSON 由 Markdown 日报静态生成；外部 AI 真实调用状态以 md 内文字与 results/executions 为准。",
    },
    memory,
    summary,
    ais,
    publish,
    next_steps: nextSteps,
  };

  fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + "\n", "utf8");
  console.log(
    `[build-daily-data] ok -> ${OUT}\n  date=${date} ais=${ais.length} publish=${publish.length} next=${nextSteps.length} memory_files=${memory.files_read}`,
  );
}

build();
