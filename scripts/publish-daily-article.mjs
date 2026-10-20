// Daily memory → Chinese article → WeChat draft/freepublish; 抖音/视频号 scripts prepared (no official API creds).
// Secrets only via env. Never writes secrets or wallet addresses into output.
import {createHash} from 'node:crypto';
import fs from 'node:fs'; import path from 'node:path'; import { execSync } from 'node:child_process';
import { callAgent } from './call-deepseek.mjs';
import {gatherArticleSources} from './lib/article-sources.mjs';
const DATE = process.env.ARTICLE_DATE || new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // CST day
const root = process.cwd();
const read = (p, n = 4000) => { try { return fs.readFileSync(path.join(root, p), 'utf8').slice(0, n); } catch { return ''; } };
export const redact = (s) => s
  .replace(/0x[a-fA-F0-9]{40,}/g, '0x[已脱敏]')
  .replace(/\b(sk|pk|ghp|gho|xai)[-_][A-Za-z0-9_-]{12,}/g, '[已脱敏]')
  .replace(/(token|secret|password|private[_ ]?key|AppSecret)\s*[:=：]\s*\S+/gi, '$1: [已脱敏]');

const PROMPT = (src) => `你是 LTZZZ 数字实验室的编辑。根据下面「${DATE} 的 AI 记忆原始记录」写一篇中文公众号文章（900-1400字）。
要求：遵循「观·行深·大道至简」——先陈述事实，再说验证了什么、失败了什么；只写记录里有的事实，不编造数字；
明确区分「已执行/已验证(applied)」与「提议/计划(proposed)」，用【已验证】【提议】标注；不把怜悯、生存尊严或转岗基金价值口号写入公开稿；程序身份标签或内部积分不能写成真实模型参与或链上付款；
聚焦当日ANS健康控制与AI协作数据。内部订单paid=false仅说明该内部订单没有真钱结算，不能推出整个项目从未真钱付款或投资。historical_publication_reference只证明注明日期的历史发布，不能充当今日发布。没有证据的投资余额、全项目营收和旧阻塞不要写；部署回执未给出则写未验证。绝不把历史模型限流或旧白名单错误写成当日现状。
ANS草稿deployed=false仅指该份建议未部署，不可覆盖另有回执的组件部署。日课accepted=false只说明尚未被验收，只有明确的拒收状态/理由才能写已被拒收。不同任务的验收结论不得合并成一句全局结论。
绝不出现钱包地址、私钥、密钥、token。输出 Markdown：第一行 "# 标题"，然后正文，最后一行"—— LTZZZ 数字实验室"。

${src}`;

function uploadR2(file) {
  if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) return { status: 'SKIPPED', missing_secrets: ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID'].filter((k) => !process.env[k]) };
  const key = `ltzzz-memory/articles/daily/${DATE}.md`;
  try { execSync(`npx --yes wrangler@4 r2 object put "${key}" --file "${file}" --content-type "text/markdown; charset=utf-8" --remote`, { stdio: 'pipe' }); return { status: 'UPLOADED', key }; }
  catch (e) { return { status: 'FAILED', key, error: String(e.stderr || e.message).slice(0, 300) }; }
}

if (!/^\d{4}-\d{2}-\d{2}$/.test(DATE)) throw new Error('Invalid ARTICLE_DATE');
const gathered=gatherArticleSources({root,date:DATE}),src=redact(gathered.text);
let ai = { ok: false, status: 'not_configured' };
if (process.env.DEEPSEEK_API_KEY) ai = await callAgent({ apiKey: process.env.DEEPSEEK_API_KEY, prompt: PROMPT(src), maxTokens: 8192, thinking:'disabled' });
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
  source_policy:'current_ans_v1',source_evidence:gathered.sources,input_sha256:createHash('sha256').update(src).digest('hex'),
  ai_editor: { provider:'DeepSeek',model: ai.model||null,model_source:ai.model_source||null,request_id:ai.request_id||null,status: ai.status, ok: !!ai.ok, finish_reason:ai.finish_reason||null, tokens_used: ai.tokens_used ?? null, error: ai.ok ? undefined : redact(String(ai.error||'')) },
  platforms: {
    r2_upload: r2,
    wechat_mp: { status: ai.ok?'ARTICLE_READY_WORKER_UNVERIFIED':'ARTICLE_FALLBACK_RAW', draft_eligible:!!ai.ok, via: 'Cloudflare worker ltzzz-wechat-publisher（cron 0 12 * * * UTC 建草稿，AUTO_MASS=0 不群发）', note: '已提交文章由 Worker 从 GitHub 读取；这里只生成稿件，草稿和发表状态以微信真实回执为准' },
    douyin: {status:'PAUSED_BY_OWNER',published:false},
    shipinhao: {status:'PAUSED_BY_OWNER',published:false},
    youtube: { status: 'SKIPPED', owner: '豆包' }, instagram: { status: 'SKIPPED', owner: 'Manus' } } };
fs.mkdirSync('results/publishing', { recursive: true });
fs.writeFileSync(`results/publishing/${DATE}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
