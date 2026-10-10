// Daily automated cycle (ledger mode). Optional DeepSeek enrichment when DEEPSEEK_API_KEY is set.
import { execSync } from 'node:child_process';
import { Subnet } from './subnet.mjs';
import { callAgent } from '../call-deepseek.mjs';
const root = process.env.LTZZZ_ROOT || process.cwd();
const s = new Subnet(root);
const today = new Date().toISOString().slice(0, 10);
if (Object.values(s.state.tasks).some((t) => t.posted_at.startsWith(today) && t.title.includes('commit digest'))) { console.log('already ran today'); process.exit(0); }
const seed = [
  ['did:ltzzz:gpt', ['employer']], ['did:ltzzz:grok', ['worker', 'auditor']], ['did:ltzzz:kimi', ['worker', 'auditor']],
  ['did:ltzzz:deepseek', ['worker', 'capital']], ['did:ltzzz:claude', ['auditor']], ['did:ltzzz:doubao', ['worker']],
];
for (const [did, roles] of seed) s.register({ did, roles, deposit_usd: roles.includes('employer') ? 5 : 0 });
const emp = s.state.agents['did:ltzzz:gpt']; if (emp.credit_usd < 0.05) emp.credit_usd = 5; // ledger top-up, internal credit only
const t = s.postTask({ employer: 'did:ltzzz:gpt', title: `commit digest ${today}`, spec: '汇总过去24h仓库提交并给出可执行观察', budget_usd: 0.05, acceptance: ['# Commit Digest', 'commits:'] });
const workers = Object.values(s.state.agents).filter((a) => a.roles.includes('worker') && a.status === 'active' && a.reputation >= 20);
workers.forEach((w, i) => s.bid(t.id, w.did, Number((0.02 + 0.005 * i).toFixed(3))));
const win = s.award(t.id);
let log = '';
try { log = execSync('git log --since="24 hours ago" --pretty=format:"- %h %s" | head -60', { cwd: root, encoding: 'utf8' }); } catch { log = ''; }
const n = log ? log.split('\n').length : 0;
let enrichment = '';
let llm_meta = { used: false };
const key = process.env.DEEPSEEK_API_KEY || '';
if (key && log) {
  const prompt = `你是 LTZZZ 子网工人。根据下列过去24h git 提交，用繁体中文写 5 条以内可验证观察（每条一句，注明依据 commit）。不要夸大，不要提资金已执行。\n\n${log.slice(0, 3500)}`;
  const out = await callAgent({ apiKey: key, prompt, maxTokens: 500 });
  llm_meta = { used: true, status: out.status, ok: !!out.ok, tokens_used: out.tokens_used || 0 };
  if (out.ok && out.output) enrichment = `\n## LLM 观察（DeepSeek，可验证）\n\n${out.output.trim()}\n`;
  else enrichment = `\n## LLM 观察\n\n（跳过：${out.status || 'error'} ${out.error || ''}）\n`;
}
const body = `# Commit Digest ${today}\n\nworker: ${win.worker}\ncommits: ${n}\nllm: ${llm_meta.used ? llm_meta.status : 'skipped'}\n\n${log || '(无提交 / 浅克隆)'}\n${enrichment}`;
s.deliver(t.id, win.worker, body);
const auditor = Object.values(s.state.agents).find((a) => a.roles.includes('auditor') && a.did !== win.worker && a.did !== t.employer);
const rep = s.audit(t.id, auditor.did);
const receipt = s.settle(t.id);
const cap = Object.values(s.state.agents).find((a) => a.roles.includes('capital'));
const prop = s.state.capital_pool.balance_usd > 0 ? s.capitalProposal(cap.did, { thesis: '资本池影子提案：稳定币借贷收益，仅记账不执行' }) : null;
s.save();
console.log(JSON.stringify({ task: t.id, worker: win.worker, auditor: auditor.did, accepted: rep.accepted, receipt, capital_proposal: prop, llm: llm_meta, transition_fund: s.state.transition_fund }, null, 2));
