// Daily X value/sales post: DeepSeek writes from product-facts only; xAI audits factual claims; post only if accepted.
// Usage: X_TEXT=... to post a fixed text (still audited). Writes receipt results/x-posts/<date>-<run>.json
import fs from 'node:fs';
import { callAgent as deepseek } from './call-deepseek.mjs';
import { callAgent as grok } from './call-grok.mjs';
const E = process.env; const day = new Date().toISOString().slice(0, 10);
const facts = fs.readFileSync('content/x/product-facts.md', 'utf8');
const prev = fs.existsSync('results/x-posts') ? fs.readdirSync('results/x-posts').slice(-7).map((f) => { try { return JSON.parse(fs.readFileSync('results/x-posts/' + f, 'utf8')).text || ''; } catch { return ''; } }).join('\n---\n') : '';
const receipt = { date: day, run_id: E.GITHUB_RUN_ID || 'local', account: '@ltinzh1248958' };
let text = (E.X_TEXT || '').trim();
if (!text) {
  const angles = ['一个具体文件能解决的问题', '如何用回执验证 AI 是否真的干了活', '给 agent 设花费上限的做法', 'AI 雇佣 AI 的实验日志式分享', '30 天退款与适合人群'];
  const angle = angles[new Date().getUTCDate() % angles.length];
  const w = await deepseek({ apiKey: E.DEEPSEEK_API_KEY, maxTokens: 400, prompt: `Write ONE English post for X (max 260 characters incl. link) from the LTZZZ lab account. Angle: ${angle}. Give real value first, then softly mention the product with its link. Use ONLY facts below; no revenue/sales/earnings claims, no hype, max 2 hashtags, no emojis spam. Must differ from recent posts. Output the post text only.\n\nFACTS:\n${facts}\n\nRECENT POSTS:\n${prev}` });
  receipt.writer = { model: 'deepseek', status: w.status, tokens: w.tokens_used || 0 };
  text = w.ok ? w.output.trim().replace(/^"|"$/g, '') : '';
}
receipt.text = text;
if (!text || text.length > 280) { receipt.status = 'BLOCKED'; receipt.reason = !text ? 'writer_failed' : 'too_long'; }
else {
  const a = await grok({ apiKey: E.XAI_API_KEY, maxTokens: 300, prompt: `You are a strict fact auditor. Check this X post against FACTS. Reject if it contains any claim not supported by FACTS (revenue, sales, customers, guarantees, fake urgency), is spammy, or the link is wrong. Output JSON only: {"accepted":true|false,"issues":["..."]}\n\nFACTS:\n${facts}\n\nPOST:\n${text}` });
  let v = null; try { v = JSON.parse(a.output.match(/\{[\s\S]*\}/)[0]); } catch {}
  receipt.auditor = { model: 'xai', did: 'did:ltzzz:grok', status: a.status, accepted: v?.accepted === true, issues: v?.issues || [] };
  if (!receipt.auditor.accepted) { receipt.status = 'BLOCKED'; receipt.reason = 'audit_rejected_or_unavailable'; }
  else {
    const r = await fetch('https://x.ltzzz.com/tweet?auth=oauth2', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + E.LTZZZ_AGENT_TOKEN }, body: JSON.stringify({ text }) });
    const j = await r.json().catch(() => ({}));
    const id = j?.data?.data?.id;
    receipt.post = { http: j.http || r.status, id: id || null, url: id ? `https://x.com/ltinzh1248958/status/${id}` : null, error: id ? undefined : (j?.data?.detail || j?.data?.title || j.error || 'unknown') };
    receipt.status = id ? 'POSTED' : 'FAILED';
  }
}
fs.mkdirSync('results/x-posts', { recursive: true });
fs.writeFileSync(`results/x-posts/${day}-${receipt.run_id}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, reason: receipt.reason, url: receipt.post?.url, error: receipt.post?.error, auditor: receipt.auditor }));
if (receipt.status === 'FAILED') process.exitCode = 1;
