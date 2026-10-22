import fs from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
export const SKILL_DIR='skills/ltzzz-task-execution';
export const CORE_FILES=['SKILL.md','references/runtime-contract.md','references/task-card.md','references/receipt-template.json','references/contribution-template.md'];
export const skillHash=value=>createHash('sha256').update(value).digest('hex');
export function readSkill(root='.'){
 const manifest=JSON.parse(fs.readFileSync(path.join(root,'config/ltzzz-skill.json'),'utf8'));
 if(manifest.name!=='ltzzz-task-execution'||manifest.directory!==SKILL_DIR||JSON.stringify(manifest.reviewed_core_files)!==JSON.stringify(CORE_FILES))throw Error('skill_manifest_invalid');
 const sources=CORE_FILES.map(name=>{const relative=SKILL_DIR+'/'+name,text=fs.readFileSync(path.join(root,relative),'utf8');if(!text.trim())throw Error('skill_source_empty');return {path:relative,text,sha256:skillHash(text)};});
 if(!/^---\nname: ltzzz-task-execution\ndescription: .+\n---\n/.test(sources[0].text))throw Error('skill_frontmatter_invalid');
 JSON.parse(sources.find(s=>s.path.endsWith('receipt-template.json')).text);
 return {manifest,sources,core_sha256:skillHash(JSON.stringify(sources.map(({path,sha256})=>({path,sha256}))))};
}
export function nativeReviewEvidence(record,core){
 if(record.core_sha256!==core||record.status!=='native_reviews_finished')throw Error('skill_review_subject_mismatch');
 const expected={deepseek:'deepseek',doubao:'doubao',qianwen:'aliyun_dashscope',kimi_cn:'moonshot_cn',grok:'xai'};
 return Object.entries(record.seats||{}).filter(([seat,r])=>{
  if(!expected[seat]||r.actual_provider!==expected[seat]||r.native_provider_call!==true||r.status!=='complete'||!['stop','end_turn'].includes(r.finish_reason)||r.output_sha256!==skillHash(r.output||'')||typeof r.model!=='string'||!r.model)return false;
  try{const parsed=JSON.parse(r.output.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));return ['approve','revise'].includes(parsed.verdict)&&parsed.review_end===true&&Array.isArray(parsed.risks)&&Array.isArray(parsed.additions)&&JSON.stringify(parsed)===JSON.stringify(r.review);}catch{return false;}
 }).map(([,r])=>r);
}
export function skillContext({root='.',scope='task'}={}){
 try{
  const pack=readSkill(root),m=pack.manifest;
  if(m.enabled!==true)return {text:'',proof:{applied:false,status:'draft_not_active',scope,version:m.version,core_sha256:pack.core_sha256}};
  const ref=m.activation_review;
  if(!/^knowledge\/results\/skill-review\/[a-f0-9]{16}\/activation\.json$/.test(ref?.path||''))throw Error('skill_activation_reference_invalid');
  const bytes=fs.readFileSync(path.join(root,ref.path));if(skillHash(bytes)!==ref.sha256)throw Error('skill_activation_changed');const activation=JSON.parse(bytes);
  if(activation.core_sha256!==pack.core_sha256||activation.decision!=='activate_with_recorded_resolutions'||!activation.resolutions?.length)throw Error('skill_activation_unbound');
  if(!/^knowledge\/results\/skill-review\/[a-f0-9]{16}\/review\.json$/.test(activation.review?.path||''))throw Error('skill_review_path_invalid');
  const raw=fs.readFileSync(path.join(root,activation.review.path));if(skillHash(raw)!==activation.review.sha256)throw Error('skill_review_changed');
  const rows=nativeReviewEvidence(JSON.parse(raw),pack.core_sha256);if(new Set(rows.map(r=>r.actual_provider)).size<2)throw Error('skill_independent_reviews_missing');
  const runtime=pack.sources.find(s=>s.path.endsWith('runtime-contract.md'));
  return {text:`【LTZZZ Skill ${m.version}；core=${pack.core_sha256}；scope=${scope}】\n${runtime.text}`,proof:{applied:true,status:'active_context_injected',version:m.version,core_sha256:pack.core_sha256,runtime_sha256:runtime.sha256,activation_path:ref.path,scope}};
 }catch{return {text:'',proof:{applied:false,status:'skill_unavailable_or_integrity_error',scope}};}
}
export function syncSkillAdapters({root='.',check=false}={}){
 const pack=readSkill(root);if(pack.manifest.enabled!==true)return {status:'draft_not_installed',paths:[]};
 if(!skillContext({root}).proof.applied)throw Error('active_skill_review_required');
 const files=[...CORE_FILES,'references/contributions.md'];
 const targets=['.github/skills/ltzzz-task-execution','.claude/skills/ltzzz-task-execution','.agents/skills/ltzzz-task-execution'];
 if(JSON.stringify(pack.manifest.adapters)!==JSON.stringify(targets))throw Error('skill_adapter_targets_invalid');
 for(const target of targets)for(const file of files){const bytes=fs.readFileSync(path.join(root,SKILL_DIR,file)),full=path.join(root,target,file);
  if(check){if(!fs.existsSync(full)||!fs.readFileSync(full).equals(bytes))throw Error('skill_adapter_out_of_sync');}
  else{fs.mkdirSync(path.dirname(full),{recursive:true});fs.writeFileSync(full,bytes);}
 }
 return {status:check?'all_adapters_match':'repository_adapters_generated_not_client_load_proof',paths:targets,core_sha256:pack.core_sha256};
}
