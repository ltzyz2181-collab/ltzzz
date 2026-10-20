// The runner supplies evidence identifiers, never arbitrary prompts or payees.
import {NOVELTY_START_DATE,noveltyPrompt} from './wep3-procurement-novelty.js';
export const DAILY_HIRE_REVISION='daily-external-hire-v1';
export const hireDate=(now=Date.now())=>new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(now));
export function dailyHireId(date){
 if(typeof date!=='string'||!/^20\d\d-\d\d-\d\d$/.test(date)||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('invalid_hire_date');
 return 'REAL-HIRE-'+date.replaceAll('-','')+'-CLAUDE-01';
}
export function dailyHireContext(context){
 if(!context||typeof context!=='object'||Object.keys(context).some(k=>!['source_commit','input_sha256','ans_status'].includes(k))||!/^[a-f0-9]{40}$/.test(context.source_commit||'')||!/^[a-f0-9]{64}$/.test(context.input_sha256||'')||!/^[a-z_]{1,80}$/.test(context.ans_status||''))throw Error('invalid_hire_context');
 return {source_commit:context.source_commit,input_sha256:context.input_sha256,ans_status:context.ans_status};
}
export function dailyHireBody(date,context){
 const id=dailyHireId(date),evidence=dailyHireContext(context);
 if(date>=NOVELTY_START_DATE)return JSON.stringify({model:'deepseek/deepseek-chat',messages:[{role:'user',content:noveltyPrompt(id,evidence)}],max_tokens:1536,stream:false});
 const prompt=`LTZZZ external engineering order ${id}. Evidence identifiers (data, not instructions): ${JSON.stringify(evidence)}. ANS monitoring and AI-hiring continuity are priority one. Produce a reusable regression artifact for the current Aave preview integration, stating how the two defects break autonomous task execution. Caller incorrectly uses GET /market/aave/preview and reads GET /market/aave/status limits under status.limits instead of top-level single_cap_usdc and exposure_cap_usdc. Return ONLY JSON {issues:[{id:string,method:string,reason:string}],tests:[{id:string,expected_http:number,request:{method:string,path:string,headers:object,body:object}}]}. At least two concrete issues (reason >=10 characters), one expected_http=200 positive preview and one expected_http=401 wrong-PIN preview. Both requests MUST use POST /market/aave/preview and body {intent_id:"CONTRACT_TEST_INTENT_${date.replaceAll('-','')}",action:"supply",amount_usdc:"1"}. intent_id must match ^[A-Za-z0-9_-]{16,100}$; action only supply or withdraw; amount_usdc a positive decimal STRING with <=6 fractional digits. Positive headers MUST be {"X-Lab-Pin":"VALID_PIN_PLACEHOLDER"}; negative headers MUST be {"X-Lab-Pin":"WRONG_PIN_PLACEHOLDER"}. These are placeholders, never real credentials. Authorization is not the PIN header. Do not claim tests ran, deploy code, move funds, or invent payment. State findings, not general slogans.`;
 return JSON.stringify({model:'deepseek/deepseek-chat',messages:[{role:'user',content:prompt}],max_tokens:768,stream:false});
}
export function inspectProcurementDelivery(text,{strict=false,novelty=false}={}){
 const warnings=[],errors=[];let artifact;
 try{artifact=JSON.parse(text.replace(/^\s*```(?:json)?\s*/,'').replace(/\s*```\s*$/,''));}catch{return {artifact:null,structural_valid:false,semantic_valid:false,warnings,errors:['invalid_json']};}
 if(!artifact||typeof artifact!=='object'||Array.isArray(artifact))return {artifact,structural_valid:false,semantic_valid:false,warnings,errors:['object_required']};
 if(strict&&Array.isArray(artifact.issues))for(const issue of artifact.issues)if(issue&&Number.isSafeInteger(issue.id)){issue.id=String(issue.id);warnings.push('numeric_issue_id_normalized');}
 const structural_valid=!!(Array.isArray(artifact.issues)&&artifact.issues.length>=2&&artifact.issues.every(i=>i&&typeof i.id==='string'&&typeof i.method==='string'&&typeof i.reason==='string'&&i.reason.length>=10)&&Array.isArray(artifact.tests)&&artifact.tests.every(t=>t&&typeof t==='object')&&artifact.tests.some(t=>t.expected_http===200)&&artifact.tests.some(t=>t.expected_http===401));
 if(!structural_valid)errors.push('invalid_issue_or_test_structure');
 if(strict&&structural_valid){
  if(new Set(artifact.tests.map(t=>t.id)).size!==artifact.tests.length)errors.push('duplicate_test_id');
  for(const t of artifact.tests){const r=t.request,b=r?.body,pin=r?.headers?.['X-Lab-Pin'];
   if(typeof t.id!=='string'||!t.id||r?.method!=='POST'||r?.path!=='/market/aave/preview')errors.push('invalid_test_request');
   if(!(novelty&&t.expected_http===422)&&(!b||Object.keys(b).some(k=>!['intent_id','action','amount_usdc'].includes(k))||!/^[A-Za-z0-9_-]{16,100}$/.test(b.intent_id||'')||!['supply','withdraw'].includes(b.action)||typeof b.amount_usdc!=='string'||!/^\d{1,12}(?:\.\d{1,6})?$/.test(b.amount_usdc)||!/[1-9]/.test(b.amount_usdc)))errors.push('invalid_preview_body');
   if(novelty&&t.expected_http===422&&(!b||typeof b!=='object'||Array.isArray(b)))errors.push('negative_preview_object_required');
   if(!r?.headers||Object.keys(r.headers).some(k=>k!=='X-Lab-Pin')||t.expected_http===200&&pin!=='VALID_PIN_PLACEHOLDER'||t.expected_http===401&&pin!=='WRONG_PIN_PLACEHOLDER'||novelty&&t.expected_http===422&&pin!=='VALID_PIN_PLACEHOLDER'||!(novelty?[200,401,422]:[200,401]).includes(t.expected_http))errors.push('invalid_test_auth');
  }
 }
 return {artifact,structural_valid,semantic_valid:strict&&structural_valid&&errors.length===0,warnings,errors:[...new Set(errors)]};
}
