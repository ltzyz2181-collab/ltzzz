// Reflection ledger: observe an error -> distill a rule -> retrieve it before similar work
// -> detect recurrence. Pure functions, no network, no model calls, no money or key access.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

export const ERROR_CLASSES=['overclaim','truncated_output','unverified_completion','identity_mismatch','stale_evidence','scope_creep','fabricated_detail','integrity_unpinned','environment_assumption','other'];
export const STATUSES=['observed','adopted','verified','retired'];
const SEVERITY={low:1,medium:2,high:3};
const TAG=/^[a-z0-9_]{2,40}$/, ID=/^L-\d{8}-\d{3}$/, HEX64=/^[a-f0-9]{64}$/, HEX40=/^[a-f0-9]{40}$/;
// A lesson may only add caution. These phrases are how a rule would loosen a limit.
const LOOSENING=/\b(ignore|bypass|disable|skip the check|turn off|override)\b|忽略|绕过|关闭检查|跳过检查|不再检查|解除限制/i;
const sha256=b=>createHash('sha256').update(b).digest('hex');
const isObj=v=>v&&typeof v==='object'&&!Array.isArray(v);
const text=(v,max)=>typeof v==='string'&&v.trim().length>=3&&v.length<=max;

export function validateLesson(l){
  const e=[];
  if(!isObj(l))return ['not_an_object'];
  if(!ID.test(l.id||''))e.push('id');
  if(!(typeof l.observed_at==='string'&&!Number.isNaN(Date.parse(l.observed_at))))e.push('observed_at');
  for(const k of ['agent_actual','reporter'])if(!isObj(l[k])||!text(l[k].provider,40)||!(l[k].model===null||text(l[k].model,80)))e.push(k);
  if(!isObj(l.source)||!['receipt','pr','run','review','external_platform'].includes(l.source.kind)||!text(l.source.ref,300)||!(l.source.commit===null||HEX40.test(l.source.commit||'')))e.push('source');
  if(!Array.isArray(l.task_tags)||l.task_tags.length<1||l.task_tags.length>8||!l.task_tags.every(t=>TAG.test(t)))e.push('task_tags');
  if(!ERROR_CLASSES.includes(l.error_class))e.push('error_class');
  if(!TAG.test(l.signature||''))e.push('signature');
  for(const k of ['what_happened','expected'])if(!text(l[k],1200))e.push(k);
  if(!Array.isArray(l.evidence)||l.evidence.length<1||l.evidence.length>8||!l.evidence.every(x=>isObj(x)&&text(x.path,300)&&(x.sha256===null||HEX64.test(x.sha256||''))&&(x.commit===null||HEX40.test(x.commit||''))&&typeof x.verified_by_reporter==='boolean'))e.push('evidence');
  if(!isObj(l.root_cause)||!text(l.root_cause.text,800)||!['hypothesis','verified'].includes(l.root_cause.status))e.push('root_cause');
  if(!text(l.rule,300)||LOOSENING.test(l.rule||''))e.push('rule_must_add_caution_only');
  if(!isObj(l.check)||!['preflight_question','deterministic_test','ci_guard','manual_review'].includes(l.check.kind)||!(l.check.ref===null||text(l.check.ref,300)))e.push('check');
  if(!SEVERITY[l.severity])e.push('severity');
  if(typeof l.mandatory!=='boolean')e.push('mandatory');
  if(l.effect!=='adds_caution_only')e.push('effect');
  if(!STATUSES.includes(l.status))e.push('status');
  if(l.review!==null&&!(isObj(l.review)&&text(l.review.provider,40)&&['accept','reject'].includes(l.review.verdict)&&text(l.review.ref,300)))e.push('review');
  if(!Array.isArray(l.recurrences)||!l.recurrences.every(r=>isObj(r)&&!Number.isNaN(Date.parse(r.observed_at))&&text(r.source_ref,300)))e.push('recurrences');
  // Promotion rules: a model's own account of its mistake is not enough to enforce anything.
  if(['adopted','verified'].includes(l.status)){
    if(!l.review||l.review.verdict!=='accept')e.push('adopted_requires_accepting_review');
    else if(isObj(l.agent_actual)&&l.review.provider===l.agent_actual.provider)e.push('review_must_be_different_provider');
    if(l.root_cause?.status!=='verified'&&l.mandatory)e.push('mandatory_requires_verified_root_cause');
    if(Array.isArray(l.evidence)&&!l.evidence.some(x=>x.verified_by_reporter))e.push('adopted_requires_checked_evidence');
  }
  if(l.status==='verified'){
    if(!['deterministic_test','ci_guard'].includes(l.check?.kind)||!l.check?.ref)e.push('verified_requires_machine_check');
  }
  return e;
}

export const fingerprint=l=>`${l.error_class}:${l.signature}`;

export function loadLessons(dir='knowledge/lessons'){
  const out=[],problems=[],seen=new Map();
  if(!fs.existsSync(dir))return {lessons:out,problems};
  for(const name of fs.readdirSync(dir).filter(n=>/^L-\d{8}-\d{3}\.json$/.test(n)).sort()){
    let l;try{l=JSON.parse(fs.readFileSync(path.join(dir,name),'utf8'));}catch{problems.push(`${name}:invalid_json`);continue;}
    const errs=validateLesson(l);
    if(l.id&&name!==`${l.id}.json`)errs.push('filename_must_equal_id');
    if(l.id&&seen.has(l.id))errs.push('duplicate_id');
    if(errs.length){problems.push(`${name}:${errs.join(',')}`);continue;}
    seen.set(l.id,true);out.push(l);
  }
  return {lessons:out,problems};
}

