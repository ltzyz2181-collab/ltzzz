import fs from 'node:fs';
import path from 'node:path';
import {dispatchCommand,REPO} from './lib/controller-workflow-command.mjs';
const event=process.env.GITHUB_EVENT_NAME;
let input;
if(event==='issue_comment'){
 const payload=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8')),body=payload.comment?.body,marker='LTZZZ_CONTROLLER_COMMAND\n';
 if(payload.comment?.user?.id!==261544579||typeof body!=='string'||!body.startsWith(marker)||body.length>2500)throw Error('registered_owner_controller_comment_required');
 input=body.slice(marker.length);
}else input=fs.readFileSync('ops/controller-command.json','utf8');
const command=JSON.parse(input);
const token=process.env.GITHUB_TOKEN;
if(!token||!process.env.RUNNER_TEMP)throw Error('managed_runner_required');
const api=async(method,route,body)=>{
 if(!route.startsWith('/repos/'+REPO+'/'))throw Error('fixed_repository_required');
 const response=await fetch('https://api.github.com'+route,{method,headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'},body:body===undefined?undefined:JSON.stringify(body),redirect:'error',signal:AbortSignal.timeout(20000)});
 let data=null;if(method==='GET'){const text=await response.text();if(text.length>150000)throw Error('bounded_GitHub_readback_required');try{data=JSON.parse(text);}catch{}}
 return {status:response.status,data};
};
const result=await dispatchCommand({command,api,context:{repository:process.env.GITHUB_REPOSITORY,ref:process.env.GITHUB_REF,event:process.env.GITHUB_EVENT_NAME,source:process.env.GITHUB_SHA,run_id:process.env.GITHUB_RUN_ID}});
fs.writeFileSync(path.join(process.env.RUNNER_TEMP,'controller-command.json'),JSON.stringify(result,null,2)+'\n');
console.log(JSON.stringify(result));
if(!result.dispatched)process.exitCode=1;
