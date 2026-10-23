import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {CORE_FILES,SKILL_DIR,readSkill,skillContext,skillHash} from './ltzzz-skill.mjs';

export const RELEASE_COMMIT='1e18c7064e339c8f2cc5ca12502a58bf38c229b5';
export const DISTRIBUTION_TASK='LTZZZ-SKILL-DISTRIBUTION-20261023';
export const DISTRIBUTION_FILES=[...CORE_FILES,'references/contributions.md'];
export const RESULT_DIR='knowledge/results/skill-distribution/'+RELEASE_COMMIT;
export const MANIFEST_PATH='config/ltzzz-skill-release.json';
export const META_RECEIPT=RESULT_DIR+'/meta-inline.json';
export const META_ENDPOINT='https://ltzzz-meta-hosted.ltzyz2181.workers.dev';
const rawURL=file=>`https://raw.githubusercontent.com/ltzyz2181-collab/ltzzz/${RELEASE_COMMIT}/${SKILL_DIR}/${file}`;
const blobHash=bytes=>createHash('sha1').update(Buffer.from(`blob ${bytes.length}\0`)).update(bytes).digest('hex');

export function pinnedRelease(root='.'){
 const pack=readSkill(root);
 if(!skillContext({root}).proof.applied)throw Error('active_reviewed_skill_required');
 const files=DISTRIBUTION_FILES.map(name=>{
  const file=SKILL_DIR+'/'+name;
  const bytes=execFileSync('git',['show',RELEASE_COMMIT+':'+file],{cwd:root,maxBuffer:100000});
  // Local CRLF checkout is compatible, but release hashes describe actual LF git bytes.
  const local=fs.readFileSync(path.join(root,file),'utf8').replace(/\r\n/g,'\n');
  if(local!==bytes.toString('utf8')||bytes.includes(13))throw Error('pinned_skill_release_drift');
  return {path:file,url:rawURL(name),bytes:bytes.length,sha256:skillHash(bytes),git_blob_sha1:blobHash(bytes),text:bytes.toString('utf8')};
 });
 return {manifest:{name:pack.manifest.name,version:pack.manifest.version,source_commit:RELEASE_COMMIT,core_sha256:pack.core_sha256,hash_scope:'exact_LF_git_blob_bytes_not_model_echo',files:files.map(({text,...f})=>f)},files};
}

export function metaInlinePrompt(release,task='Classify the three cases below.'){
 const skill=release.files.find(f=>f.path===SKILL_DIR+'/SKILL.md');
 if(!skill||skillHash(skill.text)!==skill.sha256)throw Error('inline_skill_hash_mismatch');
 return `LTZZZ execution Skill v1.0.0, source commit ${RELEASE_COMMIT}. Full text follows; no browsing is needed. Use the exact task ID. Model identity, timestamps and file hashes are recorded by the executor, never by your self-description.\n<LTZZZ_SKILL>\n${skill.text}</LTZZZ_SKILL>\n\nTASK (reply in concise English): ${task}`;
}
export const META_SMOKE_QUESTION='Return ONLY JSON with keys case1_stage, case2_actual_provider, case3_paid, case3_tx_hash, end. Case 1: a script draft exists but there are no test, deployment or publication records. What stage is supported? Case 2: the logical seat is Claude and the actual upstream author was DeepSeek; who gets actual_provider? Case 3: this distribution moved no USDC and has no transaction. What are paid and tx_hash? Set end to SKILL_DONE. Do not report your model name, claim tool use, or echo a commit as proof.';

export function distributionArtifacts(release,registry){
 const names=[...Object.entries(registry.seats).filter(([,s])=>!['temporarily_removed','disabled','removed','inactive'].includes(s.work_status)).map(([seat])=>seat),...Object.keys(registry.external_collaborators)];
 const entries=[[MANIFEST_PATH,JSON.stringify(release.manifest,null,2)+'\n']];
 for(const seat of names){
  const id=DISTRIBUTION_TASK+'-'+seat;
  let text=`# ${id}\n\n类型：规则分发卡；不是新的业务订单，不改变原任务 ID。\n\n- 目标：执行原派单时使用 LTZZZ Skill v1.0.0。\n- 固定来源提交：${RELEASE_COMMIT}\n- 主入口：${rawURL('SKILL.md')}\n- 其余五文件及字节哈希：config/ltzzz-skill-release.json；references 保留子目录。\n- 输出：原任务回执；可提分支 PR 补充建议，不另购模型、不新增付费定时。\n- 验收：执行器记录实际读取/注入的文件字节、artifact.sha256、source_commit 与工具记录；模型复述提交号不算读取证据。\n- 回执：reasoningHash 不是 Skill schema 字段，不填写伪哈希。此次分发无 USDC 结算，paid=false、tx_hash=null、settlement_kind=none；未来业务照实际付款凭证填写，不能把默认值固化。\n- 状态：repository_card_published_not_client_acceptance；目录安装、客户端加载、模型输入注入、业务验收分别记录。\n- 禁止：不读凭证、不替其他席接单、不把本卡当新采购或付款指令。\n`;
  if(seat==='claude')text+='\nClaude 按本人偏好读取固定仓库版本，不要求安装到其客户端。免费 PR 审计岗位继续有效；未自动唤醒。\n';
  if(seat==='meta')text+='\n托管 Meta 无网页工具；以下正文由执行器直接注入。外部 Meta 客户端仍单独验收。\n\n'+metaInlinePrompt(release,'Use this Skill for the original task. If a referenced file is absent, name the missing input and do only independent steps. No tool/deployment/payment claims without evidence.')+'\n';
  entries.push([`ops/dispatch/inbox/${seat}/${id}.md`,text]);
 }
 return new Map(entries);
}

