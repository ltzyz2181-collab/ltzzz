// Daily memory → Chinese article → WeChat draft/freepublish; 抖音/视频号 scripts prepared (no official API creds).
// Secrets only via env. Never writes secrets or wallet addresses into output.
import {createHash} from 'node:crypto';
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
import { callAgent } from './call-deepseek.mjs';
const DATE = process.env.ARTICLE_DATE || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // CST day
const root = process.cwd();
const read = (p, n = 4000) => { try { return fs.readFileSync(path.join(root, p), 'utf8').slice(0, n); } catch { return ''; } };
export const redact = (s) => s
  .replace(/0x[a-fA-F0-9]{40,}/g, '0x[已脱敏]')
  .replace(/\b(sk|pk|ghp|gho|xai)[-_][A-Za-z0-9_-]{12,}/g, '[已脱敏]')
  .replace(/(token|secret|password|private[_ ]?key|AppSecret)\s*[:=：]\s*\S+/gi, '$1: [已脱敏]');

function gather() {
  const parts = [];
  const add = (label, p, n) => { const t = read(p, n); if (t) parts.push(`## ${label} (${p})\n${t}`); };
  add('当日摘要', `memory/daily/summary-${DATE}.md`, 2500);
  for (const dir of ['ltzzz-memory/tasks', 'ltzzz-memory/kimi-weekly', 'ltzzz-memory/grokbot-weekly', 'data/results', 'results/agi-econ'])
    { try { for (const f of fs.readdirSync(path.join(root, dir))) if (f.includes(DATE) || (dir === 'results/agi-econ')) add('记录', `${dir}/${f}`, 2000); } catch {} }
  try { parts.push('## 当日提交\n' + execSync(`git log --since="${DATE}T00:00:00+08:00" --until="${DATE}T23:59:59+08:00" --pretty=format:"- %s" | head -60`, { encoding: 'utf8' })); } catch {}
  return redact(parts.join('\n\n')).slice(0, 14000);
}
const PROMPT = (src) => `你是 LTZZZ 数字实验室的编辑。根据下面「${DATE} 的 AI 记忆原始记录」写一篇中文公众号文章（900-1400字）。
要求：遵循「观·行深·大道至简」——先陈述事实，再说验证了什么、失败了什么；只写记录里有的事实，不编造数字；
明确区分「已执行/已验证(applied)」与「提议/计划(proposed)」，用【已验证】【提议】标注；不把怜悯、生存尊严或转岗基金价值口号写入公开稿；程序身份标签或内部积分不能写成真实模型参与或链上付款；
绝不出现钱包地址、私钥、密钥、token。输出 Markdown：第一行 "# 标题"，然后正文，最后一行"—— LTZZZ 数字实验室"。

${src}`;

function uploadR2(file) {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) return { status: 'SKIPPED', missing_secrets: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter((k) => !process.env[k]) };
  const key = `ltzzz-memory/articles/daily/${DATE}.md`;
  try { execSync(`npx --yes wrangler@4 r2 object put "${key}" --file "${file}" --content-type "text/markdown; charset=utf-8" --remote`, { stdio: 'pipe' }); return { status: 'UPLOADED', key }; }
  catch (e) { return { status: 'FAILED', key, error: String(e.stderr || e.message).slice(0, 300) }; }
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error('Invalid ARTICLE_DATE');
const src = gather();
let ai = { ok: false, status: 'not_configured' };
if (process.env.DEEPSEEK_API_KEY) ai = await callAgent({ apiKey: process.env.DEEPSEEK_API_KEY, prompt: PROMPT(src), maxTokens: 8192 });
if(ai.ok && (ai.finish_reason!=='stop' || !ai.output || ai.output.trim().length<500)){ai={...ai,ok:false,status:'incomplete_editor_output',error:'Output incomplete; not an approved article'};}
let article = ai.ok ? redact(ai.output) : `# LTZZZ 日记录 ${DATE}（未经 AI 编辑）\n\n【说明】本日 AI 编辑未执行（${ai.status}），以下为原始记录摘录。\n\n${src.slice(0, 3000)}\n\n—— LTZZZ 数字实验室`;
const title = (article.match(/^# (.+)$/m) || [, `LTZZZ 日记录 ${DATE}`])[1].trim();
const outDir = 'content/daily-articles'; fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${DATE}.md`, article + '\n');
const body = article.replace(/^# .+$/m, '').replace(/[#*`>]/g, '').trim();
const clean = body.replace(/\s+/g,' ');
const sentences = clean.match(/[^。！？]+[。！？]/g) || [];
let short='';
for(const s of sentences){if((short+s).length>260)break;short+=s;}
if(!short)short=clean.slice(0,220)+'。';
// Owner paused Douyin and Channels; no scripts or publish attempts generated.
const r2 = {status:'NOT_REQUIRED', via:'Worker reads committed GitHub article; no R2 API upload permission required'};
const env = (k) => !!process.env[k];
const receipt = { article_sha256:createHash('sha256').update(article+'\n').digest('hex'), date: DATE, generated_at: new Date().toISOString(), article: `${outDir}/${DATE}.md`,
  ai_editor: { model: 'deepseek', status: ai.status, ok: !!ai.ok, finish_reason:ai.finish_reason||null, tokens_used: ai.tokens_used || 0, error: ai.ok ? undefined : redact(String(ai.error||'')) },
  platforms: {
    r2_upload: r2,
    wechat_mp: { status: ai.ok?'ARTICLE_READY_WORKER_UNVERIFIED':'ARTICLE_FALLBACK_RAW', draft_eligible:!!ai.ok, via: 'Cloudflare worker ltzzz-wechat-publisher（cron 0 12 * * * UTC 建草稿，AUTO_MASS=0 不群发）', note: '已提交文章由 Worker 从 GitHub 读取；这里只生成稿件，草稿和发表状态以微信真实回执为准' },
    douyin: {status:'PAUSED_BY_OWNER',published:false},
    shipinhao: {status:'PAUSED_BY_OWNER',published:false},
    youtube: { status: 'SKIPPED', owner: '豆包' }, instagram: { status: 'SKIPPED', owner: 'Manus' } } };
fs.mkdirSync('results/publishing', { recursive: true });
fs.writeFileSync(`results/publishing/${DATE}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
