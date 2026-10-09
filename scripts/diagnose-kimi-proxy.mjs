import fs from 'node:fs';
const base='https://api-kimi.ltzzz.com';
const record={at:new Date().toISOString(),run:process.env.GITHUB_RUN_ID,worker:base};
try{
 const health=await fetch(base+'/health',{signal:AbortSignal.timeout(30000)});const h=await health.json();
 record.health_http=health.status;record.has_key=Boolean(h.has_key);
 const response=await fetch(base+'/',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Reply only: OK'}],model:'kimi-k2.6',max_tokens:256}),signal:AbortSignal.timeout(90000)});
 const body=await response.json().catch(()=>({}));const message=String(body.error?.message||'');
 record.call_http=response.status;record.nonempty_output=Boolean(body.choices?.[0]?.message?.content?.trim());
 record.status=response.ok&&record.nonempty_output?'verified':response.ok?'empty_output':/insufficient balance|suspend/i.test(message)?'upstream_account_balance_error':'upstream_error';
 record.account_hint=message.match(/org-[A-Za-z0-9]+/)?.[0]||null;
 record.note='Owner screenshot domestic balance14.19344CNY; this proxy result does not prove same account/organization or entrypoint.';
}catch{record.status='connection_failed';}
fs.mkdirSync('knowledge/results',{recursive:true});fs.writeFileSync('knowledge/results/kimi-proxy-diagnostic-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(record,null,2));console.log(record.status);