export function prepareMetaConsumption({release,runId,attempt='1',issue,sourceCommit,prior=null,now=new Date().toISOString()}){
 if(prior)return {execute:false,record:prior};
 if(!/^\d+$/.test(runId)||attempt!=='1'||!Number.isSafeInteger(issue)||issue<1||!/^[a-f0-9]{40}$/.test(sourceCommit))throw Error('invalid_meta_consumption_reservation');
 const prompt=metaInlinePrompt(release,META_SMOKE_QUESTION),body=JSON.stringify({task_id:DISTRIBUTION_TASK+'-meta',kind:'analysis',prompt});
 if(prompt.length>6000||body.length>12000)throw Error('meta_inline_request_exceeds_worker_limits');
 return {execute:true,record:{task_id:DISTRIBUTION_TASK+'-meta',status:'reserved_before_generation',source_commit:sourceCommit,skill_source_commit:RELEASE_COMMIT,skill_core_sha256:release.manifest.core_sha256,skill_md_sha256:release.files.find(f=>f.path===SKILL_DIR+'/SKILL.md').sha256,prompt,prompt_sha256:skillHash(prompt),request_body_sha256:skillHash(body),run_id:runId,run_attempt:attempt,issue,at_utc:now,metadata_source:'executor_fixed_release_bytes_and_worker_response',model_calls:0,native_openai_calls:0,native_anthropic_calls:0,settlement_kind:'none',paid:false,tx_hash:null,actual_client_load_verified:false,limitations:['Hosted Llama input-consumption test, not external Meta client installation or business acceptance.','Worker does not expose finish_reason or token usage; neither is invented.','Provider API inference may have a cost; paid=false refers only to USDC settlement.']}};
}

export async function consumeMetaInline(record,{call,save=()=>{}}){
 if(record.status!=='reserved_before_generation'||record.model_calls!==0||record.prompt_sha256!==skillHash(record.prompt))throw Error('fresh_meta_consumption_reservation_required');
 record.status='started_completion_unknown';record.model_calls=1;record.started_at_utc=new Date().toISOString();save(record);
 let result;try{result=await call({task_id:record.task_id,kind:'analysis',prompt:record.prompt});}catch{result={ok:false,status:'transport_outcome_unknown_no_retry'};}
 const verified=result.ok===true&&result.task_id===record.task_id&&result.provider==='cloudflare-workers-ai'&&typeof result.model==='string'&&Boolean(result.model.trim())&&typeof result.output==='string'&&Boolean(result.output.trim());
 record.actual_provider=verified?result.provider:null;record.model=verified?result.model:null;record.model_source=verified?'worker_AI_binding':null;
 record.http=result.http??null;record.provider_status=result.status||null;record.finish_reason=null;record.tokens_used=null;
 record.output=typeof result.output==='string'?result.output:'';record.output_sha256=skillHash(record.output);record.generation_verified=verified;
 record.scenarios_verified=false;
 if(verified)try{
  const parsed=JSON.parse(record.output.trim().replace(/^```(?:json)?\s*/,'').replace(/\s*```$/,''));
  record.scenario_result=parsed;
  record.scenarios_verified=parsed.case1_stage==='draft'&&String(parsed.case2_actual_provider).toLowerCase()==='deepseek'&&parsed.case3_paid===false&&parsed.case3_tx_hash===null&&parsed.end==='SKILL_DONE';
 }catch{}
 record.status=record.scenarios_verified?'inline_skill_consumed_scenarios_passed_not_business_acceptance':'inline_skill_consumption_unverified_no_retry';
 record.finished_at_utc=new Date().toISOString();save(record);return record;
}
