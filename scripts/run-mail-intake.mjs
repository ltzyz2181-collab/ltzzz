#!/usr/bin/env node
// 每日邮件摄入总入口：一次跑完两条收信通道并合并成一份可核验结果。
//   1) Agent Mail（agently-cli，qingqizhu6502@agent.qq.com 收件箱）
//   2) Gmail 全箱（ltzyz2181@gmail.com，IMAP 应用专用密码，见 docs/MAIL-CHANNEL-CURRENT.md 第 6 节）
// 只落脱敏状态与短标题；正文永不落盘。任一通道失败都不伪装成功：分别记状态，
// 合并结果的 status 取 ok / partial / failed。
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execFileAsync=promisify(execFile);

const ROOT='/home/user/ltzzz';
const OUT_DIR=path.join(ROOT,'knowledge/results/deep-superagent/mail-intake');
const OUT=path.join(OUT_DIR,'latest.json');
const BACKLOG=path.join(ROOT,'knowledge/results/deep-superagent/mail-backlog/latest.json');
const FULLBOX=path.join(ROOT,'knowledge/results/deep-superagent/mail-fullbox/latest.json');
const ENV_FILE=path.join(process.env.HOME||'/home/user','.config/ltzzz/gmail-imap.env');

// 凭据只从仓库外的 600 权限文件读，缺失就交给脚本自己 fail-closed。
function loadGmailEnv(){
  if(process.env.GMAIL_IMAP_APP_PASSWORD)return;
  try{
    const raw=fs.readFileSync(ENV_FILE,'utf8');
    for(const line of raw.split('\n')){
      const m=line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.+?)\s*$/);
      if(m&&!process.env[m[1]])process.env[m[1]]=m[2];
    }
  }catch{/* 没有凭据文件就走 creds_missing 路径 */}
}

function run(cmd,args){
  const r=spawnSync(cmd,args,{cwd:ROOT,encoding:'utf8',timeout:15*60*1000,env:{...process.env,PATH:(process.env.PATH||'')+':'+(process.env.HOME||'')+'/.npm-global/bin'}});
  return {code:r.status,stdout:(r.stdout||'').trim().slice(0,400),stderr:(r.stderr||'').trim().slice(0,400),error:r.error?String(r.error.message).slice(0,200):null};
}
function readJson(p,fallback){try{return JSON.parse(fs.readFileSync(p,'utf8'));}catch{return fallback;}}

loadGmailEnv();

const backlogRun=run('node',['scripts/collect-mail-backlog.mjs']);
const gmailRun=run('python3',['scripts/collect-gmail-imap.py']);

const backlog=readJson(BACKLOG,{status:'missing',items:[],count:0,open_count:0});
const fullbox=readJson(FULLBOX,{status:'missing',messages:[],count:0,open_count:0});

const unified=[];
for(const it of backlog.items||[]){
  unified.push({channel:'agent_mail',ref:it.ref,status:it.status,age_days:it.age_days??null,subject_short:it.subject_public||'',has_dispatch_wording:!!it.has_dispatch_wording});
}
for(const m of fullbox.messages||[]){
  if(m.status==='closed'&&!m.unread)continue;   // 已读且明确闭环的不进待办
  unified.push({channel:'gmail_fullbox',ref:m.ref,status:m.status,age_days:null,subject_short:m.subject_short||'',has_dispatch_wording:!!m.has_dispatch_wording});
}
const openItems=unified.filter(x=>x.status==='open'||x.has_dispatch_wording);
const dedup=[...new Map(openItems.map(x=>[x.ref,x])).values()].slice(0,200);

const gmailOk=fullbox.status==='ok';
const backlogOk=backlogRun.code===0&&Array.isArray(backlog.items);
const status=gmailOk&&backlogOk?'ok':(gmailOk||backlogOk?'partial':'failed');

const payload={
  schema:'ltzzz.mail-intake.v1',
  at:new Date().toISOString(),
  status,
  read_only:true,
  bodies_persisted:false,
  agent_mail:{status:backlog.status??'ok',count:backlog.count||0,open_count:backlog.open_count||0,run_code:backlogRun.code,error:backlogRun.error},
  gmail_fullbox:{status:fullbox.status,count:fullbox.count||0,open_count:fullbox.open_count||0,full_box_total:fullbox.full_box_total??null,full_box_unseen:fullbox.full_box_unseen??null,provider:fullbox.provider??null,window_truncated:fullbox.window_truncated??null,run_code:gmailRun.code,error:gmailRun.error},
  counts:{unified:unified.length,open_or_dispatch:dedup.length},
  open_items:dedup,
  sources:{agent_mail:'knowledge/results/deep-superagent/mail-backlog/latest.json',gmail_fullbox:'knowledge/results/deep-superagent/mail-fullbox/latest.json'},
};

fs.mkdirSync(OUT_DIR,{recursive:true});
fs.writeFileSync(OUT,JSON.stringify(payload,null,1)+'\n');
// 每日必答：今天有没有收到 GPT 裁决回信。读不到邮箱记 unknown，不默认成"没收到"。
try{
  const {stdout}=await execFileAsync(process.execPath,[path.join(ROOT,'scripts/check-gpt-ruling-mail.mjs')],{timeout:90000,cwd:ROOT});
  const line=String(stdout).trim().split('\n').pop();
  console.log(line);
}catch(error){
  console.log(JSON.stringify({status:'unknown',received:'unknown',note:'GPT 裁决邮件检查失败：'+String(error.message).slice(0,160)}));
}
console.log(JSON.stringify({status,agent:payload.agent_mail,gmail:payload.gmail_fullbox,open:dedup.length}));
process.exit(status==='failed'?3:0);
