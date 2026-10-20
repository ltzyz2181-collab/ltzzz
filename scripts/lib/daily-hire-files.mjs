import fs from 'node:fs';import path from 'node:path';import {execFileSync} from 'node:child_process';
import {dailyHireId} from '../../wep3-procurement-contract.js';
import {dailyHireAssignment,digest} from './daily-external-hire.mjs';
import {internalHireEvidence} from './internal-daily-hire.mjs';
export const dailyHirePath=date=>'knowledge/results/claude-team/real-hire-'+date.replaceAll('-','')+'.json';
export function saveDailyHire(record){
 const file=dailyHirePath(record.date),dir=path.dirname(file);fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(record,null,2)+'\n');
 const rows=[],invalid=[];
 for(const name of fs.readdirSync(dir).filter(n=>/^real-hire-\d{8}\.json$/.test(n)).sort())try{
  if(fs.lstatSync(dir+'/'+name).isSymbolicLink())throw Error();
  const row=JSON.parse(fs.readFileSync(dir+'/'+name));
  if(dailyHireId(row.date)!==row.task_id||!['internal','external'].includes(row.mode)||row.mode==='external'&&row.order?.paid&&!/^\d+$/.test(row.order.amount_raw||''))throw Error();rows.push(row);
 }catch{invalid.push(name);}
 const unique=[...new Map(rows.map(r=>[r.task_id,r])).values()];
 const metrics={scope:'daily_hire_receipts_only_not_project_total_or_original_EXT_order',invalid_receipts:invalid,orders:unique.length,
  internal_orders:unique.filter(r=>r.mode==='internal').length,accepted:unique.filter(r=>r.delivery_accepted||r.order?.delivery_accepted).length,
  rejected:unique.filter(r=>['internal_delivery_rejected','paid_delivery_rejected'].includes(r.status)).length,
  external_paid_orders:unique.filter(r=>r.mode==='external'&&r.order?.paid).length,
  external_usdc_paid_raw:unique.filter(r=>r.mode==='external'&&r.order?.paid).reduce((sum,r)=>sum+BigInt(r.order.amount_raw),0n).toString(),
  internal_credit_settlement:'not_performed_by_this_pipeline',model_API_usage_is_separate_from_USDC_settlement:true};
 fs.writeFileSync(dir+'/daily-hire-metrics.json',JSON.stringify(metrics,null,2)+'\n');
 const latest=unique.at(-1),usage=latest.upstream_model_usage||[];
 fs.writeFileSync(dir+'/daily-hire-latest.md',`# 每日AI雇佣数据 · ${latest.date}\n\n任务：${latest.task_id}；模式：${latest.mode}；状态：${latest.status}。\n\n来源调用：${usage.map(c=>c.executed_by+' / '+c.model+' / '+c.tokens_used+' tokens / run '+c.source_run_id).join('；')||'见订单回执，未补造调用'}。\n\nUSDC付款：${latest.paid===true?'已记录，详见交易哈希':'未付款'}；内部积分结算：未由本流程执行；工程草稿不代表生产部署。\n\n实物及独审哈希见 real-hire-${latest.date.replaceAll('-','')}.json。累计 ${metrics.orders} 单，验收 ${metrics.accepted}，拒收 ${metrics.rejected}。\n`);
}
export function prepareDailyHire({date,mode='internal',runId='local',sourceCommit,allowExistingOtherMode=false}){
 const id=dailyHireId(date),file=dailyHirePath(date);
 if(fs.existsSync(file)){const record=JSON.parse(fs.readFileSync(file));if(!allowExistingOtherMode&&record.mode!==mode)throw Error('daily_mode_already_assigned');return record;}
 sourceCommit||=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const ansPath='knowledge/results/ans-cycle/'+date+'.json',ans=fs.existsSync(ansPath)?JSON.parse(fs.readFileSync(ansPath)):null;
 const inputs=['wep3-market.js','wep3-aave.js','wep3-procurement-contract.js',...(ans?[ansPath]:[])].map(path=>({path,sha256:digest(fs.readFileSync(path))}));
 const context={source_commit:sourceCommit,input_sha256:digest(JSON.stringify(inputs.filter(x=>x.path!==ansPath))),ans_status:ans?.status||'not_available'};
 const record={...dailyHireAssignment({date,mode,sourceCommit,context,runId}),at:new Date().toISOString(),inputs,
  assignment_provenance:ans?.calls?.length?'linked_existing_ANS_assignment_no_backdated_claim':'dispatched_before_daily_hire_processing'};
 saveDailyHire(record);
 const goal=mode==='internal'?'消费现有ANS工作/独立审核任务，保存原生模型、用量、认领、交付哈希与拒收/验收数据；不新增模型调用、不结算真钱。':'采购一份Aave预览集成回归实物，最多0.05 Base USDC；交付须经豆包hash绑定独审。';
 fs.writeFileSync('ops/dispatch/'+id+'.md',`# ${id}\n\n类型：派单（固定规则，非Claude原生定时调用）\n模式：${mode}\n目标：${goal}\n输入：${inputs.map(x=>x.path+' @ '+x.sha256).join('\n')}\n输出：${file}\n验收：来源任务ID、实际提供商与结束原因、用量、原文哈希和异提供商审稿绑定；草稿不写成上线。\n禁止：倒填接单时间、重复调用/付款、缺证据写成功。内部积分与USDC分开，未结算即如实标注。\n来源：${sourceCommit}；运行：${runId}。\n`);
 return record;
}
export function reconcileInternalHire(date){
 if(!fs.existsSync(dailyHirePath(date)))return {date,mode:'internal',status:'daily_assignment_not_present',paid:false,tx_hash:null};
 const record=JSON.parse(fs.readFileSync(dailyHirePath(date)));if(record.mode!=='internal')return record;
 const sourcePath='knowledge/results/ans-cycle/'+date+'.json';
 const ans=fs.existsSync(sourcePath)?JSON.parse(fs.readFileSync(sourcePath)):null;
 const root=fs.realpathSync('.');const read=relative=>{const target=path.resolve(relative);if(!fs.realpathSync(target).startsWith(root+path.sep)||fs.lstatSync(target).isSymbolicLink())throw Error('evidence_symlink_rejected');return fs.readFileSync(target);};
 const result=internalHireEvidence(record,{ans,read,sourcePath});result.latest_reconciled_at=new Date().toISOString();saveDailyHire(result);return result;
}
