import fs from 'node:fs';
const url=process.env.META_WORKER_URL;const results=[];
for(const kind of ['hire','invest']){
 const prompt=kind==='hire'?'销售传感器指数字化外部订单线索监控，不是硬件、物理传感器或摄像头。用中文给出1USDC日更任务的交付验收：至少一条可点击来源URL、发现时间、购买意向原文、来源去重、隐私限制。无真实线索应明确报告0条，不得编造；150字内，不声称已雇佣或付款。':'背景：LTZZZ钱包18.995USDC，Vault原有约20USDC aUSDC。仅新增供应1USDC再赎回1USDC并转回钱包。给出中文验收标准：新交易receipt status=1，USDC本金转回前后相等，Vault总敞口恢复原来20USDC而不是归零，保留原仓位，gas单独记成本。150字内，只写提案，不声称已经交易。';
 const response=await fetch(url+'/task',{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${process.env.META_WORKER_TOKEN}`},body:JSON.stringify({task_id:`taskMetaDeploy-${kind}-${process.env.GITHUB_RUN_ID}`,kind,prompt}),signal:AbortSignal.timeout(90000)});
 results.push({http:response.status,...await response.json()});
}
const unauth=await fetch(url+'/task',{method:'POST',body:'{}'});
fs.mkdirSync('knowledge/results/meta',{recursive:true});fs.writeFileSync(`knowledge/results/meta/${process.env.GITHUB_RUN_ID}.json`,JSON.stringify({url,anonymous_http:unauth.status,results},null,2));
if(unauth.status!==401||results.some(r=>r.http!==200||!r.output))process.exitCode=1;
