// One-time treasury provision. Private key goes only to Worker Secret via stdin.
import {Wallet,verifyMessage} from 'ethers';import {spawnSync} from 'node:child_process';import fs from 'node:fs';
const base='https://ltzzz-wep3.ltzyz2181.workers.dev';
const report={at:new Date().toISOString(),address:null,network:'eip155:8453',controlled:false,new_wallet_created:false,tx_hash:null};
let stage='treasury_probe';
try{
 let t;for(let attempt=0;attempt<5;attempt++){try{const r=await fetch(base+'/market/treasury',{signal:AbortSignal.timeout(20000)});t=await r.json();report.probe_http=r.status;if(r.ok&&t.ok)break;}catch{}await new Promise(resolve=>setTimeout(resolve,3000));}
 if(!t?.ok)throw Error('treasury_probe_failed');
 if(t.address){
  if(t.controlled&&verifyMessage(t.message,t.signature).toLowerCase()===t.address.toLowerCase()){report.address=t.address;report.controlled=true;report.status='existing_controlled_treasury_reused';}
  else{report.status='existing_address_requires_review_not_overwritten';report.address=t.address;}
 }else{
  stage='credential_check';report.token_present=Boolean(process.env.CLOUDFLARE_API_TOKEN);report.account_id_present=Boolean(process.env.CLOUDFLARE_ACCOUNT_ID);
  if(!process.env.CLOUDFLARE_API_TOKEN)throw Error('deployment_credentials_missing');
  stage='wallet_generation';const w=Wallet.createRandom();
  stage='secret_write';
  const cmd=spawnSync('npx',['wrangler','secret','bulk','-c','wrangler.wep3.toml'],{input:JSON.stringify({TREASURY_EXECUTOR_KEY:w.privateKey,X402_RECEIVE_ADDRESS:w.address,X402_LIVE:'1'}),encoding:'utf8',stdio:['pipe','pipe','pipe']});
  report.secret_command_exit_status=cmd.status;
  if(cmd.status!==0){report.secret_command_error_category=/unknown argument/i.test(cmd.stderr||'')?'cli_argument':/authenticate|permission|unauthorized/i.test(cmd.stderr||'')?'permission':/json|stdin/i.test(cmd.stderr||'')?'input_format':'other';throw Error('treasury_secret_write_failed');}
  stage='ownership_verification';
  report.address=w.address;report.new_wallet_created=true;
  for(let i=0;i<5;i++){const check=await fetch(base+'/market/treasury',{signal:AbortSignal.timeout(20000)}).then(r=>r.json());if(check.controlled&&check.address.toLowerCase()===w.address.toLowerCase()&&verifyMessage(check.message,check.signature).toLowerCase()===w.address.toLowerCase()){report.controlled=true;report.status='provisioned_and_signature_verified';report.proof=check;break;}await new Promise(resolve=>setTimeout(resolve,3000));}
  if(!report.controlled)report.status='secret_written_verification_pending_do_not_recreate';
 }
}catch{report.status='blocked_provisioning';report.error_stage=stage;process.exitCode=1;}
fs.mkdirSync('knowledge/results/wep3',{recursive:true});fs.writeFileSync('knowledge/results/wep3/treasury-'+process.env.GITHUB_RUN_ID+'.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
