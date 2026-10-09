import fs from 'node:fs';
const root=new URL('../',import.meta.url);const read=p=>{try{return JSON.parse(fs.readFileSync(new URL(p,root),'utf8'));}catch{return null;}};
const files=(dir)=>{try{return fs.readdirSync(new URL(dir+'/',root)).filter(x=>x.endsWith('.json')).map(x=>({path:dir+'/'+x,data:read(dir+'/'+x)})).filter(x=>x.data);}catch{return [];}};
const observed=data=>data.at||data.generated_at||data.completed_at||data.results?.at(-1)?.at||data.date||'';
const latest=dir=>files(dir).sort((a,b)=>String(observed(b.data)).localeCompare(String(observed(a.data))))[0];
const daily=latest('data/results');const meta=latest('knowledge/results/meta');const defi=latest('knowledge/results/defi');const kimi=files('knowledge/results/kimi').filter(x=>x.data.has_worker_key).sort((a,b)=>String(b.data.at).localeCompare(String(a.data.at)))[0];
const config=read('data/tasks/daily-tasks.json');const entries=(daily?.data.tasks||[]);const success=entries.filter(t=>t.status==='success');
const roles=[['gpt','GPT','工程总控'],['grok','XAI / Grok','产品与安全工程'],['deepseek','DeepSeek','投资研究与数值核查'],['doubao','豆包','视频与流水线集成'],['qianwen','千问','独立审计与总控备援'],['kimi','国内 Kimi','中文记忆校对'],['kimi-global','国际 Kimi','海外研究与雇佣提案'],['meta','Meta','提案复核 · 托管 Llama'],['microsoft','Microsoft','GPT 委托分析席'],['manus','Manus','浏览器与平台执行'],['workbuddy','Workbuddy','调度与跟单'],['claude','Claude','已停用 · 保留历史']];
const agents=roles.map(([id,name,role])=>{const task=entries.find(t=>t.agent===id);const cfg=config?.tasks?.find(t=>t.agent===id);let status=task?.status==='success'?'verified':'pending';let label=task?.status==='success'?'日课已验证':'待交付回执';let detail=task?`最近日课：${task.status} · ${daily.data.date}`:'角色已安排，接单与交付分别验收';let evidence=daily?.path;
if(id==='claude'){status='off';label='已停用';detail='当前配置停止调用，不再安排外部任务';evidence='data/tasks/daily-tasks.json';}
if(id==='microsoft'){status='pending';label='GPT 委托执行';detail='当前委托配置已合入；真实新任务需单独验收';evidence='data/tasks/daily-tasks.json';}
if(id==='meta'&&meta){status='verified';label='模型调用已验证';detail='托管 Llama 已验证；外部 Meta 席接单另计';evidence=meta.path;}
if(id==='kimi'){status='blocked';label='国内凭证待接入';detail='国内与国际 Key 分开；国内余额不据国际报错判断';evidence=kimi?.path;}
if(id==='kimi-global'){status='pending';label='无 Key 任务已派出';detail='等待外部席接单；国际 API 最近余额为 0';evidence='ltzzz-memory/kimi-weekly/2026-10-09-task.md';}
return {id,name,role,status,label,detail,evidence};});
const projects=[{name:'Meta 托管 Llama',category:'AI 能力',status:meta?.data.anonymous_http===401&&meta.data.results?.length===2&&meta.data.results.every(r=>r.http===200)?'verified':'pending',detail:'鉴权与真实推理已验证；雇佣、投资输出属于提案。',evidence:meta?.path,at:meta?.data.results?.at(-1)?.at},
{name:'Aave 1 USDC 供赎测试',category:'资金实验',status:defi?.data.status==='verified_roundtrip'?'verified':'blocked',detail:defi?.data.status==='verified_roundtrip'?'供应、赎回与本金转回已完成。':'链上余额已读取；签名通道未接入，没有新投资交易。',evidence:defi?.path,at:defi?.data.at},
{name:'Instagram 首帖',category:'内容发布',status:'pending',detail:'发布方案已交 Manus 任务入口；尚无发布 ID。',evidence:'ltzzz-memory/tasks/manus-instagram-first-post-20261009.md'},
{name:'Kimi 国际席周任务',category:'AI 协作',status:'pending',detail:'无 Key 任务包已生成；等待外部 Kimi 席提交交付。',evidence:'ltzzz-memory/kimi-weekly/2026-10-09-task.md'}];
// Social publication requires a true published receipt, never a draft/container ID.
const instagram=latest('knowledge/results/instagram');if(instagram&&instagram.data.status==='published'&&instagram.data.media_id&&instagram.data.permalink){Object.assign(projects[2],{status:'verified',detail:'首帖已发布，发布 ID 与公开链接已记录。',evidence:instagram.path,at:instagram.data.completed_at});}
const history=files('data/results').filter(x=>x.data.date&&Array.isArray(x.data.tasks)).sort((a,b)=>a.data.date.localeCompare(b.data.date)).slice(-7).map(x=>({date:x.data.date,success:x.data.tasks.filter(t=>t.status==='success').length,total:x.data.tasks.length}));
const snapshot=defi?.data.snapshot||null;const payload={schema_version:1,generated_at:new Date().toISOString(),observed_at:daily?.data.generated_at||null,date:daily?.data.date||null,summary:{daily_success:success.length,daily_total:entries.length,memory_loaded:daily?.data.core_memory?.loaded_files??0,memory_total:daily?.data.core_memory?.total_files??6,seats:roles.length},daily_source:daily?.path,agents,projects,history,finance:snapshot?{...snapshot,observed_at:defi.data.at,evidence:defi.path}:null};
fs.writeFileSync(new URL('site-status.json',root),JSON.stringify(payload,null,2)+'\n');console.log('Site status built from execution receipts');
