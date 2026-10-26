import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {reconcileGithubApi,reconcileStop} from './lib/patchgate-a2-reconcile.mjs';
import {collectSnapshot} from './patchgate.mjs';
import {sha256,canonical} from './lib/patchgate.mjs';
import {pushReceiptCommit} from '../tools/push-receipt-commit.mjs';
const git=args=>execFileSync('git',args,{encoding:'utf8',stdio:['ignore','pipe','pipe'],env:{...process.env,GIT_NO_REPLACE_OBJECTS:'1'}}).trim();
const source=git(['rev-parse','HEAD']);
if(process.env.GITHUB_REPOSITORY!=='ltzyz2181-collab/ltzzz'||process.env.GITHUB_REF!=='refs/heads/main'||process.env.GITHUB_SHA!==source)throw Error('trusted_main_reconciliation_only');
const policy=JSON.parse(fs.readFileSync('config/patchgate-a2-reconcile.json'));
if(policy.schema!=='ltzzz.patchgate.a2-reconcile-policy.v1'||policy.task_id!=='PLAN-PATCHGATE-ESCROW-20261023'||typeof policy.automatic_release_enabled!=='boolean'||policy.financial_execution!==false)throw Error('fixed_reconciliation_policy_required');
const persistIntent=async intent=>{
  const key=sha256(intent.head_sha+':'+intent.original_receipt.sha256+':'+intent.release_basis),file='knowledge/results/patchgate/reconciliations/intents/'+key+'.json';
  fs.mkdirSync('knowledge/results/patchgate/reconciliations/intents',{recursive:true});
  if(fs.existsSync(file)){
    const old=JSON.parse(git(['show','HEAD:'+file]));
    if(old.head_sha!==intent.head_sha||old.original_receipt.sha256!==intent.original_receipt.sha256||old.release_basis!==intent.release_basis||canonical(old.postmerge_verification||null)!==canonical(intent.postmerge_verification||null))throw Error('existing_intent_binding_mismatch');
  }else{
    fs.writeFileSync(file,JSON.stringify(intent,null,2)+'\n',{flag:'wx'});git(['config','user.name','ltzzz-bot']);git(['config','user.email','bot@ltzzz.com']);git(['add','--',file]);git(['commit','-m','Reserve original-task latch reconciliation intent before release']);pushReceiptCommit();
  }
  git(['fetch','origin','main']);const durable=JSON.parse(git(['show','origin/main:'+file]));
  if(durable.head_sha!==intent.head_sha||durable.original_receipt.sha256!==intent.original_receipt.sha256||durable.release_basis!==intent.release_basis)throw Error('intent_main_readback_failed');
  return {verified:true,commit_sha:git(['rev-parse','origin/main']),path:file};
};
const report=await reconcileStop({api:reconcileGithubApi({token:process.env.GITHUB_TOKEN}),authority:policy.execution_authority,apply:policy.automatic_release_enabled,persistIntent,readSource:async({base,head})=>{
  for(const sha of [base,head]){if(!/^[a-f0-9]{40}$/.test(sha))throw Error('full_source_commit_required');git(['fetch','--no-tags','origin',sha]);}
  return collectSnapshot({base,head,taskId:'PLAN-PATCHGATE-ESCROW-20261023'});
}});
Object.assign(report,{run_id:process.env.GITHUB_RUN_ID,source_commit:source});
fs.mkdirSync('knowledge/results/patchgate/reconciliations',{recursive:true});fs.writeFileSync('knowledge/results/patchgate/reconciliations/'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
