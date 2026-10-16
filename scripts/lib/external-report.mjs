import fs from 'node:fs';import path from 'node:path';import crypto from 'node:crypto';
export const REPO='ltzyz2181-collab/ltzzz',PREFIX='[LTZZZ外部回执]';
export const reportHash=text=>crypto.createHash('sha256').update(text).digest('hex');
export function reportDate(date){if(!/^\d{4}-\d{2}-\d{2}$/.test(date||'')||!Number.isFinite(Date.parse(date+'T00:00:00Z'))||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date)throw Error('invalid_report_date');return date;}

export function externalRequest(event,{actor,repository}={}){
 if(repository!==REPO||event.repository?.full_name!==REPO||event.action!=='opened'||!Number.isSafeInteger(event.issue?.number)||event.issue.number<1||event.issue.user?.login!==actor||!String(event.issue.title||'').startsWith(PREFIX))throw Error('external_issue_identity_required');
 const input=String(event.issue.body||'').replace(/\r\n/g,'\n');
 if(Buffer.byteLength(input)>60000||input.includes('\0'))throw Error('external_report_too_large_or_invalid');
 const marker='### 回执正文\n',start=input.indexOf(marker);if(start<0)throw Error('report_body_required');
 const header=input.slice(0,start),field=name=>header.match(new RegExp('(?:^|\\n)### '+name+'\\n+([\\s\\S]*?)(?=\\n### |$)'))?.[1]?.trim();
 if(field('作者')!=='Claude')throw Error('unsupported_claimed_author');
 const date=reportDate(field('报告日期'));
 const source=field('审阅提交');if(source&&source!=='_No response_'&&!/^[a-f0-9]{7,40}$/i.test(source))throw Error('invalid_claimed_source_commit');
 const report=input.slice(start+marker.length).replace(/^\n+/,'').trimEnd()+'\n';
 if(report.trim().length<80||Buffer.byteLength(report)>50000)throw Error('report_body_length');
 return {issue_number:event.issue.number,date,claimed_author:'Claude',github_submitter:actor,issue_url:'https://github.com/'+REPO+'/issues/'+event.issue.number,source_commit_claimed:source&&source!=='_No response_'?source:null,report,body_sha256:reportHash(report),issue_body_sha256:reportHash(input),owner_submitted:actor==='ltzyz2181-collab'};
}
const save=(root,file,body)=>{fs.mkdirSync(path.dirname(path.join(root,file)),{recursive:true});fs.writeFileSync(path.join(root,file),body);};
const json=(root,file,value)=>save(root,file,JSON.stringify(value,null,2)+'\n');

export function archiveExternalReport(request,{root='.',at=new Date().toISOString(),runId=null}={}){
 const folder='knowledge/results/external/submissions/issue-'+request.issue_number;
 const metadataPath=folder+'/receipt.json',rawPath=folder+'/report.md';
 const target='knowledge/results/external/'+reportDate(request.date)+'-claude.md';
 let prior;try{prior=JSON.parse(fs.readFileSync(path.join(root,metadataPath),'utf8'));}catch(e){if(e.code!=='ENOENT')throw e;}
 if(prior){if(prior.body_sha256!==request.body_sha256||prior.issue_body_sha256!==request.issue_body_sha256)throw Error('submission_changed_requires_new_issue');return prior;}
 if(reportHash(request.report)!==request.body_sha256)throw Error('report_hash_mismatch');
 const record={schema:'ltzzz.external-report-submission.v1',date:request.date,claimed_author:'Claude',github_submitter:request.github_submitter,source_commit_claimed:request.source_commit_claimed,issue_number:request.issue_number,issue_url:request.issue_url,stored_at:at,run_id:runId,body_sha256:request.body_sha256,issue_body_sha256:request.issue_body_sha256,raw_report:rawPath,receipt:metadataPath,canonical_path:null,canonical_status:'not_requested_unverified_submitter',status:'stored_external_pending_review',authorship_verification:'self_reported_not_native_API_attestation',model_calls:0,native_anthropic_calls:0,paid:false,tx_hash:null,instructions_in_report_executed:false};
 save(root,rawPath,request.report);
 // Anyone able to open a public issue may deliver an unverified report. Only
 // the authenticated owner account can establish a dated canonical receipt.
 if(request.owner_submitted){
  const exists=fs.existsSync(path.join(root,target));
  if(exists&&reportHash(fs.readFileSync(path.join(root,target),'utf8'))!==request.body_sha256){record.canonical_status='conflict_preserved';record.status='stored_conflict_requires_review';}
  else{
   record.canonical_path=target;record.canonical_status=exists?'already_present_identical':'stored';
   if(!exists)save(root,target,request.report);
   const meta=target.replace(/\.md$/,'.json');
   if(!fs.existsSync(path.join(root,meta)))json(root,meta,{schema:'ltzzz.external-report.v1',date:request.date,timezone:'Asia/Shanghai',claimed_author:'Claude',ingestion:'github_issue',github_submitter:request.github_submitter,stored_at:at,receipt:target,body_sha256:request.body_sha256,source_commit_claimed:request.source_commit_claimed,submission_receipt:metadataPath,status:'external_submitted_pending_review',authorship_verification:'self_reported_not_native_API_attestation',upstream_write_permission_verified:false,upstream_automatic_schedule_verified:false,model_calls:0,native_anthropic_calls:0,paid:false,tx_hash:null});
  }
 }
 json(root,metadataPath,record);return record;
}

