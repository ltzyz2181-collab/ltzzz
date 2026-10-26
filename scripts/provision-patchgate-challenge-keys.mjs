// Keys are generated in process memory and sent only to fixed Cloudflare Secrets.
// No local key file, model call, signer admission, wallet or generic signing route.
import fs from 'node:fs';
import {generateKeyPairSync,createPublicKey,randomBytes,verify,createHash} from 'node:crypto';
import {canonicalChallenge} from '../patchgate-key-challenge-worker.js';
const targets=[{name:'ltzzz-a2-qwen-key',id:'a2-qwen-challenge-executor',provider:'aliyun_dashscope'},{name:'ltzzz-a2-doubao-key',id:'a2-doubao-challenge-executor',provider:'volcengine_ark'}];
const hash=b=>createHash('sha256').update(b).digest('hex');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export function verifyChallenge({data,nonce,target,publicKey,sourceHash}){
  const key=publicKey?.type==='public'?publicKey:createPublicKey(publicKey);
  if(data?.schema!=='ltzzz.executor.key-challenge.v1'||data.purpose!=='key_persistence_challenge_only'||data.A2_admission!==false||data.model_calls!==0||data.financial_execution!==false
    ||data.executor_id!==target.id||data.provider_binding!==target.provider||data.source_sha256!==sourceHash||!data.payload||data.payload.nonce!==nonce||data.payload.executor_id!==target.id
    ||data.payload.provider_binding!==target.provider||data.payload.execution_provider!=='cloudflare_workers'||data.payload.schema!==data.schema||data.payload.purpose!==data.purpose
    ||data.payload.task_id!=='PLAN-PATCHGATE-ESCROW-20261023'||!Number.isFinite(Date.parse(data.payload.at_utc))||Math.abs(Date.now()-Date.parse(data.payload.at_utc))>120000
    ||typeof data.signature!=='string'||!data.public_key_spki||data.public_key_spki!==key.export({format:'der',type:'spki'}).toString('base64'))throw Error('bound_challenge_required');
  if(!verify(null,Buffer.from(canonicalChallenge(data.payload)),publicKey,Buffer.from(data.signature,'base64')))throw Error('challenge_signature_invalid');return true;
}
export async function provision({env=process.env,fetchImpl=fetch}={}){
  const report={task_id:'PLAN-PATCHGATE-ESCROW-20261023',scope:'isolated_persistent_challenge_keys_not_A2_admission',at_utc:new Date().toISOString(),run_id:env.GITHUB_RUN_ID||null,source_commit:env.GITHUB_SHA||null,model_calls:0,paid:false,tx_hash:null,A2_enabled:false,production_signing_roles_enabled:false,workers:[]};
  const account=env.CLOUDFLARE_ACCOUNT_ID,token=env.CLOUDFLARE_API_TOKEN,auth=env.LTZZZ_AGENT_TOKEN;
  const source=fs.readFileSync('patchgate-key-challenge-worker.js','utf8'),sourceHash=hash(source);
  const cf=async(route,{method='GET',body}={})=>{
    const headers={Authorization:'Bearer '+token};if(body&&!(body instanceof FormData))headers['Content-Type']='application/json';
    const r=await fetchImpl('https://api.cloudflare.com/client/v4/accounts/'+account+route,{method,headers,body:body instanceof FormData?body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(30000)});
    const data=await r.json().catch(()=>null);if(!r.ok||data?.success!==true)throw Error('cloudflare_'+method.toLowerCase()+'_http_'+r.status);return data.result;
  };
  try{
    if(!account||!token||!auth)throw Error('managed_cloudflare_and_service_credentials_missing');
    const sub=await cf('/workers/subdomain');if(!/^[a-z0-9-]+$/.test(sub.subdomain||''))throw Error('workers_subdomain_unverified');
    const listed=await cf('/workers/scripts');if(!Array.isArray(listed))throw Error('worker_inventory_unavailable');
    for(const target of targets){
      const row={executor_id:target.id,provider_binding:target.provider,execution_provider:'cloudflare_workers',worker:target.name,source_sha256:sourceHash,key_values_exported:false,signing_roles_enabled:false};report.workers.push(row);
      try{
        const base='https://'+target.name+'.'+sub.subdomain+'.workers.dev';let spki;
        const upload=async publicDER=>{
          const bindings=[['EXECUTOR_ID',target.id],['PROVIDER_BINDING',target.provider],['PUBLIC_KEY_SPKI',publicDER],['SOURCE_SHA256',sourceHash]].map(([name,text])=>({type:'plain_text',name,text}));
          const f=new FormData();f.set('metadata',JSON.stringify({main_module:'signer.mjs',compatibility_date:'2026-10-01',bindings,keep_bindings:['secret_text']}));f.set('signer.mjs',new Blob([source],{type:'application/javascript+module'}),'signer.mjs');
          await cf('/workers/scripts/'+target.name,{method:'PUT',body:f});
        };
        if(listed.some(w=>w.id===target.name)){
          const r=await fetchImpl(base+'/identity',{redirect:'error',signal:AbortSignal.timeout(15000)}),d=await r.json();
          if(!r.ok||d.executor_id!==target.id||d.provider_binding!==target.provider||d.source_sha256!==sourceHash||d.key_configured!==true)throw Error('existing_executor_mismatch_no_rotation');
          spki=d.public_key_spki;row.reused_existing_key=true;
        }else{
          const pair=generateKeyPairSync('ed25519');spki=pair.publicKey.export({format:'der',type:'spki'}).toString('base64');
          await upload(spki);
          for(const[name,text]of [['SIGNING_PKCS8',pair.privateKey.export({format:'der',type:'pkcs8'}).toString('base64')],['CHALLENGE_AUTH',auth]])await cf('/workers/scripts/'+target.name+'/secrets',{method:'PUT',body:{name,text,type:'secret_text'}});
          await cf('/workers/scripts/'+target.name+'/subdomain',{method:'POST',body:{enabled:true,previews_enabled:false}});
          row.reused_existing_key=false;
        }
        const publicKey=createPublicKey({key:Buffer.from(spki,'base64'),format:'der',type:'spki'});
        const challenge=async()=>{
          const nonce=randomBytes(32).toString('hex');let last;
          for(let i=0;i<8;i++){
            try{const r=await fetchImpl(base+'/challenge',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+auth},body:JSON.stringify({nonce}),redirect:'error',signal:AbortSignal.timeout(15000)});if(!r.ok)throw Error('challenge_http_'+r.status);const d=await r.json();verifyChallenge({data:d,nonce,target,publicKey,sourceHash});return {payload:d.payload,signature:d.signature};}catch(e){last=e;if(i<7)await sleep(1000);}
          }throw last;
        };
        row.first_challenge=await challenge();
        await upload(spki); // New deployment, existing Secrets deliberately retained.
        row.after_redeployment_challenge=await challenge();
        row.public_key_pem=publicKey.export({format:'pem',type:'spki'});row.public_key_sha256=hash(Buffer.from(spki,'base64'));row.url=base;
        row.persistence_verified=true;row.status='persistent_challenge_key_verified_not_admitted';
      }catch(e){row.status='blocked_no_rotation_no_admission';row.error=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'provision_or_challenge_unavailable';}
    }
    report.status=report.workers.length===2&&report.workers.every(w=>w.persistence_verified)?'two_persistent_keys_verified_not_admitted':'blocked_or_partial_enrollment';
  }catch(e){report.status='blocked_enrollment';report.error=/^[A-Za-z0-9_]+$/.test(e.message)?e.message:'enrollment_transport_unavailable';}
  fs.mkdirSync('knowledge/results/patchgate/key-enrollment',{recursive:true});
  fs.writeFileSync('knowledge/results/patchgate/key-enrollment/'+(env.GITHUB_RUN_ID||'local')+'.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));return report;
}
if(import.meta.url===`file://${process.argv[1]}`){const r=await provision();if(r.status!=='two_persistent_keys_verified_not_admitted')process.exitCode=1;}
