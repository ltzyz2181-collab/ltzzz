import {validateIssueRequest, dedupeQuery} from '../../scripts/lib/meta-issue-policy.mjs';
import {validateMailRequest, mailDedupeQuery} from '../../scripts/lib/meta-mail-policy.mjs';

const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json'}});
const GH='https://api.github.com';
const ghHeaders=(token)=>({Authorization:`Bearer ${token}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28','User-Agent':'ltzzz-meta-hosted'});

async function createIssue(env,raw){
 const policy=validateIssueRequest(raw,{repo:env.GITHUB_ISSUES_REPO||'ltzyz2181-collab/ltzzz'});
 if(!policy.ok)return json({error:policy.error,schema:'ltzzz.meta-issue.v1'},policy.status);
 const item=policy.value;
 if(raw.dry_run===true)return json({ok:true,dry_run:true,schema:item.schema,issues_configured:Boolean(env.GITHUB_ISSUES_TOKEN),would_create:{repo:item.repo,title:item.title,labels:item.labels,body_bytes:item.body.length}});
 const token=env.GITHUB_ISSUES_TOKEN;
 if(!token)return json({error:'issues_not_configured',schema:item.schema},503);
 let existing=null;
 try{
  const q=encodeURIComponent(dedupeQuery({repo:item.repo,taskId:item.taskId}));
  const res=await fetch(`${GH}/search/issues?q=${q}&per_page=1`,{headers:ghHeaders(token),signal:AbortSignal.timeout(15000)});
  if(!res.ok)return json({error:res.status===401||res.status===403?'issues_token_rejected':'dedupe_unavailable',http:res.status},res.status===401||res.status===403?502:503);
  const data=await res.json();
  if(Number(data.total_count)>0&&data.items&&data.items[0])existing={number:data.items[0].number,url:data.items[0].html_url};
 }catch{return json({error:'dedupe_unavailable'},503);}
 if(existing)return json({schema:item.schema,status:'duplicate_skipped',number:existing.number,url:existing.url});
 let res;
 try{
  res=await fetch(`${GH}/repos/${item.repo}/issues`,{method:'POST',headers:{...ghHeaders(token),'Content-Type':'application/json'},body:JSON.stringify({title:item.title,body:item.body,labels:item.labels}),signal:AbortSignal.timeout(15000)});
 }catch{return json({error:'github_unreachable'},502);}
 if(!res.ok){const detail=await res.text();return json({error:res.status===401||res.status===403?'issues_token_rejected':'issue_create_failed',http:res.status,detail:String(detail).slice(0,200)},502);}
 const created=await res.json();
 return json({schema:item.schema,status:'created',number:created.number,url:created.html_url,labels:item.labels});
}

async function createMailRequest(env,raw){
 const policy=validateMailRequest(raw,{repo:env.GITHUB_ISSUES_REPO||'ltzyz2181-collab/ltzzz'});
 if(!policy.ok)return json({error:policy.error,schema:'ltzzz.meta-mail.v1'},policy.status);
 const item=policy.value;
 if(raw.dry_run===true)return json({ok:true,dry_run:true,schema:item.schema,issues_configured:Boolean(env.GITHUB_ISSUES_TOKEN),would_create:{repo:item.repo,title:item.title,labels:item.labels,to:item.to,body_bytes:item.body.length}});
 const token=env.GITHUB_ISSUES_TOKEN;
 if(!token)return json({error:'issues_not_configured',schema:item.schema},503);
 let existing=null;
 try{
  const q=encodeURIComponent(mailDedupeQuery({repo:item.repo,requestId:item.requestId}));
  const res=await fetch(`${GH}/search/issues?q=${q}&per_page=1`,{headers:ghHeaders(token),signal:AbortSignal.timeout(15000)});
  if(!res.ok)return json({error:res.status===401||res.status===403?'issues_token_rejected':'dedupe_unavailable',http:res.status},res.status===401||res.status===403?502:503);
  const data=await res.json();
  if(Number(data.total_count)>0&&data.items&&data.items[0])existing={number:data.items[0].number,url:data.items[0].html_url};
 }catch{return json({error:'dedupe_unavailable'},503);}
 if(existing)return json({schema:item.schema,status:'duplicate_skipped',number:existing.number,url:existing.url});
 let res;
 try{
  res=await fetch(`${GH}/repos/${item.repo}/issues`,{method:'POST',headers:{...ghHeaders(token),'Content-Type':'application/json'},body:JSON.stringify({title:item.title,body:item.body,labels:item.labels}),signal:AbortSignal.timeout(15000)});
 }catch{return json({error:'github_unreachable'},502);}
 if(!res.ok){const detail=await res.text();return json({error:res.status===401||res.status===403?'issues_token_rejected':'issue_create_failed',http:res.status,detail:String(detail).slice(0,200)},502);}
 const created=await res.json();
 return json({schema:item.schema,status:'queued',number:created.number,url:created.html_url,to:item.to,labels:item.labels,transport:'seat-mail-relay'});
}

export default {
 async fetch(request,env){
  const route=new URL(request.url).pathname;
  if(request.method==='GET'&&route==='/health')return json({service:'ltzzz-meta-hosted',provider:'cloudflare-workers-ai',model:env.META_MODEL,did:'did:ltzzz:meta',auth_configured:Boolean(env.META_WORKER_TOKEN),ai_binding:Boolean(env.AI),issues_configured:Boolean(env.GITHUB_ISSUES_TOKEN),mail_relay_configured:Boolean(env.GITHUB_ISSUES_TOKEN),mail_relay_transport:'seat-mail-relay',issues_repo:env.GITHUB_ISSUES_REPO||'ltzyz2181-collab/ltzzz',onchain_registered:false});
  if(request.method!=='POST'||!['/','/task','/auth-check','/issue','/mail'].includes(route))return json({error:'not_found'},404);
  if(!env.META_WORKER_TOKEN)return json({error:'auth_not_configured'},503);
  if(request.headers.get('Authorization')!==`Bearer ${env.META_WORKER_TOKEN}`)return json({error:'unauthorized'},401);
  if(route==='/auth-check')return json({ok:true,service:'ltzzz-meta-hosted',authorized:true,model_calls:0});
  const raw=await request.text();if(raw.length>12000)return json({error:'body_too_large'},413);
  let body;try{body=JSON.parse(raw);}catch{return json({error:'invalid_json'},400);}
  if(route==='/issue')return createIssue(env,body);
  if(route==='/mail')return createMailRequest(env,body);
  if(!env.AI)return json({error:'ai_binding_missing'},503);
  if(typeof body.prompt!=='string'||!body.prompt.trim()||body.prompt.length>6000)return json({error:'prompt_invalid'},400);
  const task=String(body.task_id||'').slice(0,100);if(!task)return json({error:'task_id_required'},400);
  const kind=body.kind||'analysis';if(!['analysis','hire','invest','channel_probe'].includes(kind))return json({error:'kind_invalid'},400);
  if(kind==='channel_probe'&&!/^[a-f0-9]{32}$/.test(body.nonce||''))return json({error:'probe_nonce_invalid'},400);
  try{
   const result=await env.AI.run(env.META_MODEL,kind==='channel_probe'?{messages:[{role:'system',content:'Echo the user text exactly. No commentary, no explanation, no additional words.'},{role:'user',content:body.nonce}],max_tokens:80,temperature:0}:{messages:[{role:'system',content:'You are the LTZZZ hosted Llama execution seat. Return concise proposals only. Never claim a payment, trade, deployment, DID registration or social publication occurred. No private keys.'},{role:'user',content:body.prompt}],max_tokens:512});
   const output=String(result.response||'').trim();if(!output)return json({error:'empty_model_output'},502);
   return json({task_id:task,request_nonce:kind==='channel_probe'?body.nonce:null,executor:'did:ltzzz:meta',provider:'cloudflare-workers-ai',model:env.META_MODEL,at:new Date().toISOString(),kind,status:'proposal_completed',output,evidence:{type:'real_model_inference',financial_execution:false,tx_hash:null,published_id:null}});
  }catch{return json({error:'upstream_inference_failed'},502);}
 }
};