export function readCanonicalReport(root,date){
 const file='knowledge/results/external/'+reportDate(date)+'-claude.md',meta=file.replace(/\.md$/,'.json');
 if(!fs.existsSync(path.join(root,file))||!fs.existsSync(path.join(root,meta)))return null;
 const record=JSON.parse(fs.readFileSync(path.join(root,meta),'utf8'));
 if(record.schema!=='ltzzz.external-report.v1'||record.date!==date||record.claimed_author!=='Claude'||record.receipt!==file||record.body_sha256!==reportHash(fs.readFileSync(path.join(root,file),'utf8')))throw Error('canonical_report_integrity_failed');
 return {...record,provenance:meta};
}
export function applyExternalReport(result,report){
 if(!report||result.date!==report.date)return false;
 const seat=result.tasks?.find(t=>t.agent==='claude'&&t.status==='external_discussion_only');
 if(!seat||seat.external_delivery?.body_sha256===report.body_sha256)return false;
 seat.delivery_status='external_submitted_pending_review';
 seat.external_delivery={receipt:report.receipt,provenance:report.provenance,body_sha256:report.body_sha256,received_at:report.stored_at,ingestion:report.ingestion,claimed_author:'Claude',authorship_verification:report.authorship_verification,scope:'external_free_discussion_and_audit',native_api_execution:false};
 seat.output_preview='已收到Claude外部讨论/审计回执，待审核；非自动原厂API日课。'+report.receipt;return true;
}
export function applyAvailableExternalReport(result,root='.'){
 try{return applyExternalReport(result,readCanonicalReport(root,result.date));}
 catch{result.external_report_validation={status:'blocked_integrity',reason:'External receipt metadata or digest failed validation; native daily outputs are preserved.'};return false;}
}
export function registerExternalReport({root='.',date}){
 const report=readCanonicalReport(root,date),file='data/results/'+reportDate(date)+'.json';
 if(!report||!fs.existsSync(path.join(root,file)))return {changed:false};
 const result=JSON.parse(fs.readFileSync(path.join(root,file),'utf8'));
 if(!applyExternalReport(result,report))return {changed:false};
 json(root,file,result);
 const summary='data/reports/latest.md';
 if(fs.existsSync(path.join(root,summary))){let text=fs.readFileSync(path.join(root,summary),'utf8');if(text.includes('· '+date)){const t=result.tasks.find(t=>t.agent==='claude');text=text.replace(/^\| claude \|.*$/m,'| claude | '+t.execution_status+' | '+t.delivery_status+' | '+t.economic_status+' | 已收到外部审计，待审核；非自动API日课。 |');save(root,summary,text);}}
 return {changed:true,date,receipt:report.receipt,status:'external_submitted_pending_review'};
}
