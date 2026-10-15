/**
 * DeepSeek 每日日课 —— GitHub Actions 侧执行器（2026-10-15）
 * 背景：CF 边缘 → api.deepseek.com 网络不通（daily worker 与 deepseek-proxy 均实测挂起/超时），
 * 而 GitHub Actions(Azure) 可达 DeepSeek（既有 autonomous/daily-economy 流程已实证）。
 * 故 deepseek-daily 的真实模型调用迁到 GH Actions cron（UTC 22:30 = CST 06:30），
 * 与 CF 侧其他六通道并存；CF 侧 deepseek-daily 保留为"如实报错"占位，不再无限挂起。
 * 规则：无 Key/调用失败一律如实落盘 dry_run/error 记录，绝不伪造成功输出。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { callAgent } from './call-deepseek.mjs';

const TODAY_CST = (() => {
  const now = new Date(Date.now() + 8 * 3600 * 1000);
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getUTCFullYear()}-${p(now.getUTCMonth() + 1)}-${p(now.getUTCDate())}`;
})();

const MEMORY_FILES = [
  'ltzzz-memory/装备论.md',
  'ltzzz-memory/魄.md',
  'ltzzz-memory/识神.md',
  'ltzzz-memory/项目历史.md',
  'ltzzz-memory/重要事件.md',
];

function readMemory() {
  const sections = [];
  for (const f of MEMORY_FILES) {
    try {
      if (!existsSync(f)) continue;
      const raw = readFileSync(f, 'utf8');
      sections.push(`### ${f}\n${raw.slice(0, 4000)}`);
    } catch {}
  }
  return sections.join('\n\n').slice(0, 12000) || '（仓库记忆文件缺失，以通用对照作答）';
}

const PROMPT = `阅读以下 LTZZZ 仓库记忆后，对照“中华传统文化”（如道家/佛家/中医等）与“装备论”（三维装备、魄含尸狗、识神/元神、习气、网状因果）的相同点与不同点，写 1 条对照记录。要求：观点清晰、逻辑顺畅、篇幅 400 字左右，直接输出对照记录正文，不要客套。

【仓库记忆】
${readMemory()}`;

const apiKey = process.env.DEEPSEEK_API_KEY || '';
const model = process.env.DEEPSEEK_MODEL || 'deepseek-flash';

const ai = await callAgent({ apiKey, prompt: PROMPT, model, maxTokens: 2400 });

const body =
  `# DeepSeek 每日 · ${TODAY_CST}\n\n` +
  `> dry_run=${ai.dry_run ? 'true' : 'false'}　status=${ai.status || 'live'}　model=${model}　生成时间(UTC+8)：${new Date().toISOString()}\n\n` +
  (ai.ok && ai.output
    ? `## 中华传统文化 × 装备论（每日 1 条对照）\n\n${ai.output}\n`
    : `> 本日无真实模型输出：${ai.error || 'unknown'}。不据此声称任务完成。\n`);

const path = `knowledge/daily/deepseek/${TODAY_CST}.md`;
writeFileSync(path, body, 'utf8');
console.log(JSON.stringify({
  task: 'deepseek-daily',
  ok: true,
  path,
  dry_run: !!ai.dry_run,
  status: ai.status || 'live',
  model,
  error: ai.error || null,
  tokens_used: ai.tokens_used ?? null,
}));
