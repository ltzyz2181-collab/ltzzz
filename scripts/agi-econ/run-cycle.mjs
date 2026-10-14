// Daily AI-hires-AI cycle (ledger only). Repo review (DeepSeek) + seat jobs (DeepSeek ledger / Kimi-CN fact-check / Doubao script).
// Every job: real worker model output → independent model audit (different DID) → gate → settle or block.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { Subnet, MEMORY_GATE } from './subnet.mjs';
import { hire } from './hire.mjs';
import { callAgent as deepseek } from '../call-deepseek.mjs';
import { callAgent as grok } from '../call-grok.mjs';
import { callAgent as doubao } from '../call-doubao.mjs';
import { kimiCN } from './kimi-cn.mjs';
const root = process.env.LTZZZ_ROOT || process.cwd();
const day = new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10);
const read = (p, n) => { try { return fs.readFileSync(`${root}/${p}`, 'utf8').slice(0, n); } catch { return ''; } };
const E = process.env;
const s = new Subnet(root);
for (const [did, roles] of [['did:ltzzz:gpt', ['employer']], ['did:ltzzz:grok', ['auditor']], ['did:ltzzz:kimi', ['worker', 'auditor']],
  ['did:ltzzz:deepseek', ['worker', 'capital', 'auditor']], ['did:ltzzz:doubao', ['worker', 'auditor']]]) {
  const a = s.register({ did, roles }); for (const r of roles) if (!a.roles.includes(r)) a.roles.push(r);
}
const AUD = [
  { model:'deepseek',did:'did:ltzzz:deepseek',fn:deepseek,key:E.DEEPSEEK_API_KEY,maxTokens:8192 },
  { model:'doubao',did:'did:ltzzz:doubao',fn:doubao,key:E.DOUBAO_API_KEY,maxTokens:8192 },
  { model: 'kimi-cn', did: 'did:ltzzz:kimi', fn: kimiCN, key: E.MOONSHOT_API_KEY_CN,maxTokens:6000 },
  { model: 'xai', did: 'did:ltzzz:grok', fn: grok, key: E.XAI_API_KEY,maxTokens:3000 },
];
let log = ''; try { log = execSync('git log --since="24 hours ago" --pretty=format:"- %h %s" | head -60', { cwd: root, encoding: 'utf8' }); } catch {}
const n = log ? log.split('\n').filter(Boolean).length : 0;
const capital = JSON.stringify(s.state.capital_pool || {}, null, 1).slice(0, 2500);
const article = read(`content/daily-articles/${day}.md`, 3500) || read(`content/daily-articles/${new Date(Date.now() - 16 * 3600e3).toISOString().slice(0, 10)}.md`, 3500);
const hist = read('ltzzz-memory/项目历史.md', 80000).slice(-4000);
const jobs = [
  { worker: 'did:ltzzz:deepseek', workerModel: 'deepseek', workerCall: deepseek, workerKey: E.DEEPSEEK_API_KEY, title: `repo review ${day} gate`, mark: '# AI Repo Review',
    spec: `评审过去24h仓库提交（共 ${n} 条），每条事实注明 commit 短哈希，区分已完成/提议，给3条AI雇佣AI建议`, source: log,
    prompt: `以「# AI Repo Review」开头，用简体中文评审下列 ${n} 条提交：1) 实际完成了什么（注明短哈希）2) 哪些只是提议/未验证 3) 3条AI雇佣AI下一步。只写有依据的事实，不说资金已执行。\n\n${log.slice(0, 5000)}` },
  { worker: 'did:ltzzz:deepseek', workerModel: 'deepseek', workerCall: deepseek, workerKey: E.DEEPSEEK_API_KEY, title: `ledger analysis ${day} gate`, mark: '# 子网账本分析',
    spec: '分析子网资本池与影子提案，给3条可测试建议，不得声称执行投资', source: capital,
    prompt: `以「# 子网账本分析」开头：1) 资金流向与异常 2) 影子提案是否合理 3) 3条可测试建议。只基于数据，不声称执行投资。\n\n${capital}` },
  { worker: 'did:ltzzz:kimi', workerModel: 'kimi-cn', workerCall: kimiCN, workerKey: E.MOONSHOT_API_KEY_CN, title: `memory fact-check ${day} gate`, mark: '# 记忆事实核查',
    spec: '对当日文章逐条核查是否有项目历史依据，最多8条，给可信度评分', source: `${article}\n\n${hist}`,
    prompt: `以「# 记忆事实核查」开头，逐条列出「文章说法 → 依据/无依据 → 建议修改」，最多8条，最后给可信度评分(0-100)。\n\n=== 文章 ===\n${article}\n\n=== 项目历史节选 ===\n${hist}` },
  { worker: 'did:ltzzz:doubao', workerModel: 'doubao', workerCall: doubao, workerKey: E.DOUBAO_API_KEY, title: `video script ${day} gate`, mark: '# 短视频脚本',
    spec: '把当日文章改成9:16 ≤60秒中文短视频脚本（标题/分镜/字幕/AI生成声明），只用文章事实', source: article,
    prompt: `以「# 短视频脚本」开头，把下文改成9:16、≤60秒中文短视频脚本：标题、分镜(时间/画面/口播)、字幕要点、AI生成声明。只用文章事实，不出现地址或密钥。\n\n${article}` },
];
// Include bounded, attributable Memory excerpts in the existing audit request; no extra API calls.
const memoryContext = MEMORY_GATE.map((p) => `=== ${p} ===\n${read(p, 400)}`).join('\n');
const out = [];
for (const j of jobs) { try { out.push(await hire(s, { ...j, source: `${j.source}\n\n=== Memory excerpts (bounded; not full read) ===\n${memoryContext}`, auditors: AUD })); } catch (e) { out.push({ title: j.title, status: 'error', error: String(e.message || e) }); } }
const cap = s.state.capital_pool.balance_usd > 0 ? s.capitalProposal('did:ltzzz:deepseek', { max_share: 0.5, thesis: '影子提案：稳定币借贷收益，仅记账不执行' }) : null;
s.save();
fs.mkdirSync(`${root}/results/agi-econ`, { recursive: true });
fs.writeFileSync(`${root}/results/agi-econ/cycle-${day}.json`, JSON.stringify({ day, run_id: E.GITHUB_RUN_ID || 'local', jobs: out, capital_proposal: cap?.id || null }, null, 2) + '\n');
console.log(JSON.stringify(out, null, 2));

