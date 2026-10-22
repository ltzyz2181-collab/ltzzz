import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {substantiveClaim,candidateImpact} from './memory-candidate-quality.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
const dayPattern=/^\d{4}-\d{2}-\d{2}$/;
export const projectDay=now=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));

// Agent output is an attributed observation/proposal, never an independently verified fact.
function observation(output){
 const text=output.replace(/\\n/g,'\n');
 const section=text.match(/【观】([\s\S]*?)(?=【|$)/) || text.match(/【角色产出】([\s\S]*?)(?=【|$)/);
 if(!section)return null;
 const lines=section[1].split('\n').map(s=>s.trim().replace(/^[-*]\s*/,''));
 for(const line of lines){
  const chunks=line.length<=240?[line]:line.split(/(?<=[。；])\s*/u);
  const quote=chunks.find(s=>s.length<=240&&substantiveClaim(s)&&!/^`?(?:git|node|npm|curl)\s/.test(s));
  if(quote)return {claim:quote,kind:section[0].startsWith('【观】')?'agent_observation_unverified':'agent_proposal_unverified'};
 }
 return null;
}
export function collectAgentMemory({root='.',date=projectDay(new Date()),now=new Date().toISOString()}={}){
 if(!dayPattern.test(date)||!Number.isFinite(Date.parse(now)))throw Error('invalid_agent_memory_date');
 const directory=path.join(root,'data/memory'),items=[],coverage=[];
 if(!fs.existsSync(directory))return {date,at:now,items,coverage};
 for(const name of fs.readdirSync(directory).filter(n=>/^[a-z][a-z0-9_-]*\.json$/.test(n)).sort()){
  const sourceFile='data/memory/'+name,agent=name.slice(0,-5),bytes=fs.readFileSync(path.join(root,sourceFile));
  let doc;try{doc=JSON.parse(bytes);}catch{coverage.push({agent,source:sourceFile,error:'invalid_json'});continue;}
  for(const [index,entry] of (Array.isArray(doc.entries)?doc.entries:[]).entries()){
   if(entry?.date!==date)continue;
   const entryText=JSON.stringify(entry),entryHash=sha(entryText),row={agent,source:sourceFile,source_file_sha256:sha(bytes),entry_index:index,entry_date:date,entry_sha256:entryHash,entry_hash_encoding:'UTF-8 JSON.stringify(entry)',candidate_id:null};coverage.push(row);
   if(entry.source_attribution_review?.eligible_for_promotion===false){row.skipped='source_attribution_rejected';continue;}
   if(entry.delivery_integrity?.status!=='structurally_complete'||!['stop','end_turn','end'].includes(entry.finish_reason)||typeof entry.output!=='string'){row.skipped='incomplete_or_unverified_delivery';continue;}
   if(/-----BEGIN[^\n]*PRIVATE KEY|\b(?:sk-[A-Za-z0-9_-]{24,}|rah_[a-f0-9]{32})\b/.test(entryText)){row.skipped='sensitive_output_not_copied';continue;}
   const chosen=observation(entry.output);if(!chosen){row.skipped='no_substantive_observation';continue;}
   const source=`memory/daily/agent-${date}-${agent}-${entryHash.slice(0,12)}.md`;
   const snapshot=`# Agent Memory 来源快照\n\n${chosen.claim}\n\n- 来源：${sourceFile}\n- 日期：${date}\n- 执行署名：${entry.executed_by||agent}\n- 模型（来源条目报告）：${entry.model||'未报告'}\n- 条目哈希：${entryHash}\n- 类型：AI观察或建议，尚未独立核验；完整生成不等于事实成立、交付验收或部署。\n\n## 原始产出（仅将文字\\n显示为换行）\n\n${entry.output.replace(/\\n/g,'\n')}\n`;
   const full=path.join(root,source);fs.mkdirSync(path.dirname(full),{recursive:true});
   if(fs.existsSync(full)){if(fs.readFileSync(full,'utf8')!==snapshot)throw Error('immutable_agent_memory_snapshot_differs');}else fs.writeFileSync(full,snapshot,{flag:'wx'});
   const id=`CAND-${date.replaceAll('-','')}-${agent}-${entryHash.slice(0,8)}`;row.candidate_id=id;row.snapshot=source;
   items.push({id,source,source_sha256:sha(snapshot),snapshot_hash:sha(snapshot).slice(0,12),claim:chosen.claim,claim_type:chosen.kind,evidence_tier:'agent_output_pending_independent_review',origin:{path:sourceFile,agent,date,entry_sha256:entryHash,entry_hash_encoding:row.entry_hash_encoding},impact:candidateImpact(chosen.claim),status:'candidate',deduped:true,conflicts:[],human_confirm:false,human_confirmation_required:false,review_status:'pending_review'});
  }
 }
 return {date,at:now,items,coverage};
}
