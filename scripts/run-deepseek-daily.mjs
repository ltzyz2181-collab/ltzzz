// Optional recovery channel: one request per CST day, no automatic paid schedule.
import {callAgent} from './call-deepseek.mjs';
import {runDeepseekDaily} from './lib/deepseek-daily.mjs';
const receipt=await runDeepseekDaily({call:callAgent});
console.log(JSON.stringify({ok:receipt.ok,status:receipt.status,receipt_saved:true,reused:!!receipt.reused,
  executed_by:receipt.executed_by,model:receipt.model,request_id:receipt.request_id||null,tokens_used:receipt.tokens_used??null}));
if(!receipt.ok)process.exitCode=1;
