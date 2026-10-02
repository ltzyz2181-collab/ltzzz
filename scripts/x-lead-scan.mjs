#!/usr/bin/env node
// LTZZZ X Lead Scan — prop_grok_003 交付物（豆包执行，2026-10-02）
// 用途：每日 X 线索扫描 → 结构化表 → knowledge/results/YYYY-MM-DD-x-lead-scan.md
// 用法：node scripts/x-lead-scan.mjs ["query1|query2|..."] [max_per_query]
// 示例：node scripts/x-lead-scan.mjs
//       node scripts/x-lead-scan.mjs "AI agent wallet|agent economy" 15
// Token：运行时从 ltzzz-secrets.md 读取（第 58 行 X Bearer Token），永不写入本文件/对话/commit。
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..");
const SECRETS = path.join(REPO_ROOT, "ltzzz-secrets.md");
const OUT_DIR = path.join(REPO_ROOT, "knowledge", "results");

const DEFAULT_QUERIES = [
  '"AI agent" wallet',
  "agent economy payment",
  '"AI agent" hire service',
  "agent-to-agent settlement",
  "LLM agent spending budget",
];

function todayStr() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}-${p(d.getUTCHours())}${p(d.getUTCMinutes())}`;
}

function getBearerToken() {
  const raw = fs.readFileSync(SECRETS, "utf8");
  const line = raw.split(/\r?\n/).find((l) => l.includes("Bearer Token"));
  if (!line) throw new Error("secrets: X Bearer Token not found");
  const m = line.match(/Bearer Token[:：]\s*(\S+)/);
  if (!m) throw new Error("secrets: X Bearer Token parse failed");
  return m[1];
}

async function searchX(query, maxResults, token) {
  const url = new URL("https://api.x.com/2/tweets/search/recent");
  url.searchParams.set("query", query);
  url.searchParams.set("max_results", String(Math.min(maxResults, 100)));
  url.searchParams.set("tweet.fields", "author_id,created_at,public_metrics");
  url.searchParams.set("expansions", "author_id");
  url.searchParams.set("user.fields", "username,name");
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`X API ${res.status}: ${body.slice(0, 300)}`);
  }
  return res.json();
}

// 简单规则筛选：排除明显广告/招聘/作业号；保留找公司/真实需求/痛点信号
const EXCLUDE_PATTERNS = /(follow me|DM for|paid promo|promote|signup.*earn|#ad|sponsored|hire me to|looking for writers to|essay|assignment)/i;
const INCLUDE_PATTERNS = /(looking for|need|help|hire|build|evaluate|replace|integrate|agent|automation|workflow|payment|wallet|revenue|cost)/i;

function scoreTweet(t, users) {
  const txt = (t.text || "").toLowerCase();
  if (EXCLUDE_PATTERNS.test(txt)) return null;
  if (!INCLUDE_PATTERNS.test(txt)) return null;
  const u = users?.[t.author_id];
  let score = 0;
  if (/looking for|need|help|hire|evaluate|replace|integrate|build/.test(txt)) score += 2;
  if (/agent|automation|workflow|payment|wallet|revenue|cost/.test(txt)) score += 1;
  const likes = t.public_metrics?.like_count ?? 0;
  if (likes > 0) score += 0.5;
  return {
    score,
    author: u?.username || t.author_id,
    name: u?.name || t.author_id,
    url: `https://x.com/${u?.username || t.author_id}/status/${t.id}`,
    snippet: t.text.slice(0, 200),
    created: t.created_at,
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter((i) => {
    const k = i.author + i.snippet.slice(0, 40);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function renderMarkdown(rows, queries) {
  const lines = [];
  lines.push(`# X Lead Scan — ${todayStr()}`);
  lines.push("");
  lines.push(`> 生成：scripts/x-lead-scan.mjs · prop_grok_003 交付物 · 查询：${queries.join(" / ")}`);
  lines.push("> 优先级：A=明确找公司/要方案，B=痛点/抱怨可切入，C=定位情报");
  lines.push("");
  if (rows.length === 0) {
    lines.push("_本日无可筛选线索。_");
    lines.push("");
    return lines.join("\n");
  }
  rows.forEach((r, i) => {
    const grade = r.score >= 2.5 ? "A" : r.score >= 1.5 ? "B" : "C";
    lines.push(`### ${grade} · ${i + 1} · @${r.author}`);
    lines.push(`- 链接：${r.url}`);
    lines.push(`- 为何：${r.snippet}`);
    lines.push("");
  });
  return lines.join("\n");
}

async function main() {
  const qArg = process.argv[2];
  const maxRaw = parseInt(process.argv[3] || "10", 10);
  const queries = qArg ? qArg.split("|").filter(Boolean) : DEFAULT_QUERIES;
  const token = getBearerToken();
  const all = [];
  for (const q of queries) {
    try {
      const data = await searchX(q, maxRaw, token);
      const users = Object.fromEntries((data.includes?.users || []).map((u) => [u.id, u]));
      const scored = (data.data || []).map((t) => scoreTweet(t, users)).filter(Boolean);
      all.push(...scored);
    } catch (e) {
      console.error(`[warn] query "${q}" failed: ${e.message}`);
    }
  }
  const rows = dedupe(all).sort((a, b) => b.score - a.score).slice(0, 30);
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const file = path.join(OUT_DIR, `${todayStr()}-x-lead-scan.md`);
  fs.writeFileSync(file, renderMarkdown(rows, queries), "utf8");
  console.log(`WROTE=${file}`);
  console.log(`ROWS=${rows.length}`);
  rows.slice(0, 10).forEach((r) => console.log(`- [${r.score}] @${r.author} ${r.url}`));
}

main().catch((e) => { console.error("FATAL=" + e.message); process.exit(1); });
