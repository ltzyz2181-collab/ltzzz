import fs from 'node:fs';import {execFileSync} from 'node:child_process';import {readSafeGovernance} from './lib/safe-governance-read.mjs';
const run=process.env.GITHUB_RUN_ID||'local',report={at:new Date().toISOString(),run_id:run,source_commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),...await readSafeGovernance()};
fs.mkdirSync('knowledge/results/identity',{recursive:true});
fs.writeFileSync(`knowledge/results/identity/safe-governance-${run}.json`,JSON.stringify(report,null,2)+'\n');
fs.writeFileSync('knowledge/results/identity/safe-governance-latest.json',JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));if(!report.current)process.exitCode=1;
