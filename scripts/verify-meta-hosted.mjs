import fs from 'node:fs';
const url=process.env.META_WORKER_URL;const results=[];
for(const kind of ['hire','invest']){
 const prompt=kind==='hire'?'用中文给出一个1USDC销售传感器任务的验收标准，150字内；不声称已雇佣或付款。':'用中文给出1USDC Aave Base USDC供应后赎回测试的成功标准，150字内；不声称已交易。';
 const response=await fetch(url+'/task',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.META_WORKER_TOKEN}`},body:JSON.stringify({task_id:`taskMetaDeploy-${kind}-${process.env.GITHUB_RUN_ID}`,kind,prompt}),signal:AbortSignal.timeout(90000)});
 results.push({http:response.status,...await response.json()});
}
const unauth=await fetch(url+'/task',{method:'POST',body:'{}'});
fs.mkdirSync('knowledge/results/meta',{recursive:true});fs.writeFileSync(`knowledge/results/meta/${process.env.GITHUB_RUN_ID}.json`,JSON.stringify({url,anonymous_http:unauth.status,results},null,2));
if(unauth.status!==401||results.some(r=>r.http!==200||!r.output))process.exitCode=1;
