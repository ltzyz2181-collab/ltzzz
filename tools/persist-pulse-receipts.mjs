import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {git} from './push-receipt-commit.mjs';

// Only generated Pulse evidence is copied into an isolated checkout. Never
// rebase, stash or overwrite the caller's files to reconcile a shared snapshot.
export function persistPulseReceipts({cwd=process.cwd(),runId=process.env.GITHUB_RUN_ID,attempts=4,beforePush=()=>{}}={}){
 if(!/^\d+$/.test(runId||''))throw Error('pulse_run_id_required');
 const relative='knowledge/results/pulse',source=path.join(cwd,relative);
 const pattern=new RegExp('^(deploy|watch)-'+runId+'(?:-attempt-\\d+(?:-pass-\\d+)?)?\\.json$');
 const receipts=fs.readdirSync(source).filter(n=>pattern.test(n)).map(name=>{
  const file=path.join(source,name);if(!fs.lstatSync(file).isFile())throw Error('pulse_receipt_must_be_regular_file');
  const text=fs.readFileSync(file,'utf8'),data=JSON.parse(text);
  if(String(data.run_id)!==runId)throw Error('pulse_receipt_run_mismatch');
  return {name,text,data,immutable:name.includes('-attempt-')};
 });
 if(!receipts.length)throw Error('pulse_run_receipt_missing');
 const latestFile=path.join(source,'latest.json');
 const snapshot=fs.existsSync(latestFile)?fs.readFileSync(latestFile,'utf8'):null;
 const snapshotTime=snapshot?Date.parse(JSON.parse(snapshot).ran_at):NaN;
 const command=(dir,args)=>{const result=git(dir,args);if(result.status!==0)throw Error('pulse_git_'+args[0]+'_failed');return result.stdout.trim();};
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'pulse-evidence-'));
 try{
  for(let attempt=0;attempt<attempts;attempt++){
   command(cwd,['fetch','origin','main']);const checkout=path.join(root,'attempt-'+attempt);
   command(cwd,['worktree','add','--detach',checkout,'origin/main']);
   try{
    const target=path.join(checkout,relative);fs.mkdirSync(target,{recursive:true});
    for(const receipt of receipts){
     const dest=path.join(target,receipt.name);
     if(fs.existsSync(dest)){
      const priorText=fs.readFileSync(dest,'utf8');if(priorText===receipt.text)continue;
      if(receipt.immutable)throw Error('immutable_pulse_evidence_conflict');
      const prior=JSON.parse(priorText);
      if(Date.parse(prior.at)>=Date.parse(receipt.data.at))continue;
     }
     fs.writeFileSync(dest,receipt.text);
    }
    const dest=path.join(target,'latest.json');
    const priorTime=fs.existsSync(dest)?Date.parse(JSON.parse(fs.readFileSync(dest,'utf8')).ran_at):NaN;
    if(Number.isFinite(snapshotTime)&&(!Number.isFinite(priorTime)||snapshotTime>priorTime))fs.writeFileSync(dest,snapshot);
    command(checkout,['add',relative]);
    if(git(checkout,['diff','--cached','--quiet']).status===0)return {ok:true,unchanged:true,attempts:attempt+1};
    command(checkout,['commit','-m','Preserve Pulse run '+runId+' evidence and newest observation']);
    beforePush(attempt);
    const pushed=git(checkout,['push','origin','HEAD:main']);
    if(pushed.status===0)return {ok:true,attempts:attempt+1,commit:command(checkout,['rev-parse','HEAD'])};
    if(!/non-fast-forward|fetch first|cannot lock ref|failed to update ref/i.test(pushed.stderr))throw Error('pulse_receipt_push_failed');
   }finally{command(cwd,['worktree','remove','--force',checkout]);}
  }
  throw Error('pulse_receipt_concurrent_retry_limit');
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)try{console.log(JSON.stringify(persistPulseReceipts()));}catch(error){console.error(error.message);process.exitCode=1;}
