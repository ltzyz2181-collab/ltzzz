import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {pendingAnsReviewSync} from './lib/ans-review-recovery.mjs';
const dates=pendingAnsReviewSync();
if(process.argv.includes('--list'))console.log(JSON.stringify({dates,model_calls:0,financial_execution:false}));
else for(const date of dates){
 execFileSync(process.execPath,[fileURLToPath(new URL('./run-ans-cycle.mjs',import.meta.url)),'sync'],{stdio:'inherit',env:{...process.env,ANS_DATE:date}});
 execFileSync(process.execPath,[fileURLToPath(new URL('./run-ans-cycle.mjs',import.meta.url)),'verify'],{stdio:'inherit',env:{...process.env,ANS_DATE:date}});
}
