import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {inspectOwnerWallet} from './lib/owner-web3-preview.mjs';
const profile=JSON.parse(fs.readFileSync('config/owner-web3-readonly.json','utf8'));
const report=await inspectOwnerWallet(profile);report.run_id=process.env.GITHUB_RUN_ID||null;report.source_commit=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
fs.mkdirSync('knowledge/results/wallet-preview',{recursive:true});const file='knowledge/results/wallet-preview/okx-base-'+(process.env.GITHUB_RUN_ID||'local')+'-attempt-'+(process.env.GITHUB_RUN_ATTEMPT||'1')+'.json';fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({file,status:report.status,balance_usdc:report.preview?.balance_usdc,blockers:report.preview?.blockers,transactions_submitted:0}));if(report.status.startsWith('blocked_'))process.exitCode=1;