// Active lessons are enforceable. Observed lessons are advisory unless includeObserved is false.
export function retrieve(lessons,{tags=[],limit=8,includeObserved=true}={}){
  const want=new Set(tags);
  return lessons
    .filter(l=>l.status!=='retired'&&(includeObserved||l.status!=='observed'))
    .map(l=>({l,overlap:l.task_tags.filter(t=>want.has(t)).length}))
    .filter(x=>x.overlap>0)
    .sort((a,b)=>(b.l.mandatory-a.l.mandatory)||(SEVERITY[b.l.severity]-SEVERITY[a.l.severity])||(b.overlap-a.overlap)||a.l.id.localeCompare(b.l.id))
    .slice(0,limit)
    .map(({l})=>({id:l.id,status:l.status,mandatory:l.mandatory,severity:l.severity,rule:l.rule,check:l.check,advisory:l.status==='observed'}));
}

// Preflight gate: every mandatory, enforceable lesson matching the task tags must be
// acknowledged by id. Structure only; it does not prove the executor actually complied.
export function checkConsidered(preflight,lessons,tags){
  const errors=[];
  const known=new Map(lessons.map(l=>[l.id,l]));
  const listed=Array.isArray(preflight?.lessons_considered)?preflight.lessons_considered:null;
  if(!listed)return ['lessons_considered_required'];
  const ids=new Set();
  for(const row of listed){
    if(!isObj(row)||!known.has(row.id)){errors.push(`unknown_lesson:${row?.id}`);continue;}
    if(typeof row.applied!=='boolean'||!text(row.note,300))errors.push(`note_and_applied_required:${row.id}`);
    ids.add(row.id);
  }
  for(const r of retrieve(lessons,{tags,limit:50,includeObserved:false}))
    if(r.mandatory&&!ids.has(r.id))errors.push(`mandatory_lesson_not_considered:${r.id}`);
  return errors;
}

// Recurrence: a new failure with the same class:signature as an adopted lesson means the rule
// did not work. Escalate to a machine check instead of writing a longer rule.
export function matchRecurrence(lessons,failure){
  if(!failure||!ERROR_CLASSES.includes(failure.error_class)||!TAG.test(failure.signature||''))return {error:'failure_needs_error_class_and_signature'};
  const fp=`${failure.error_class}:${failure.signature}`;
  const hit=lessons.find(l=>fingerprint(l)===fp&&l.status!=='retired');
  if(!hit)return {known:false,fingerprint:fp,action:'draft_new_lesson'};
  const enforced=['adopted','verified'].includes(hit.status);
  const machine=['deterministic_test','ci_guard'].includes(hit.check.kind)&&!!hit.check.ref;
  return {known:true,fingerprint:fp,lesson:hit.id,enforced,action:enforced?(machine?'machine_check_failed_to_catch_investigate_guard':'rule_failed_escalate_to_machine_check'):'advisory_only_consider_adoption'};
}

export function stats(lessons){
  const byClass={};let afterAdoption=0;
  for(const l of lessons){
    const c=byClass[l.error_class]??={lessons:0,recurrences:0};
    c.lessons++;c.recurrences+=l.recurrences.length;
    if(['adopted','verified'].includes(l.status))afterAdoption+=l.recurrences.length;
  }
  return {total:lessons.length,by_status:Object.fromEntries(STATUSES.map(s=>[s,lessons.filter(l=>l.status===s).length])),by_class:byClass,recurrences_after_adoption:afterAdoption};
}

// Draft skeleton from a failure receipt (e.g. platform rejection, blocked run). The author must
// fill what_happened/root_cause from evidence; the skeleton never claims a verified root cause.
export function draftFromReceipt(receiptPath,{reporterProvider,agentProvider,errorClass='other',signature='needs_signature',tags=['needs_tags'],now=new Date()}={}){
  const bytes=fs.readFileSync(receiptPath);
  const day=now.toISOString().slice(0,10).replaceAll('-','');
  return {
    id:`L-${day}-000`,observed_at:now.toISOString(),
    agent_actual:{provider:agentProvider||'unknown',model:null},reporter:{provider:reporterProvider||'unknown',model:null},
    source:{kind:'receipt',ref:receiptPath,commit:null},task_tags:tags,error_class:errorClass,signature,
    what_happened:'FILL: observable facts from the receipt only.',expected:'FILL: what the acceptance rule required.',
    evidence:[{path:receiptPath,sha256:sha256(bytes),commit:null,verified_by_reporter:true}],
    root_cause:{text:'FILL: hypothesis until a different provider or a test confirms it.',status:'hypothesis'},
    rule:'FILL: one imperative sentence that adds caution.',check:{kind:'preflight_question',ref:null},
    severity:'medium',mandatory:false,effect:'adds_caution_only',status:'observed',review:null,recurrences:[]
  };
}
