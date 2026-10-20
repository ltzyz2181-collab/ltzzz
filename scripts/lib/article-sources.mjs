import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
// Today's engineering evidence comes first. Historical economic experiment files
// must never fill the context before current production receipts.
export function gatherArticleSources({root=process.cwd(),date}){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('invalid_article_date');
 const sources=[],parts=[];let used=0;
 const add=(relative,scope,limit=3200)=>{
  const file=path.join(root,relative);if(!fs.existsSync(file)||!fs.lstatSync(file).isFile())return;
  const raw=fs.readFileSync(file,'utf8');let value=raw,sourceDate=scope==='same_day'?date:null,observedAt=null;
  if(relative.endsWith('.json')){
   const data=JSON.parse(raw);
   if(scope==='same_day'&&data.date!==date)return;
   if(scope==='timestamped_snapshot'){
    observedAt=data.ran_at;if(!Number.isFinite(Date.parse(observedAt)))return;
    sourceDate=new Date(Date.parse(observedAt)+8*3600000).toISOString().slice(0,10);if(sourceDate!==date)return;
   }
   if(relative.includes('real-hire-'))value=JSON.stringify(Object.fromEntries(['date','mode','task_id','status','paid','tx_hash','new_model_calls_this_run','new_payments_this_run','upstream_model_usage','action_taken','follow_up_receipt','deployed'].filter(k=>k in data).map(k=>[k,data[k]])));
   if(scope==='timestamped_deployment')value=JSON.stringify({at:data.at,run_id:data.run_id||data.execution_id,source_commit:data.source_commit,status:data.status,ok:data.ok,version:data.health?.version,financial_book_unchanged:data.financial_book_unchanged,model_calls:data.model_calls,transactions:data.transactions,scope:'actual_component_deployment_not_the_generated_ANS_patch'});
  }
  const header=`## ${relative} [${scope}]\n`,separator=parts.length?2:0,available=16000-used-separator-header.length;
  if(available<1)return;const excerpt=value.slice(0,Math.min(limit,available));if(!excerpt)return;
  sources.push({path:relative,scope,source_date:sourceDate,observed_at:observedAt,sha256:createHash('sha256').update(raw).digest('hex'),included_chars_before_redaction:excerpt.length,excerpt_truncated:excerpt.length<value.length});
  parts.push(header+excerpt);used+=separator+header.length+excerpt.length;
 };
 add('knowledge/results/claude-team/real-hire-'+date.replaceAll('-','')+'.json','same_day');
 add('knowledge/results/ans-cycle/'+date+'.json','same_day');
 add('knowledge/results/pulse/latest.json','timestamped_snapshot',2400);
 for(const [dir,prefix,pattern] of [['knowledge/results/pulse','deploy-',/^deploy-\d+\.json$/],['knowledge/results/wep3','durable-state-',/^durable-state-\d+\.json$/]]){
  const folder=path.join(root,dir);if(!fs.existsSync(folder))continue;
  const names=fs.readdirSync(folder).filter(n=>n.startsWith(prefix)&&pattern.test(n)).sort().reverse();
  const name=names.find(n=>{try{const d=JSON.parse(fs.readFileSync(path.join(folder,n),'utf8'));return d.ok===true||d.status==='deployed_and_live_observations_recorded';}catch{return false;}});
  if(name)add(dir+'/'+name,'timestamped_deployment',1200);
 }
 add('data/results/'+date+'.json','same_day',2400);
 add('memory/daily/summary-'+date+'.md','same_day',1600);
 const publishing=path.join(root,'results/publishing');
 if(fs.existsSync(publishing))for(const prefix of ['youtube-manual-','youtube-daily-','wechat-owner-publication-']){
  const names=fs.readdirSync(publishing).filter(n=>n.startsWith(prefix)&&n.endsWith('.json')).sort().reverse();
  const name=names.find(n=>{try{return JSON.parse(fs.readFileSync(path.join(publishing,n),'utf8')).published===true;}catch{return false;}});
  if(name)add('results/publishing/'+name,'historical_publication_reference_not_today',1600);
 }
 return {sources,text:parts.join('\n\n')};
}
