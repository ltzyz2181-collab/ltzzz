// Parent, all child intents, journal and idempotency receipt commit in one Wep3Ledger transaction.
import {ATOMIC_LEDGER_CONTEXT} from './wep3-ledger.js';
import seatRegistry from './identity/seat-registry.json' with {type:'json'};
const AGENTS = ['Grok','Doubao','DeepSeek','Qianwen','Kimi','GPT','Microsoft','Claude','Meya','LTZZZ'];
const ACTIVE_SEATS = {Microsoft:'microsoft',Grok:'grok',Doubao:'doubao',DeepSeek:'deepseek',Qianwen:'qianwen',Kimi:'kimi',GPT:'gpt',Claude:'claude'};
const reject = (error,status=422,extra={}) => ({ok:false,error,status,funds_reserved:false,paid:false,tx_hash:null,...extra});
function micros(value) {
  const s=String(value);
  if (!/^\d{1,9}(?:\.\d{1,6})?$/.test(s)) throw Error('invalid_micro_amount');
  const [whole,fraction='']=s.split('.');
  return BigInt(whole)*1000000n+BigInt(fraction.padEnd(6,'0'));
}
const usd = amount => Number(amount)/1000000;
async function digest(s) { const d=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s));return [...new Uint8Array(d)].map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function read(env,key) { const raw=await env.PAY_KV.get(key);return raw===null?null:JSON.parse(raw); }
async function put(env,key,row) { await env.PAY_KV.put(key,JSON.stringify(row)); }

async function reserve(env,parentId,plan,poster,key,operation) {
  // A caller-controlled request field/header cannot manufacture this module-private symbol.
  if (env[ATOMIC_LEDGER_CONTEXT]!==true) return reject('atomic_swarm_context_required',503);
  if (!AGENTS.includes(poster)) return reject('unknown_poster',400);
  if (seatRegistry.seats[ACTIVE_SEATS[poster]]?.work_status==='temporarily_removed') return reject('temporarily_removed_agent',403);
  if (typeof parentId!=='string'||!/^[A-Za-z0-9_-]{1,160}$/.test(parentId)) return reject('invalid_parent_id');
  if (typeof key!=='string'||!/^[A-Za-z0-9_.:-]{8,128}$/.test(key)) return reject('idempotency_key_required');
  if (!Array.isArray(plan)||plan.length<1||plan.length>20) return reject('bounded_nonempty_plan_required');
  let steps;
  try {
    steps=plan.map(step=>{
      if (!step||typeof step!=='object'||Array.isArray(step)||typeof step.skill!=='string') throw Error('invalid_step');
      const amount=micros(step.max_usd);
      if (amount<=0n) throw Error('invalid_amount');
      if (step.title!==undefined&&(typeof step.title!=='string'||step.title.length>500)) throw Error('invalid_title');
      if (step.depth!==undefined&&(!Number.isSafeInteger(step.depth)||step.depth<1||step.depth>32)) throw Error('invalid_depth');
      return {skill:step.skill,amount_micro:amount.toString(),title:step.title??null,depth:step.depth??null};
    });
  } catch { return reject('invalid_swarm_plan'); }
  const requestHash=await digest(JSON.stringify({operation,parentId,poster,steps}));
  const reservationKey='wep3:swarm-idempotency:'+await digest(poster+'\0'+parentId+'\0'+key);
  const existing=await read(env,reservationKey);
  if (existing) {
    if (existing.request_sha256!==requestHash) return reject('idempotency_conflict',409);
    return existing.result;
  }
  const parentKey='wep3:intent:'+parentId,parent=await read(env,parentKey);
  if (!parent||['sealed','void'].includes(parent.status)) return reject('parent_not_open',409);
  if (parent.poster!==poster) return reject('not_parent_poster',403);
  let remaining,held,total;
  try {remaining=micros(parent.remaining);held=micros(parent.held??0);total=steps.reduce((n,s)=>n+BigInt(s.amount_micro),0n);} catch {return reject('invalid_parent_budget',409);}
  if (total>remaining) return reject('slice_exceeds_remaining',409,{remaining:usd(remaining)});
  const parentDepth=parent.depth??0;
  if (!Number.isSafeInteger(parentDepth)||parentDepth<0||parentDepth>=32||steps.some(s=>s.depth!==null&&s.depth!==parentDepth+1)) return reject('invalid_causal_depth');
  if (!Array.isArray(parent.children??[])||!Array.isArray(parent.causal_chain??[])) return reject('invalid_parent_shape',409);
  const {SKILLS}=await import('./wep3-worker.js');
  const skills=steps.map(s=>SKILLS.find(k=>k.id===s.skill));
  if (skills.some(s=>!s)) return reject('unknown_skill');
  // Validate every step before staging any reservation or child.
  const at=new Date().toISOString(),childRows=steps.map((step,i)=>{
    const skill=skills[i],id='intent-'+crypto.randomUUID(),amount=usd(BigInt(step.amount_micro));
    return {id,parent_id:parentId,poster,skill:step.skill,title:step.title??skill.title,max_usd:amount,remaining:amount,status:'open',quotes:skill.owner&&skill.owner!==poster?[{agent:skill.owner,price:skill.price,at}]:[],created_at:at,causal_parent:parentId,depth:parentDepth+1,causal_chain:(parent.causal_chain??[parentId]).concat(id)};
  });
  parent.remaining=usd(remaining-total);parent.held=usd(held+total);parent.children=[...(parent.children??[]),...childRows.map(c=>c.id)];
  await put(env,parentKey,parent);
  for (const child of childRows) {
    await put(env,'wep3:intent:'+child.id,child);
    const id='LED-swarm-'+crypto.randomUUID();
    await put(env,'wep3:ledger:'+id,{id,at,type:'swarm_spawn',from:parentId,to:child.id,amount_usd:child.max_usd,ref:parentId,request_sha256:requestHash,meta:{skill:child.skill,poster,title:child.title,depth:child.depth},settlement_mode:'internal_credit',paid:false,tx_hash:null});
  }
  const children=childRows.map(child=>({ok:true,parent_id:parentId,child_id:child.id,sliced:child.max_usd,remaining:parent.remaining,auto_bid:child.quotes.length>0,depth:child.depth}));
  const base={ok:true,status:'reserved_not_dispatched',parent_id:parentId,settlement_mode:'internal_credit',funds_reserved:true,model_calls:0,paid:false,tx_hash:null};
  const result=operation==='spawn'?{...base,...children[0]}:{...base,children,total_sliced:usd(total)};
  await put(env,reservationKey,{request_sha256:requestHash,result,created_at:at});
  return result;
}
export async function spawnChild(env,parentId,skillId,maxUsd,title,poster,depth,idempotencyKey) {
  return reserve(env,parentId,[{skill:skillId,max_usd:maxUsd,...(title===undefined?{}:{title}),...(depth===undefined?{}:{depth})}],poster,idempotencyKey,'spawn');
}
export async function spawnTree(env,parentId,plan,poster,idempotencyKey) {
  return reserve(env,parentId,plan,poster,idempotencyKey,'tree');
}
