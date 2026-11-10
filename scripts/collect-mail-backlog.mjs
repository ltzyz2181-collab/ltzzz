#!/usr/bin/env node
// 每日邮件待办采集：把收件箱里"派单/裁决/待决"类邮件折成一份脱敏待办清单。
// 只落脱敏字段，不落正文：外部模型席位只允许看 public_distributable 内容。
// 幂等：同一封邮件按 message_id 去重；清单只保留最近 N 天的未闭环项。
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';

const OUT='knowledge/results/deep-superagent/mail-backlog/latest.json';
const WINDOW_DAYS=21;
const LIMIT=50;
// 派单类关键词：命中任一即视为"有遗留任务语义"
const DISPATCH=/^\[?[\s]*?(gpt)?[\s]*(派单|裁决|待决|待处置|待办|未完成|欠|缺口|pending|action required)/i;
// 已闭环关键词：命中即视为该邮件所述已收口
const CLOSED=/验收通过|已合并|已部署|部署完成|已闭环|已收口|已修复并部署|already merged|accepted/;

function run(args){
  const bin=process.env.AGENTLY_CLI||'agently-cli';
  const env={...process.env,PATH:process.env.PATH+':'+(process.env.HOME||'')+'/.npm-global/bin'};
  return execFileSync(bin,args,{encoding:'utf8',env,maxBuffer:4*1024*1024,timeout:60000});
}

export function parseList(raw){
  const i=raw.indexOf('{');
  if(i<0)throw Error('mail_list_not_json');
  const d=JSON.parse(raw.slice(i));
  const items=(d?.data?.data)||[];
  if(!Array.isArray(items))throw Error('mail_list_schema_invalid');
  return items;
}

// 脱敏：只保留可外发的最小事实面。正文与 snippet 一律不外带，
// 本地用 snippet 判状态，外发只给状态标签。
export function toPublicItem(m){
  const subject=String(m?.subject||'').replace(/[0-9]+\.[0-9]+\s*(UT|USDT|CNY|USD)/gi,'<amount>').slice(0,72);
  const snippet=String(m?.snippet||'');
  const created=String(m?.created_at||'');
  const ageDays=created?Math.max(0,Math.floor((Date.now()-Date.parse(created))/86400000)):null;
  // 状态判定只用 subject+snippet 的组合信号：
  //  闭环 —— 明确写了验收通过/已合并/已部署/已修复
  //  进行中 —— 写了等待/待补/阻塞/未回/缺口
  //  未知 —— 都没有，需要人工看
  const closedHit=CLOSED.test(subject)||CLOSED.test(snippet);
  const openHit=/等待|待补|待回|待裁决|阻塞|未回|缺口|尚未|未完成|请据此|请回|pending|required/i.test(subject+snippet);
  const status=closedHit&&!openHit?'closed':openHit?'open':'unknown';
  return {
    ref:createHash('sha256').update(String(m?.message_id||'')).digest('hex').slice(0,16),
    has_dispatch_wording:DISPATCH.test(subject),
    status,
    read:Boolean(m?.is_read),
    age_days:ageDays,
    subject_public:subject
  };
}

export function buildBacklog(messages){
  const now=Date.now();
  const seen=new Set();
  const items=[];
  for(const m of messages){
    const id=String(m?.message_id||'');
    if(!id||seen.has(id))continue;
    seen.add(id);
    const created=Date.parse(String(m?.created_at||''));
    if(!Number.isFinite(created))continue;
    if((now-created)/86400000>WINDOW_DAYS)continue;
    const item=toPublicItem(m);
    if(item.status==='closed')continue;                    // 已写明收口的不是遗留项
    items.push(item);
  }
  items.sort((a,b)=>{
    const rank=x=>x.status==='open'?0:1;                    // 明确进行中的排前面
    return rank(a)-rank(b)||(b.age_days??0)-(a.age_days??0);
  });
  const material=JSON.stringify(items.map(x=>[x.ref,x.subject_public,x.age_days,x.status]));
  return {schema:'ltzzz.deep-superagent.mail-backlog.v1',generated_at:new Date().toISOString(),window_days:WINDOW_DAYS,count:items.length,open_count:items.filter(x=>x.status==='open').length,items,readset_sha256:createHash('sha256').update(material).digest('hex'),contains_mail_body:false,external_model_safe:true};
}

export function collect({root=process.cwd(),raw=null}={}){
  const messages=raw?parseList(raw):parseList(run(['message','+list','--dir','inbox','--limit',String(LIMIT)]));
  const backlog=buildBacklog(messages);
  const out=path.join(root,OUT);
  fs.mkdirSync(path.dirname(out),{recursive:true});
  fs.writeFileSync(out,JSON.stringify(backlog,null,2)+'\n');
  return {backlog,path:OUT};
}

if(import.meta.url===`file://${process.argv[1]}`){
  try{
    const {backlog,path:outPath}=collect({});
    console.log(JSON.stringify({ok:true,status:'mail_backlog_written',path:outPath,count:backlog.count,sha256:backlog.readset_sha256,contains_mail_body:false},null,2));
  }catch(e){
    console.log(JSON.stringify({ok:false,status:'mail_backlog_failed',error:String(e?.message||e).slice(0,120)},null,2));
    process.exitCode=1;
  }
}
