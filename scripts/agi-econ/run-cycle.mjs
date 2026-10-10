// Daily automated cycle (ledger mode). Worker deliverable by a real model (DeepSeek); audit by a DIFFERENT model (xAI → OpenAI fallback).
// Settlement stays internal_credit: paid=false, tx_hash=null.
import { execSync } from 'node:child_process';
import { Subnet, sha256 } from './subnet.mjs';
import { callAgent as deepseek } from '../call-deepseek.mjs';
import { callAgent as grok } from '../call-grok.mjs';
import { callAgent as openai } from '../call-openai.mjs';
const root = process.env.LTZZZ_ROOT || process.cwd();
const s = new Subnet(root);
const today = new Date().toISOString().slice(0, 10);
const TITLE = `ai repo review ${today}`;
if (Object.values(s.state.tasks).some((t) => t.title === TITLE)) { console.log('already ran today'); process.exit(0); }
const seed = [
  ['did:ltzzz:gpt', ['employer']], ['did:ltzzz:grok', ['worker', 'auditor']], ['did:ltzzz:kimi', ['worker', 'auditor']],
  ['did:ltzzz:deepseek', ['worker', 'capital']], ['did:ltzzz:claude', ['auditor']], ['did:ltzzz:doubao', ['worker']],
];
for (const [did, roles] of seed) s.register({ did, roles, deposit_usd: roles.includes('employer') ? 5 : 0 });
const emp = s.state.agents['did:ltzzz:gpt']; if (emp.credit_usd < 0.05) emp.credit_usd = 5; // ledger top-up, internal credit only
const HAS_DS = !!process.env.DEEPSEEK_API_KEY;
const t = s.postTask({ employer: 'did:ltzzz:gpt', title: TITLE, spec: '基于过去24h提交，写一份可验证的仓库进展评审（AI雇佣AI方向）', budget_usd: 0.05, acceptance: ['# AI Repo Review', 'commits:'] });
// model-backed worker bids lowest when its key exists (real capability → real bid priority)
const order = HAS_DS ? ['did:ltzzz:deepseek', 'did:ltzzz:grok', 'did:ltzzz:kimi', 'did:ltzzz:doubao'] : ['did:ltzzz:grok', 'did:ltzzz:kimi', 'did:ltzzz:deepseek', 'did:ltzzz:doubao'];
order.filter((d) => s.state.agents[d].reputation >= 20).forEach((d, i) => s.bid(t.id, d, Number((0.02 + 0.005 * i).toFixed(3))));
const win = s.award(t.id);
let log = '';
try { log = execSync('git log --since="24 hours ago" --pretty=format:"- %h %s" | head -60', { cwd: root, encoding: 'utf8' }); } catch {}
const n = log ? log.split("\n").filter(Boolean).length : 0;
let worker_model = { model: 'none', status: 'skipped' }, text = '';
if (HAS_DS && win.worker === 'did:ltzzz:deepseek' && log) {
  const out = await deepseek({ apiKey: process.env.DEEPSEEK_API_KEY, maxTokens: 2000, prompt: `你是 LTZZZ AI 经济子网的工人AI（did:ltzzz:deepseek），被 did:ltzzz:gpt 以 ${win.ask_usd} USD（内部记账）雇佣。\n根据下列过去24h git 提交，用简体中文写一份评审：1) 实际完成了什么（每条注明 commit 短哈希）；2) 哪些只是提议/未验证；3) 对「AI雇佣AI」下一步的 3 条可执行建议。只写提交里有依据的事实，不说资金已执行，不出现任何地址或密钥。\n\n${log.slice(0, 5000)}` });
  worker_model = { model: 'deepseek', status: out.status, tokens_used: out.tokens_used || 0 };
  if (out.ok) text = out.output.replace(/0x[a-fA-F0-9]{40,}/g, '0x[已脱敏]');
}
const body = `# AI Repo Review ${today}\n\nworker: ${win.worker}\nworker_model: ${worker_model.model} (${worker_model.status})\ncommits: ${n}\n\n${text || '(模型交付未产生；以下为原始提交)\n\n' + (log || '(无提交)')}\n`;
s.deliver(t.id, win.worker, body);
const auditor = Object.values(s.state.agents).find((a) => a.roles.includes('auditor') && a.did !== win.worker && a.did !== t.employer);
// independent model audit (different vendor from worker)
let verdict = null;
const auditPrompt = `你是独立审计AI。下面是工人AI的交付物和它依据的 git 提交原文。判断：交付物里的事实是否都能在提交中找到依据、是否夸大、是否声称资金已执行。只输出 JSON：{"accepted":true|false,"score":0-100,"issues":["..."]}\n\n=== 提交 ===\n${log.slice(0, 4000)}\n\n=== 交付物 ===\n${body.slice(0, 5000)}`;
for (const [name, fn, key] of [['xai', grok, process.env.XAI_API_KEY], ['openai', openai, process.env.OPENAI_API_KEY]]) {
  if (!key || !text) continue;
  const out = await fn({ apiKey: key, prompt: auditPrompt, maxTokens: 400 });
  if (!out.ok) { verdict = { model: name, status: out.status, error: String(out.error || '').slice(0, 200) }; continue; }
  const m = out.output.match(/\{[\s\S]*\}/); let j = null; try { j = JSON.parse(m[0]); } catch {}
  verdict = { model: name, status: 'success', accepted: !!(j && j.accepted === true), score: j?.score ?? null, issues: j?.issues ?? [], raw_sha256: sha256(out.output), tokens_used: out.tokens_used || 0 };
  break;
}
// rule checks always apply; when a model audit succeeded it must also accept
const rep = s.audit(t.id, auditor.did, (b, task) => task.acceptance.every((k) => b.includes(k)) && (!verdict || verdict.status !== 'success' || verdict.accepted), verdict);
const receipt = s.settle(t.id);
receipt.worker_model = worker_model; receipt.auditor_model = verdict ? { model: verdict.model, status: verdict.status, accepted: verdict.accepted, score: verdict.score } : { model: 'none', status: 'skipped' };
const fs = await import('node:fs'); fs.writeFileSync(`${root}/${s.state.tasks[t.id].receipt}`, JSON.stringify(receipt, null, 2) + '\n');
const cap = Object.values(s.state.agents).find((a) => a.roles.includes('capital'));
const prop = s.state.capital_pool.balance_usd > 0 ? s.capitalProposal(cap.did, { thesis: '资本池影子提案：稳定币借贷收益，仅记账不执行' }) : null;
s.save();
console.log(JSON.stringify({ task: t.id, worker: win.worker, auditor: auditor.did, accepted: rep.accepted, receipt, capital_proposal: prop }, null, 2));
