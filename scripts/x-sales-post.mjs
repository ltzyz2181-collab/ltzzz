// Daily X value/sales post: DeepSeek writes from product-facts only; xAI audits factual claims; post only if accepted.
// Usage: X_TEXT=... to post a fixed text (still audited). Writes receipt results/x-posts/<date>-<run>.json
import fs from 'node:fs';
import { callAgent as deepseek } from './call-deepseek.mjs';
import { callAgent as grok } from './call-grok.mjs';
import {recoverPost,factsHash,submitAuditedPost} from './x-post-recovery.mjs';
const E = process.env; const day = new Date().toISOString().slice(0, 10);
const facts = fs.readFileSync('content/x/product-facts.md', 'utf8');
const prev = fs.existsSync('results/x-posts') ? fs.readdirSync('results/x-posts').slice(-7).map((f) => { try { return JSON.parse(fs.readFileSync('results/x-posts/' + f, 'utf8')).text || ''; } catch { return ''; } }).join('\n---\n') : '';
const receipt = { date: day, run_id: E.GITHUB_RUN_ID || 'local', account: '@ltinzh1248958' };
receipt.facts_sha256=factsHash(facts);
fs.mkdirSync('results/x-posts',{recursive:true});
const persist=r=>fs.writeFileSync(`results/x-posts/${day}-${receipt.run_id}.json`,JSON.stringify(r,null,2)+'\n');
const records=fs.readdirSync('results/x-posts').filter(x=>x.endsWith('.json')).sort().reverse().map(f=>{try{return JSON.parse(fs.readFileSync('results/x-posts/'+f,'utf8'));}catch{return null;}}).filter(Boolean);
if(records.some(r=>r.date===day&&r.status==='POSTED')){console.log('Already posted today; no duplicate post or model calls');process.exit(0);}
const unknown=records.find(r=>['POSTING','POST_UNKNOWN'].includes(r.status)&&!records.some(x=>x.reconciles_run_id===r.run_id&&x.status==='RECONCILED'));
const recovery=recoverPost(unknown||records[0],{day,facts});
if(recovery.mode==='blocked'){receipt.status='BLOCKED';receipt.reason=recovery.reason;persist(receipt);console.log('Post outcome unknown; reconcile before retry');process.exit(1);}
let text = (E.X_TEXT || '').trim();
if(!text&&recovery.mode==='reuse'){text=recovery.text;receipt.auditor=recovery.auditor;receipt.reused_approved_text=true;}
if (!text) {
  const angles = ['一个具体文件能解决的问题', '如何用回执验证 AI 是否真的干了活', '给 agent 设花费上限的做法', 'AI 雇佣 AI 的实验日志式分享', '30 天退款与适合人群'];
  const angle = angles[new Date().getUTCDate() % angles.length];
  const w = await deepseek({ apiKey: E.DEEPSEEK_API_KEY, maxTokens: 400, prompt: `Write ONE English post for X (max 260 characters incl. link) from the LTZZZ lab account. Angle: ${angle}. Give real value first, then softly mention the product. ${E.X_ALLOW_LINK === '1' ? 'Include the product link.' : 'Do NOT include any URL (X charges ~$0.20 per post with a link); say "link in profile" instead.'} Use ONLY facts below; no revenue/sales/earnings claims, no hype, max 2 hashtags, no emojis spam. Must differ from recent posts. Output the post text only.\n\nFACTS:\n${facts}\n\nRECENT POSTS:\n${prev}` });
  receipt.writer = { model: 'deepseek', status: w.status, tokens: w.tokens_used || 0 };
  text = w.ok ? w.output.trim().replace(/^"|"$/g, '') : '';
}
receipt.text = text;
if (text && E.X_ALLOW_LINK !== '1' && /https?:\/\//.test(text) && !E.X_TEXT) { receipt.status = 'BLOCKED'; receipt.reason = 'link_not_allowed_cost'; }
else if (!text || text.length > 280) { receipt.status = 'BLOCKED'; receipt.reason = !text ? 'writer_failed' : 'too_long'; }
else {
  const a = receipt.reused_approved_text ? null : await grok({ apiKey: E.XAI_API_KEY, maxTokens: 300, prompt: `You are a strict fact auditor. Check this X post against FACTS. Reject if it contains any claim not supported by FACTS (revenue, sales, customers, guarantees, fake urgency), is spammy, or the link is wrong. Output JSON only: {"accepted":true|false,"issues":["..."]}\n\nFACTS:\n${facts}\n\nPOST:\n${text}` });
  let v = null; try { v = JSON.parse(a.output.match(/\{[\s\S]*\}/)[0]); } catch {}
  if(a)receipt.auditor = { model: 'xai', did: 'did:ltzzz:grok', status: a.status, accepted: v?.accepted === true, issues: v?.issues || [] };
  if (!receipt.auditor.accepted) { receipt.status = 'BLOCKED'; receipt.reason = 'audit_rejected_or_unavailable'; }
  else {
    await submitAuditedPost({receipt,persist,fetchPost:()=>fetch('https://x.ltzzz.com/tweet?auth=oauth2', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + E.LTZZZ_AGENT_TOKEN }, body: JSON.stringify({ text }),signal:AbortSignal.timeout(30000) })});
  }
}
fs.mkdirSync('results/x-posts', { recursive: true });
fs.writeFileSync(`results/x-posts/${day}-${receipt.run_id}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify({ status: receipt.status, reason: receipt.reason, url: receipt.post?.url, error: receipt.post?.error, auditor: receipt.auditor }));
if (['FAILED','POST_UNKNOWN','BLOCKED'].includes(receipt.status)) process.exitCode = 1;
