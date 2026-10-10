// Daily AI-hires-AI seat jobs (ledger only): GPT employer hires Doubao / DeepSeek / Kimi-CN for real model deliverables.
// Each job: post → bid → deliver (real API output) → rule audit by another DID → settle (internal_credit) → receipt with model metadata.
import fs from 'node:fs';
import { Subnet } from './subnet.mjs';
import { callAgent as deepseek } from '../call-deepseek.mjs';
import { callAgent as doubao } from '../call-doubao.mjs';
const root = process.env.LTZZZ_ROOT || process.cwd();
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const read = (p, n) => { try { return fs.readFileSync(`${root}/${p}`, 'utf8').slice(0, n); } catch { return ''; } };
const redact = (t) => t.replace(/0x[a-fA-F0-9]{40,}/g, '0x[已脱敏]');
async function kimiCN({ apiKey, prompt, maxTokens = 1500 }) {
  maxTokens = Math.max(maxTokens, 6000);
  return kimiCall({ apiKey, prompt, maxTokens });
}
async function kimiCall({ apiKey, prompt, maxTokens }) {
  if (!apiKey) return { ok: false, status: 'not_configured', error: 'MOONSHOT_API_KEY_CN 未配置' };
  try {
    const r = await fetch('https://api.moonshot.cn/v1/chat/completions', { method: 'POST', signal: AbortSignal.timeout(120000),
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model: process.env.KIMI_CN_MODEL || 'kimi-k2.6', messages: [{ role: 'user', content: prompt }], max_tokens: maxTokens }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { ok: false, status: 'api_error', error: `HTTP ${r.status}: ${JSON.stringify(j).slice(0, 200)}` };
    const output = (j.choices?.[0]?.message?.content || '').trim();
    if (!output) return { ok: false, status: 'empty_output', error: `finish_reason=${j.choices?.[0]?.finish_reason}（推理模型可能耗尽 max_tokens）`, tokens_used: j.usage?.total_tokens || 0 };
    return { ok: true, status: 'success', output, tokens_used: j.usage?.total_tokens || 0 };
  } catch (e) { return { ok: false, status: 'exception', error: String(e) }; }
}
const ledger = redact(JSON.stringify(JSON.parse(read('data/agi-econ/state.json', 200000) || '{}').capital_pool || {}, null, 1)).slice(0, 2500);
const receipts = fs.existsSync(`${root}/data/agi-econ/receipts`) ? fs.readdirSync(`${root}/data/agi-econ/receipts`).slice(-5).map((f) => redact(read(`data/agi-econ/receipts/${f}`, 800))).join('\n') : '';
const article = read(`content/daily-articles/${day}.md`, 3000) || read(`content/daily-articles/${new Date(Date.now() - 16 * 3600e3).toISOString().slice(0, 10)}.md`, 3000);
const JOBS = [
  { seat: 'did:ltzzz:deepseek', model: 'deepseek', key: 'DEEPSEEK_API_KEY', fn: deepseek, title: `ledger analysis ${day}`, mark: '# 子网账本分析',
    prompt: `你是被 GPT 总控雇佣的 DeepSeek（内部记账报酬）。分析 LTZZZ AI 经济子网账本：资本池、近期 receipt。输出以「# 子网账本分析」开头：1) 资金流向与异常（只基于数据）2) 资本AI 影子提案是否合理 3) 下一步 3 条可测试建议。全部只是建议，不得声称执行了任何投资。\n\n资本池：${ledger}\n\n近期回执：${receipts}` },
  { seat: 'did:ltzzz:kimi', model: 'kimi-cn', key: 'MOONSHOT_API_KEY_CN', fn: kimiCN, title: `memory fact-check ${day}`, mark: '# 记忆事实核查',
    prompt: `你是被 GPT 总控雇佣的 Kimi（国内）。对下面 LTZZZ 当日文章做中文事实核查，对照项目历史原文。输出以「# 记忆事实核查」开头：逐条列出「文章说法 → 依据/无依据 → 建议修改」，最多 8 条，最后给可信度评分(0-100)。\n\n=== 文章 ===\n${article}\n\n=== 项目历史（节选，末尾）===\n${read('ltzzz-memory/项目历史.md', 60000).slice(-4000)}` },
  { seat: 'did:ltzzz:doubao', model: 'doubao', key: 'DOUBAO_API_KEY', fn: doubao, title: `video script ${day}`, mark: '# 短视频脚本',
    prompt: `你是被 GPT 总控雇佣的豆包。把下面 LTZZZ 当日文章改成一条 9:16、≤60秒的中文短视频脚本，输出以「# 短视频脚本」开头，含：标题、分镜(时间/画面/口播)、字幕要点、AI生成声明。只用文章事实，不出现地址或密钥。\n\n${article}` },
];
const s = new Subnet(root);
const out = [];
for (const [did, roles] of [['did:ltzzz:gpt', ['employer']], ['did:ltzzz:claude', ['auditor']], ['did:ltzzz:qianwen', ['auditor']], ['did:ltzzz:deepseek', ['worker']], ['did:ltzzz:kimi', ['worker']], ['did:ltzzz:doubao', ['worker']]]) s.register({ did, roles });
for (const j of JOBS) {
  if (Object.values(s.state.tasks).some((t) => t.title === j.title)) { out.push({ seat: j.seat, status: 'already_ran' }); continue; }
  if (!process.env[j.key]) { out.push({ seat: j.seat, model: j.model, api: 'not_configured', missing_secret: j.key }); continue; } // no hire without capability
  const emp = s.state.agents['did:ltzzz:gpt']; if (emp.credit_usd < 0.05) emp.credit_usd = 5; // internal credit only
  const t = s.postTask({ employer: 'did:ltzzz:gpt', title: j.title, spec: j.mark, budget_usd: 0.05, acceptance: [j.mark] });
  if (s.state.agents[j.seat].reputation < 20) { out.push({ seat: j.seat, status: 'reputation_too_low' }); continue; }
  s.bid(t.id, j.seat, 0.03); s.award(t.id);
  const r = process.env[j.key] ? await j.fn({ apiKey: process.env[j.key], prompt: j.prompt, maxTokens: 1800 }) : { ok: false, status: 'not_configured', error: `${j.key} 未配置` };
  const body = r.ok ? redact(r.output) : `# 交付失败\n\nstatus: ${r.status}\nerror: ${String(r.error || '').slice(0, 300)}\n`;
  s.deliver(t.id, j.seat, body);
  const auditor = j.seat === 'did:ltzzz:kimi' ? 'did:ltzzz:qianwen' : 'did:ltzzz:claude';
  s.audit(t.id, auditor, (b) => b.includes(j.mark) && b.length > 300, { model: 'rule-check', note: '规则审计：标题标记+长度；模型交叉审计见 run-cycle' });
  const rc = s.settle(t.id);
  rc.worker_model = { model: j.model, status: r.status, ok: !!r.ok, tokens_used: r.tokens_used || 0, error: r.ok ? undefined : String(r.error || '').slice(0, 200) };
  fs.writeFileSync(`${root}/${s.state.tasks[t.id].receipt}`, JSON.stringify(rc, null, 2) + '\n');
  out.push({ seat: j.seat, task: t.id, model: j.model, api: r.status, accepted: rc.accepted, receipt: s.state.tasks[t.id].receipt });
}
s.save();
fs.mkdirSync(`${root}/results/agi-econ`, { recursive: true });
fs.writeFileSync(`${root}/results/agi-econ/seat-jobs-${day}.json`, JSON.stringify({ day, run_id: process.env.GITHUB_RUN_ID || 'local', jobs: out }, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));
