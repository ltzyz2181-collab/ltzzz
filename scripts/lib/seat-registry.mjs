import fs from 'node:fs';import path from 'node:path';
export function loadSeats(root=process.cwd()){return JSON.parse(fs.readFileSync(path.join(root,'identity/seat-registry.json'),'utf8'));}
export function loadEndpointStatus(root=process.cwd()){try{return JSON.parse(fs.readFileSync(path.join(root,'identity/endpoint-status.json'),'utf8'));}catch{return {status:'not_observed',seats:{}};}}
import {agentCard} from '../../identity/agent-card.js';
export {agentCard};
export function buildSeatArtifacts(root=process.cwd()){
 const registry=loadSeats(root),status=loadEndpointStatus(root);
 for(const [id,s] of Object.entries(registry.seats)){
  const file=path.join(root,'identity/dids/'+id+'.json'),did=JSON.parse(fs.readFileSync(file,'utf8'));
  // These were invalid placeholder public keys, not model API secrets. Do not invent real signing keys.
  did.verificationMethod=(did.verificationMethod||[]).filter(v=>!JSON.stringify(v).includes('PLACEHOLDER'));
  const valid=new Set(did.verificationMethod.map(v=>v.id));for(const k of ['authentication','assertionMethod'])did[k]=(did[k]||[]).filter(v=>valid.has(v));
  if(did.proof?.type==='PLACEHOLDER')delete did.proof;
  did['ltzzz:identityStatus']={signing_public_key_provisioned:did.verificationMethod.length>0,signature_verified:false,chain_registration_verified:false,note:'DID签名公钥与模型API Key是不同对象；未生成私钥、未授予链上签名权。'};
  did.service=[{id:did.id+'#agent-card',type:'agent-card',serviceEndpoint:s.card_url,note:'只读JSON名片，不是模型生成或已签名DID证明。'},...s.health_urls.map((url,i)=>({id:did.id+'#health-'+i,type:'HealthProbe',serviceEndpoint:url,note:'当前探测见identity/endpoint-status.json；health不证明模型额度或真实生成。'}))];
  const p=did['ltzzz:profile']||did['x-ltzzz']||{};Object.assign(p,{role:s.role,workStatus:s.work_status,votingSeat:s.voting_nomination,walletRegistrySource:registry.wallet_source,walletSigning:false,authoritySource:'config/autonomy-authority.json',walletTier:'资金登记与控制以wallet/addresses.md和现有执行器为准；岗位任命不是签名权',endpointStatusRef:s.endpoint_status_ref,roleSource:'identity/seat-registry.json',nativeInferenceMode:s.inference_mode});
  if(s.generation_evidence)p.generationEvidence=s.generation_evidence;
  if(id==='gpt'){p.status='active_coordinator';p.nativeScheduledGeneration=false;}
  if(id==='claude'){p.nativeAnthropicModelOnDefaultRoute=false;p.defaultWorkDelegated=false;p.workModes=['external_native_Claude_repository_work','optional_owner_on_demand_native_API'];p.workEntry='ops/dispatch/CLAUDE-FREE-DAILY.md';p.nativeApiStatus=s.native_api_status;p.workEvidence=s.work_evidence;}
  if(id==='qianwen'){p.roleDetail=s.role;p.permissionLevel='同总控自主工程/运维执行，以config/autonomy-authority.json为准；不是链上签名权。';}
  if(id==='kimi'){p.roleDetail=s.role;p.note='当前总控为GPT，千问代行；历史挑战者描述不替代当前任命。';}
  did['ltzzz:profile']=p;if(did['x-ltzzz'])Object.assign(did['x-ltzzz'],{role:s.role,roleDetail:s.role,updated:registry.effective_date,note:p.note||s.role,permissionLevel:p.permissionLevel||'按当前派单与实际账户权限执行',keyStatus:'DID签名键未配置；不代表模型API Key缺失',proxyEndpoint:s.health_urls[0]||null});
  fs.writeFileSync(file,JSON.stringify(did,null,2)+'\n');
  for(const alias of [id,...(s.aliases||[])]){const dir=path.join(root,'api/agents/'+alias);fs.mkdirSync(dir,{recursive:true});const body=JSON.stringify(agentCard(alias,{registry,status}),null,2)+'\n';fs.writeFileSync(path.join(dir,'card.json'),body);fs.writeFileSync(path.join(dir,'card'),body);}
 }
 const rows=Object.entries(registry.seats).map(([id,s])=>'| '+id+' | '+s.role+' | '+(s.voting_nomination?'任命席（未变更链上签名人）':'否')+' | '+(status.seats?.[id]?.status||'未探测')+' | '+(status.seats?.[id]?.healthy_url||s.health_urls[0]||'不配置代理端点')+' |');
 const collaborators=Object.entries(registry.external_collaborators||{}).map(([id,s])=>'| '+id+' | '+s.role+' | '+(s.automation?'已有代码执行器；客户端常驻另验':s.native_api_status||s.receipt_requires||'按任务回执确认，不推定在线')+' |');
 fs.writeFileSync(path.join(root,'identity/SEATS.md'),'# 当前席位与端点索引\n\n类型：事实登记；由identity/seat-registry.json与identity/endpoint-status.json生成。health不等于模型生成、额度或签名能力。\n\n11份DID记录：8个AI岗位（7在任、Microsoft暂时除名），3份治理/人类记录；不是11条模型通道。\n\n| 岗位 | 职责 | 治理任命 | 最近观察 | 首选健康地址 |\n|---|---|---|---|---|\n'+rows.join('\n')+'\n\n外部协作岗位（不额外算原生 API 或链上签名人）：\n\n| 岗位 | 工作属性 | 实际参与方式 |\n|---|---|---|\n'+collaborators.join('\n')+'\n\n工作链：GPT/千问定任务 → 单一执行席认领并交付 → 不同提供商复核 → 执行器部署并回读 → WorkBuddy代码哨兵汇总超时/阻塞。岗位授权、实际模型调用、工程上线和钱包签名分开验收。\n\n钱包唯一登记源：[wallet/addresses.md](../wallet/addresses.md)。\n');
 return {cards:Object.keys(registry.seats).length,aliases:Object.values(registry.seats).flatMap(s=>s.aliases||[]).length};
}
