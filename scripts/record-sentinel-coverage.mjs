import fs from 'node:fs';import {sentinelCoverage} from './lib/sentinel-coverage.mjs';
const r=await sentinelCoverage({token:process.env.GITHUB_TOKEN}),run=process.env.GITHUB_RUN_ID||'local',attempt=process.env.GITHUB_RUN_ATTEMPT||'1';
fs.mkdirSync('knowledge/results/dispatch/sentinel-coverage',{recursive:true});
for(const f of [run+'-'+attempt+'.json','latest.json'])fs.writeFileSync('knowledge/results/dispatch/sentinel-coverage/'+f,JSON.stringify(r,null,2)+'\n');
console.log(JSON.stringify({status:r.status,observed_runs:r.observed_runs,sample_size:r.sample_size,sampled_persistence_successes:r.sampled_persistence_successes,sampled_business_alerts:r.sampled_business_alerts,model_calls:0}));
