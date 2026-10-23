#!/usr/bin/env node
/**
 * dispatch-sentinel.mjs — 派单哨兵（WorkBuddy 职责的自动化落地）
 *
 * 职责（对应 owner 2026-10-08/09 指令）：
 *   - 派单跟踪：今日应交付的项，实际交付了没
 *   - 超时汇总：超期未交付的派单
 *   - 阻塞汇总：标记为 阻塞 的项
 *   - 未配置明说：检查项若无法判定，明确输出 UNKNOWN，不假装通过
 *
 * 纪律：所有状态以 GitHub 仓库中的交付与运行证据为准（本脚本读的就是仓库文件）。
 *
 * 用法: node scripts/dispatch-sentinel.mjs [--date YYYY-MM-DD]
 * 输出: memory/sentinel/<date>-<hh>.md  +  stdout 摘要
 */
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {deliveryPolicy,externalTaskDelivery,externalDeliveryRequired} from './lib/seat-delivery.mjs';
import {runDispatchOversight} from './lib/dispatch-oversight.mjs';

export function indexDispatch(root){
 const dir=path.join(root,'ops/dispatch');if(!fs.existsSync(dir))return {tasks:[]};
 const walk=d=>fs.readdirSync(d,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(path.join(d,e.name)):e.name.endsWith('.md')?[path.join(d,e.name)]:[]);
 const files=walk(dir),receipts=files.filter(f=>f.split(path.sep).includes('receipts'));
 const structuredDir=path.join(root,'knowledge/results/dispatch'),structured=fs.existsSync(structuredDir)?fs.readdirSync(structuredDir).filter(f=>f.endsWith('.json')).flatMap(f=>{try{return [{file:path.join(structuredDir,f),data:JSON.parse(fs.readFileSync(path.join(structuredDir,f),'utf8'))}];}catch{return [];}}):[];
 const tasks=files.filter(f=>!f.split(path.sep).includes('receipts')).flatMap(file=>{
  const text=fs.readFileSync(file,'utf8');if(!/^assigned\s*$/m.test(text)&&!/(?:状态|Status)[:：]\s*`?assigned[_a-z]*/i.test(text))return [];
  const id=text.match(/(?:Task ID|任务ID|单号)[:：]\s*`?([A-Za-z0-9_-]+)/i)?.[1]||path.basename(file,'.md');
  const matched=receipts.filter(r=>{const t=fs.readFileSync(r,'utf8');return [...t.matchAll(/(?:Task ID|task_id|任务ID|单号)[:：]\s*`?([A-Za-z0-9_-]+)/gi)].some(m=>m[1]===id);});
  const codeReceipts=structured.filter(r=>r.data.task_id===id),delivery=codeReceipts.some(r=>r.data.execution?.generation_verified===true);
  const deadline=text.match(/(?:deadline|due_at|截止)[:：]\s*`?([0-9T:.+Z-]+)/i)?.[1]||null,deadline_at=deadline&&/T.*(?:Z|[+-]\d\d:\d\d)$/.test(deadline)&&Number.isFinite(Date.parse(deadline))?deadline:null;
  matched.push(...codeReceipts.map(r=>r.file));
  const externalSeat=/^DAILY-\d{4}-\d{2}-\d{2}-claude$/.test(id)?'claude':null;
  const channel=externalSeat?deliveryPolicy(root,externalSeat):null,linked=externalSeat?externalTaskDelivery(root,id,externalSeat):null;
  const referenceOnly=channel?.channel==='repo_pr_only'&&!channel.expected_native_daily&&linked?.status==='not_linked'&&!matched.length&&!externalDeliveryRequired(root,id);
  const channelStatus=channel?.channel==='disabled'?'external_role_disabled':linked?.status==='invalid'?'external_delivery_evidence_invalid':linked?.status==='repo_pr_unreviewed'?'pr_unreviewed':linked?.status==='repo_pr_delivery_recorded'?'external_pr_delivery_recorded':linked?.status==='delegated_delivery_pending_review'?'delegated_delivery_pending_review':referenceOnly?'external_pr_route_reference_only':channel?.channel==='repo_pr_only'?'pr_delivery_link_missing':null;
  return [{deadline_at,deadline_verified:!!deadline_at,overdue:!referenceOnly&&channelStatus!=='external_role_disabled'&&channelStatus!=='external_pr_delivery_recorded'&&!!deadline_at&&Date.now()>Date.parse(deadline_at)&&!matched.length,id,file:path.relative(root,file).split(path.sep).join('/'),delivery_channel:channel?.channel||null,role_status:channel?.work_status||null,delegated:linked?.delegated===true,actual_provider:linked?.actual_provider||null,status:channelStatus|| (codeReceipts.some(r=>r.data.controller_review?.status==='accepted_with_explicit_corrections')?'controller_reviewed_checklist_only':delivery?'code_delivery_present_pending_review':matched.length>1?'ack_ambiguous_review_required':matched.length?'ack_present_unverified':'awaiting_agent_ack'),receipts:matched.map(r=>path.relative(root,r).split(path.sep).join('/')),claim_verified:false}];
 });return {tasks};
}

export const tasksForDate=(tasks,date)=>tasks.filter(t=>[date,date.replaceAll('-','')].some(d=>t.id.includes(d)||t.file.includes(d)));

export function datedReceipts(root,dirs,date){
 const day=value=>{try{return new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(value));}catch{return null;}};
 return dirs.flatMap(dir=>{const full=path.join(root,dir);if(!fs.existsSync(full))return [];return fs.readdirSync(full).filter(n=>n.endsWith('.json')).flatMap(n=>{try{const data=JSON.parse(fs.readFileSync(path.join(full,n),'utf8'));if(n.includes(date)||n.includes(date.replaceAll('-',''))||data.date===date||day(data.at)===date||day(data.latest_reconciled_at)===date)return [{path:dir+'/'+n,status:data.status||'receipt_present_status_unspecified',paid:typeof data.paid==='boolean'?data.paid:null}];}catch{}return [];});});
}

export function runSentinel(){
const REPO = process.cwd();
const args = process.argv.slice(2);
let dateArg = null;
for (let i = 0; i < args.length; i++) if (args[i] === '--date') dateArg = args[i + 1];

const pad = (n) => String(n).padStart(2, '0');
// 用 Intl 取北京时区日期/小时（避免手工加偏移导致的双重时区错误）
const fmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Shanghai',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', hour12: false,
});
const parts = Object.fromEntries(fmt.formatToParts(new Date()).map((p) => [p.type, p.value]));
const DATE = dateArg || `${parts.year}-${parts.month}-${parts.day}`;
const HH = pad(parseInt(parts.hour, 10) % 24);

const exists = (p) => fs.existsSync(path.join(REPO, p));
const readJson = (p) => {
  try { return JSON.parse(fs.readFileSync(path.join(REPO, p), 'utf8')); } catch { return null; }
};

const rows = [];
let dispatchReport;
const push = (item, state, evidence, note = '') => rows.push({ item, state, evidence, note });

/* ---------- 1. 日课产出 ---------- */
{
  const f = `data/results/${DATE}.json`;
  if (exists(f)) {
    const j = readJson(f);
    const cm = j?.core_memory || {};
    const seats = (j?.tasks || []).map((t) => `${t.agent}=${t.status}`).join(', ');
    push('日课产出', 'OK', f, `记忆 ${cm.loaded_files}/${cm.total_files}；${seats || '无席位记录'}`);
  } else {
    push('日课产出', 'MISSING', f, '尚未观察到当日文件；是否超时需按明确截止时间和运行回执判定，不能据此断定模型宕机。');
  }
}

/* ---------- 2/3. Read the real JSON receipts, not only legacy Markdown ---------- */
for(const [name,dirs] of [['AI雇AI回执(T1)',['knowledge/results/hire','knowledge/results/claude-team']],['投资观察回执(T2)',['knowledge/results/invest','knowledge/results/funded-invest','knowledge/results/defi']]]){
 const receipts=datedReceipts(REPO,dirs,DATE),blocked=receipts.some(r=>/blocked|failed|rejected|unknown/i.test(r.status));
 push(name,blocked?'BLOCKED':receipts.length?'OK':'NONE',dirs.join(' / '),receipts.length?receipts.slice(0,8).map(r=>r.path+':'+r.status+';paid='+String(r.paid)).join('；')+'。只记录回执存在与状态，不据此推断本日新付款/投资。':'今日无相应JSON回执，不据此发起投资或模型调用。');
}

/* ---------- 4. 派单台账：超时 / 阻塞 ---------- */
{
  const ledger = 'ops/派单台账.md';
  if (!exists(ledger)) {
    push('派单台账', 'UNKNOWN', ledger, '台账文件不存在 —— 未配置');
  } else {
    const txt = fs.readFileSync(path.join(REPO, ledger), 'utf8');
    const lines = txt.split('\n').filter((l) => l.trim().startsWith('|') && l.includes('|'));
    const open = [];
    const blocked = [];
    for (const l of lines) {
      const cells = l.split('|').map((c) => c.trim());
      if (cells.length < 7) continue;
      const no = cells[1], obj = cells[3], task = cells[4], status = cells[6];
      if (!no || no === '单号' || /^-+$/.test(no)) continue;
      if (status.includes('阻塞')) blocked.push(`${no}（${obj}）${String(task).slice(0, 24)}`);
      else if (status.includes('执行中') || status.includes('未完成') || status.includes('返工'))
        open.push(`${no} → ${status}`);
    }
    push('历史派单台账·执行中（参考）', 'REFERENCE', ledger,
      open.length ? `${open.length} 项：${open.slice(0, 6).join('；')}${open.length > 6 ? ' …' : ''}` : '无');
    push('历史派单台账·阻塞（参考）', 'REFERENCE', ledger,
      blocked.length ? `${blocked.length} 项：${blocked.join('；')}` : '无');
  }
}

/* ---------- 5. 每小时扫描自身是否已配置 ---------- */
{
  const self = '.github/workflows/dispatch-sentinel.yml';
  push('每小时扫描配置', exists(self) ? 'CONFIGURED' : 'UNCONFIGURED', self,
    exists(self) ? '哨兵工作流已在库' : '哨兵工作流尚未入库 —— 未配置（明说）');
}

/* ---------- 6. Today's actual dispatch cards, not one historical path ---------- */
{
 const oversight=runDispatchOversight({root:REPO,sourceCommit:process.env.GITHUB_SHA||null,runId:process.env.GITHUB_RUN_ID||'local'});
 const index=indexDispatch(REPO),today=tasksForDate(index.tasks,DATE);
 for(const task of oversight.tasks.filter(t=>t.date===DATE)){const i=today.findIndex(t=>t.id===task.id);const observed={...task,file:task.evidence[0],claim_verified:task.claim_verified===true};if(i<0)today.push(observed);else today[i]=observed;}
 push('千问·总控与Claude漏单监督',oversight.warnings.length?'BLOCKED':'OK','knowledge/results/dispatch/oversight/latest.json',`${oversight.backlog.unique_original_tasks} 个原任务/${oversight.warnings.length} 条警告；验证认领 ${oversight.stage_counts.claims_verified}、提交 ${oversight.stage_counts.submissions_verified}、独立审核 ${oversight.stage_counts.independent_reviews_verified}、代码交付 ${oversight.stage_counts.engineering_deliveries_verified}、上线 ${oversight.stage_counts.production_deployments_verified}（仅本扫描证据）；派单数不计闭环，千问回归单与正式日课分开。`);
 push('今日派单跟踪',today.some(t=>t.overdue)?'BLOCKED':today.length?'OK':'UNKNOWN','ops/dispatch/',today.length?today.map(t=>t.id+':'+t.status).join('；'):'今日未找到正式assigned派单原件');
 const dir=path.join(REPO,'knowledge/results/dispatch');fs.mkdirSync(dir,{recursive:true});
 dispatchReport={at:new Date().toISOString(),date:DATE,executed_by:'workbuddy_dispatch_automation',execution_source:'repository_rules_not_WorkBuddy_client',model_calls:0,tasks:today,overdue_count:today.filter(t=>t.overdue).length,deadline_unverified_count:today.filter(t=>!t.deadline_verified).length,claim_verified:false};
}

/* ---------- 输出 ---------- */
const icon = { REFERENCE: 'ℹ️', OK: '✅', NONE: '⬜', MISSING: '❌', BLOCKED: '🔴', OPEN: '🟡', UNKNOWN: '❓', CONFIGURED: '✅', UNCONFIGURED: '❌' };
const alert = rows.filter((r) => ['MISSING', 'BLOCKED', 'UNKNOWN', 'UNCONFIGURED', 'NONE'].includes(r.state));

let md = `# 派单哨兵回执 · ${DATE} ${HH}:00 (CST)\n\n`;
md += `> 自动生成 · 无 AI key 依赖 · 状态一律以仓库交付/运行证据为准\n\n`;
md += `## 扫描结果\n\n| 检查项 | 状态 | 证据 | 说明 |\n|---|---|---|---|\n`;
for (const r of rows) md += `| ${r.item} | ${icon[r.state] || ''} ${r.state} | \`${r.evidence}\` | ${r.note} |\n`;

md += `\n## 需要处理的（超时 / 阻塞 / 未配置）\n\n`;
if (!alert.length) md += `无 —— 本轮全部正常。\n`;
else for (const r of alert) md += `- ${icon[r.state] || ''} **${r.item}**：${r.note}\n`;

md += `\n## 明说事项\n\n`;
md += `- 扫描器只读仓库；Actions执行器用限本工作流的内置Token读取运行/步骤状态，另存于 knowledge/results/dispatch/sentinel-coverage/latest.json。未读到的日志不推定成功。\n`;
md += `- 业务告警与扫描/提交故障分开：有阻塞项仍可成功扫描并落盘，不用历史小时文件数除以理论定时次数推算落盘率。\n`;
md += `- 若某检查项证据文件不存在，状态记 \`UNKNOWN\`，**不假装通过**。\n`;

const run=process.env.GITHUB_RUN_ID||'local',attempt=process.env.GITHUB_RUN_ATTEMPT||'1';
if(!/^(?:[0-9]+|local)$/.test(run)||!/^\d+$/.test(attempt))throw Error('invalid_sentinel_run_identity');
const runDir=path.join(REPO,'knowledge/results/dispatch/sentinel-runs');fs.mkdirSync(runDir,{recursive:true});
Object.assign(dispatchReport,{run_id:run,run_attempt:attempt,scan_status:alert.length?'completed_with_business_alerts':'completed',checks:rows,business_alerts:alert.map(r=>({item:r.item,state:r.state})),unique_receipt:'knowledge/results/dispatch/sentinel-runs/'+run+'-'+attempt+'.json',repository_persistence:'verify_by_committed_receipt_path'});
for(const file of [path.join(runDir,run+'-'+attempt+'.json'),path.join(REPO,'knowledge/results/dispatch/sentinel-latest.json')])fs.writeFileSync(file,JSON.stringify(dispatchReport,null,2)+'\n');
const outDir = path.join(REPO, 'memory/sentinel');
fs.mkdirSync(outDir, { recursive: true });
const outFile = path.join(outDir, `${DATE}-${HH}.md`);
fs.writeFileSync(outFile, md, 'utf8');

console.log(md);
console.log(`\n[written] memory/sentinel/${DATE}-${HH}.md`);
console.log(`[summary] ${rows.length} checks, ${alert.length} need attention`);
if (alert.length) {
  console.log('[alert-items] ' + alert.map((r) => `${r.item}=${r.state}`).join(' | '));
}

}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)runSentinel();
