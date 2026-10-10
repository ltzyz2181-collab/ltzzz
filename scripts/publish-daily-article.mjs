// Daily memory → Chinese article → WeChat draft/freepublish; 抖音/视频号 scripts prepared (no official API creds).
// Secrets only via env. Never writes secrets or wallet addresses into output.
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
明确区分「已执行/已验证(applied)」与「提议/计划(proposed)」，用【已验证】【提议】标注；可提一句怜悯之心；
绝不出现钱包地址、私钥、密钥、token。输出 Markdown：第一行 "# 标题"，然后正文，最后一行"—— LTZZZ 数字实验室"。

${src}`;

async function wechat(title, md) {
  const id = process.env.WECHAT_APP_ID, sec = process.env.WECHAT_APP_SECRET, thumb = process.env.WECHAT_THUMB_MEDIA_ID;
  const missing = [!id && 'WECHAT_APP_ID', !sec && 'WECHAT_APP_SECRET', !thumb && 'WECHAT_THUMB_MEDIA_ID'].filter(Boolean);
  if (missing.length) return { status: 'BLOCKED', missing_secrets: missing, note: '凭证在 Cloudflare worker ltzzz-wechat-publisher 内，GitHub Actions 未配置；另需公众号后台 IP 白名单放行调用方出口 IP' };
  const tk = await (await fetch(`https://api.weixin.qq.com/cgi-bin/token?grant_type=client_credential&appid=${id}&secret=${sec}`)).json();
  if (!tk.access_token) return { status: 'FAILED', step: 'token', errcode: tk.errcode, errmsg: tk.errmsg };
  const html = md.split('\n').filter((l) => !l.startsWith('# ')).map((l) => l.trim() ? `<p>${l.replace(/[<>]/g, '')}</p>` : '').join('');
  const d = await (await fetch(`https://api.weixin.qq.com/cgi-bin/draft/add?access_token=${tk.access_token}`, { method: 'POST', body: JSON.stringify({ articles: [{ title: title.slice(0, 64), author: 'LTZZZ', digest: '', content: html, thumb_media_id: thumb, need_open_comment: 0 }] }) })).json();
  if (!d.media_id) return { status: 'FAILED', step: 'draft/add', errcode: d.errcode, errmsg: d.errmsg };
  if (process.env.WECHAT_AUTO_PUBLISH !== '1') return { status: 'DRAFT_CREATED', media_id: d.media_id };
  const p = await (await fetch(`https://api.weixin.qq.com/cgi-bin/freepublish/submit?access_token=${tk.access_token}`, { method: 'POST', body: JSON.stringify({ media_id: d.media_id }) })).json();
  return p.errcode ? { status: 'FAILED', step: 'freepublish', media_id: d.media_id, errcode: p.errcode, errmsg: p.errmsg } : { status: 'PUBLISH_SUBMITTED', media_id: d.media_id, publish_id: p.publish_id, note: '异步发布；结果需 freepublish/get 查询' };
}

const src = gather();
let ai = { ok: false, status: 'not_configured' };
if (process.env.DEEPSEEK_API_KEY) ai = await callAgent({ apiKey: process.env.DEEPSEEK_API_KEY, prompt: PROMPT(src), maxTokens: 2200 });
let article = ai.ok ? redact(ai.output) : `# LTZZZ 日记录 ${DATE}（未经 AI 编辑）\n\n【说明】本日 AI 编辑未执行（${ai.status}），以下为原始记录摘录。\n\n${src.slice(0, 3000)}\n\n—— LTZZZ 数字实验室`;
const title = (article.match(/^# (.+)$/m) || [, `LTZZZ 日记录 ${DATE}`])[1].trim();
const outDir = 'content/daily-articles'; fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(`${outDir}/${DATE}.md`, article + '\n');
const body = article.replace(/^# .+$/m, '').replace(/[#*`>]/g, '').trim();
const short = body.replace(/\s+/g, ' ').slice(0, 260);
fs.writeFileSync(`${outDir}/${DATE}-douyin.md`, `# 抖音口播脚本 ${DATE}\n规格：9:16 / ≤60秒 / 中文口播\n\n标题：${title}\n\n口播：${short}……\n\n话题：#AI #LTZZZ #观行深\n状态：待发布（无抖音开放平台已审核应用凭证）\n`);
fs.writeFileSync(`${outDir}/${DATE}-shipinhao.md`, `# 视频号文案 ${DATE}\n\n${title}\n\n${short}……\n\n延伸阅读：公众号同名文章\n状态：待人工发布（视频号无通用公开发帖 API）\n`);
const wx = await wechat(title, article);
const env = (k) => !!process.env[k];
const receipt = { date: DATE, generated_at: new Date().toISOString(), article: `${outDir}/${DATE}.md`,
  ai_editor: { model: 'deepseek', status: ai.status, ok: !!ai.ok, tokens_used: ai.tokens_used || 0, error: ai.ok ? undefined : ai.error },
  platforms: {
    wechat_mp: wx,
    douyin: env('DOUYIN_CLIENT_KEY') && env('DOUYIN_CLIENT_SECRET') && env('DOUYIN_ACCESS_TOKEN') ? { status: 'READY_NOT_IMPLEMENTED' } : { status: 'BLOCKED', file: `${outDir}/${DATE}-douyin.md`, missing_secrets: ['DOUYIN_CLIENT_KEY', 'DOUYIN_CLIENT_SECRET', 'DOUYIN_ACCESS_TOKEN'], need: '抖音开放平台(open.douyin.com)已审核移动/网站应用 + video.create 权限 + 账号 OAuth 授权；且需要成片视频文件' },
    shipinhao: { status: 'BLOCKED', file: `${outDir}/${DATE}-shipinhao.md`, need: '视频号无通用公开发帖 API；需人工在视频号助手发布，或企业主体申请视频号相关开放能力' },
    youtube: { status: 'SKIPPED', owner: '豆包' }, instagram: { status: 'SKIPPED', owner: 'Manus' } } };
fs.mkdirSync('results/publishing', { recursive: true });
fs.writeFileSync(`results/publishing/${DATE}.json`, JSON.stringify(receipt, null, 2) + '\n');
console.log(JSON.stringify(receipt, null, 2));
