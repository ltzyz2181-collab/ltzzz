import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
export function git(cwd,args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});return {...r,stdout:r.stdout||'',stderr:r.stderr||''};}
export function pushReceiptCommit({cwd=process.cwd(),attempts=4,beforePush=()=>{}}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  if(git(cwd,['fetch','origin','main']).status!==0)throw Error('receipt_fetch_failed');
  // 同一 run 里可能刚写完邮件采集等未提交的公开证据；git rebase 默认会因工作区
  // 不干净直接失败，被误判成并发冲突（run 46093726815）。autostash 只暂存/恢复
  // 本地未提交改动，不改变“冲突时不覆盖双方记录”的既有语义。
  if(git(cwd,['-c','rebase.autoStash=true','rebase','origin/main']).status!==0){git(cwd,['rebase','--abort']);throw Error('receipt_rebase_conflict_preserved_without_overwrite');}
  beforePush(attempt);
  const push=git(cwd,['push','origin','HEAD:main']);
  if(push.status===0)return {ok:true,attempts:attempt+1,commit:git(cwd,['rev-parse','HEAD']).stdout.trim()};
  if(!/non-fast-forward|fetch first|cannot lock ref|failed to update ref/i.test(push.stderr))throw Error('receipt_push_failed_not_a_concurrent_update');
 }
 throw Error('receipt_push_concurrent_update_retry_limit');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{console.log(JSON.stringify(pushReceiptCommit()));}catch(e){console.error(e.message);process.exitCode=1;}
