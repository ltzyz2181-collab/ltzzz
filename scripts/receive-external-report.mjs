import fs from 'node:fs';import {externalRequest,archiveExternalReport,registerExternalReport} from './lib/external-report.mjs';
if(process.argv[2]==='register')console.log(JSON.stringify(registerExternalReport({date:process.argv[3]})));
else{
 const event=JSON.parse(fs.readFileSync(process.env.GITHUB_EVENT_PATH,'utf8'));
 const request=externalRequest(event,{actor:process.env.GITHUB_ACTOR,repository:process.env.GITHUB_REPOSITORY});
 const record=archiveExternalReport(request,{runId:process.env.GITHUB_RUN_ID||null});
 const daily=record.canonical_path?registerExternalReport({date:record.date}):{changed:false};
 console.log(JSON.stringify({status:record.status,canonical_status:record.canonical_status,submission_receipt:record.receipt,canonical_path:record.canonical_path,daily,model_calls:0,native_anthropic_calls:0}));
}
