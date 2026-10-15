/**
 * DeepSeek 每日日课 —— GitHub Actions 侧执行器（2026-10-15）
 * 背景：CF 边缘 → api.deepseek.com 网络不通（daily worker 与 deepseek-proxy 均实测挂起/超时），
 * 而 GitHub Actions(Azure) 可达 DeepSeek（本次实证：dry_run=false，连接成功）。
 * 2026-10-15 首次验证：流式(stream:true)被 runner 出口代理截断（stream_interrupted/response_read_failed），
 * 故改用非流式(stream:false)短连接（与 deepseek-proxy 同款），更稳。
 * 规则：无 Key/调用失败一律如实落盘 dry_run/error 记录，绝不伪造成功输出。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';

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

// 非流式短连接调用（stream:false），避免 runner 出口代理截断长流
let ai;
if (!apiKey) {
  ai = { dry_run: true, ok: false, status: 'not_configured', error: 'DEEPSEEK_API_KEY 未配置', tokens_used: null };
} else {
  try {
    const resp = await fetch('https://api.deepseek.com/v1/chat/completions', {
      method: 'POST',
      signal: AbortSignal.timeout(240000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: '你是 LTZZZ 数字实验室的 AI 助手，简洁、直接、有深度。' },
          { role: 'user', content: PROMPT },
        ],
        max_tokens: 2400,
        temperature: 0.4,
        stream: false,
      }),
    });
    if (!resp.ok) {
      ai = { dry_run: false, ok: false, status: 'api_error', error: `HTTP ${resp.status}`, tokens_used: null, request_id: resp.headers.get('x-request-id') || resp.headers.get('x-ds-request-id') || null };
    } else {
      const data = await resp.json();
      if (data.error) {
        ai = { dry_run: false, ok: false, status: 'provider_error', error: data.error.message || 'provider_stream_error', tokens_used: null };
      } else {
        const content = typeof data.choices?.[0]?.message?.content === 'string' ? data.choices[0].message.content.trim() : '';
        ai = {
          dry_run: false,
          ok: !!content,
          status: content ? 'success' : 'empty_output',
          error: content ? null : 'empty_output',
          output: content,
          tokens_used: data.usage?.total_tokens ?? null,
          request_id: data.id || null,
        };
      }
    }
  } catch (e) {
    ai = { dry_run: false, ok: false, status: 'exception', error: String(e?.message || e).slice(0, 120), tokens_used: null };
  }
}

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
  request_id: ai.request_id ?? null,
  tokens_used: ai.tokens_used ?? null,
}));
