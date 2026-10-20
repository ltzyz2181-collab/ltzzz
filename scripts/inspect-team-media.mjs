import fs from 'node:fs';import {createHash} from 'node:crypto';
const token=process.env.LTZZZ_AGENT_TOKEN,scheduler='https://ltzzz-video-scheduler.ltzyz2181.workers.dev',uploader='https://ltzzz-youtube-upload.ltzyz2181.workers.dev';
const report={at:new Date().toISOString(),run_id:process.env.GITHUB_RUN_ID,source_commit:process.env.GITHUB_SHA,read_only:true,model_calls:0,uploads:0,transactions:0};
const get=async(url,{auth=false}={})=>{const r=await fetch(url,{headers:auth?{Authorization:'Bearer '+token}:{},signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('http_'+r.status);return r.json();};
try{
 if(!token)throw Error('upload_identity_not_configured');
 for(let i=0;i<36;i++){
  report.scheduler=await get(scheduler+'/health');if(report.scheduler.queue_listing)break;
  if(i<35)await new Promise(r=>setTimeout(r,3000));
 }
 if(!report.scheduler.queue_listing)throw Error('queue_listing_not_deployed');
 report.youtube=await get(uploader+'/youtube/status');
 report.queue_items=[];let cursor;
 for(let i=0;i<5;i++){
  const page=await get(scheduler+'/queue/list'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{auth:true});
  report.queue_items.push(...page.items);cursor=page.cursor;if(!page.truncated)break;
 }
 report.queue_read_complete=!cursor;
 report.last_cron=(await get(scheduler+'/status',{auth:true})).latest;
 const cfToken=process.env.CLOUDFLARE_API_TOKEN,account=process.env.CLOUDFLARE_ACCOUNT_ID;
 if(cfToken&&account){
  const r=await fetch('https://api.cloudflare.com/client/v4/accounts/'+encodeURIComponent(account)+'/workers/scripts/ltzzz-video-scheduler/schedules',{headers:{Authorization:'Bearer '+cfToken},signal:AbortSignal.timeout(15000)});
  const body=await r.json();report.cloud_cron={http:r.status,verified:r.ok&&body.success===true,schedules:Array.isArray(body.result)?body.result:(body.result?.schedules||[])};
 }
 const prior=JSON.parse(fs.readFileSync('results/publishing/youtube-manual-2026-10-19-rejection-is-evidence.json'));
 report.doubao_previous_video={video_id:prior.video_id,video_sha256:prior.video_sha256,verification:await get(uploader+'/youtube/verify?video_id='+encodeURIComponent(prior.video_id)),new_uploads:0};
 const next=new Date();next.setUTCHours(14,0,0,0);if(next<=new Date())next.setUTCDate(next.getUTCDate()+1);
 report.next_configured_cron_at=next.toISOString();
 report.ready_video_count=report.queue_items.filter(i=>i.new_upload_eligible===true).length;
 report.next_publication_ready=report.cloud_cron?.verified===true&&report.cloud_cron.schedules.some(x=>x.cron==='0 14 * * *')&&report.youtube.connected===true&&report.youtube.channel_id==='UCnKqseQ7uivSc7FN38ccRUA'&&report.ready_video_count>0;
 report.status='media_readback_complete_no_publication_attempt';
}catch(error){report.status='blocked_media_readback';report.error=/^[a-zA-Z0-9_]+$/.test(error.message)?error.message:'transport_or_protocol_error';}
const wallet='0x21F502f29294c50d9C37A30dc038D8D95eB97fdc',usdc='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const rpc=async(url,method,params)=>{const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(15000)});const j=await r.json();if(!r.ok||j.error||typeof j.result!=='string')throw Error('rpc_read_failed');return j.result;};
const providers=['https://mainnet.base.org','https://base-rpc.publicnode.com'];
report.wallet={address:wallet,network:'Base',chain_id:8453,signing_control_verified:false,observations:[]};
try{
 const heights=await Promise.all(providers.map(p=>rpc(p,'eth_blockNumber',[]))),block='0x'+Math.min(...heights.map(v=>Number(BigInt(v)))).toString(16);
 for(const url of providers){
  const [eth,usd]=await Promise.all([rpc(url,'eth_getBalance',[wallet,block]),rpc(url,'eth_call',[{to:usdc,data:'0x70a08231'+wallet.slice(2).toLowerCase().padStart(64,'0')},block])]);
  report.wallet.observations.push({rpc:url,block_number:Number(BigInt(block)),eth_wei:BigInt(eth).toString(),usdc_raw:BigInt(usd).toString()});
 }
 report.wallet.two_rpc_agreement=report.wallet.observations[0].eth_wei===report.wallet.observations[1].eth_wei&&report.wallet.observations[0].usdc_raw===report.wallet.observations[1].usdc_raw;
}catch{report.wallet.two_rpc_agreement=false;report.wallet.error='independent_base_balance_read_incomplete';}
report.exchange={name:'ltzzzwep3ops1',deposit_address:'0xd4c3258c378d51e22c969e26bd4e27a1c6d4fd91',asset:'USDC',network:'Base',binding:'owner_reported_not_exchange_verified',is_signing_wallet:false};
report.evidence_sha256=createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.mkdirSync('knowledge/results/team-ops',{recursive:true});fs.writeFileSync('knowledge/results/team-ops/media-wallet-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({status:report.status,ready_video_count:report.ready_video_count,next_publication_ready:report.next_publication_ready,wallet_balance_verified:report.wallet.two_rpc_agreement,model_calls:0,uploads:0,transactions:0}));
if(report.status.startsWith('blocked_'))process.exitCode=1;
