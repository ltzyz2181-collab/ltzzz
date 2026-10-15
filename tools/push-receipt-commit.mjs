import {spawnSync} from 'node:child_process';import {pathToFileURL} from 'node:url';
export function git(cwd,args){const r=spawnSync('git',args,{cwd,encoding:'utf8'});return {...r,stdout:r.stdout||'',stderr:r.stderr||''};}
export function pushReceiptCommit({cwd=process.cwd(),attempts=4,beforePush=()=>{}}={}){
 for(let attempt=0;attempt<attempts;attempt++){
  if(git(cwd,['fetch','origin','main']).status!==0)throw Error('receipt_fetch_failed');
  if(git(cwd,['rebase','origin/main']).status!==0){git(cwd,['rebase','--abort']);throw Error('receipt_rebase_conflict_preserved_without_overwrite');}
  beforePush(attempt);
  const push=git(cwd,['push','origin','HEAD:main']);
  if(push.status===0)return {ok:true,attempts:attempt+1,commit:git(cwd,['rev-parse','HEAD']).stdout.trim()};
  if(!/non-fast-forward|fetch first|cannot lock ref|failed to update ref/i.test(push.stderr))throw Error('receipt_push_failed_not_a_concurrent_update');
 }
 throw Error('receipt_push_concurrent_update_retry_limit');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{console.log(JSON.stringify(pushReceiptCommit()));}catch(e){console.error(e.message);process.exitCode=1;}
