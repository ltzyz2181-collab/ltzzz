import fs from 'node:fs';import crypto from 'node:crypto';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev',run=process.env.GITHUB_RUN_ID||Date.now(),report={at:new Date().toISOString(),run_id:String(run),source_commit:process.env.GITHUB_SHA,model_calls:0,transactions:0,external_paid_order_completed:false,checks:{}};
try{
 const portal=await fetch(base+'/market/start');const html=await portal.text();report.checks.chinese_portal=portal.ok&&html.includes('lang="zh-CN"')&&html.includes('新建订单')&&!!portal.headers.get('Content-Security-Policy');
 const schema=await fetch(base+'/market/openapi.json').then(r=>r.json());report.checks.openapi=!!schema.paths?.['/market/skill/{skill}']?.post?.responses?.[202];
 const cap=crypto.randomBytes(32).toString('hex'),headers={'Content-Type':'application/json','Idempotency-Key':'external_accept_'+run,'X-Order-Token':cap},body=JSON.stringify({brief:'Read-only external order acceptance probe. No payment authorization is supplied; no delivery or model execution requested.'});
 const q=await fetch(base+'/market/skill/audit',{method:'POST',headers,body});const quote=await q.json();report.checks.standard_x402=q.status===402&&!!q.headers.get('PAYMENT-REQUIRED')&&quote.x402Version===2;
 const retry=await fetch(base+'/market/skill/audit',{method:'POST',headers,body}).then(r=>r.json());report.checks.quote_idempotent=retry.order_id===quote.order_id;
 const forged=await fetch(base+'/market/skill/audit',{method:'POST',headers:{...headers,'X-Order-Token':crypto.randomBytes(32).toString('hex')},body});report.checks.private_quote_binding=forged.status===401;
 const privateDenied=await fetch(base+'/market/order/'+quote.order_id);report.checks.private_order_denied=privateDenied.status===401;
 const challenge=await fetch(base+'/market/x402/challenge',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({skill:'audit',brief:'Legacy direct transfer must stay disabled for external buyers.'})}).then(r=>r.json());
 const legacy=await fetch(base+'/market/x402/verify',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({challenge_id:challenge.challenge_id,tx_hash:'0x'+'00'.repeat(32)})});report.checks.legacy_real_transfer_closed=legacy.status===410;
 report.quote_order_id=quote.order_id;report.ok=Object.values(report.checks).every(Boolean);
}catch(e){report.ok=false;report.error=e.message;}
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/external-'+run+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(!report.ok)process.exitCode=1;
