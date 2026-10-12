import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';import {pathToFileURL} from 'node:url';
export function indexDispatch(root='.'){
 const walk=p=>!fs.existsSync(p)?[]:fs.readdirSync(p,{withFileTypes:true}).flatMap(x=>x.isDirectory()?walk(path.join(p,x.name)):[path.join(p,x.name)]);
 const files=walk(path.join(root,'ops/dispatch')).filter(p=>p.endsWith('.md'));
 const receipt=p=>p.split(path.sep).includes('receipts')||path.basename(p).startsWith('接单回执-');
 const receipts=files.filter(receipt);
 const tasks=files.filter(p=>!receipt(p)).map(file=>{
  const text=fs.readFileSync(file,'utf8'),id=path.basename(file,'.md');
  const matches=receipts.filter(p=>{const content=fs.readFileSync(p,'utf8');const declared=content.match(/^\s*单号\s*[:：]\s*`?([^`\s]+)`?\s*$/m)?.[1];return declared?declared===id:path.basename(p,'.md')==='接单回执-'+id;});
  return {id,file:path.relative(root,file),sha256:crypto.createHash('sha256').update(text).digest('hex'),status:matches.length===1?'ack_present_unverified':matches.length>1?'ack_ambiguous_review_required':'awaiting_agent_ack',ack:matches.length===1?path.relative(root,matches[0]):null,ack_candidates:matches.map(p=>path.relative(root,p))};
 });
 return {schema:'ltzzz.dispatch.v2',tasks,model_calls:0,claim:'回执单号关联只证明接单记录存在，不代表交付验收或付款。'};
}
if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){const result=indexDispatch();fs.mkdirSync('knowledge/results/dispatch',{recursive:true});fs.writeFileSync('knowledge/results/dispatch/latest.json',JSON.stringify(result,null,2)+'\n');console.log('Indexed '+result.tasks.length+' dispatch files; no AI key needed.');}
