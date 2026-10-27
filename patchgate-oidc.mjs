// Fixed GitHub issuer and claims. This authenticates an Actions executor, not a model.
export const REPO='ltzyz2181-collab/ltzzz';
export const ISSUER='https://token.actions.githubusercontent.com';
export const ENROLL_WORKFLOW=REPO+'/.github/workflows/patchgate-key-enrollment.yml@refs/heads/main';
const bytes=s=>Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0));
const part=s=>{if(!/^[A-Za-z0-9_-]+$/.test(s))throw Error('oidc_encoding');return JSON.parse(new TextDecoder().decode(bytes(s)));};
export const challengeAudience=id=>'urn:ltzzz:patchgate:challenge:'+id;
export async function verifyActionsOidc(token,{audience,workflowRef=ENROLL_WORKFLOW,now=Date.now(),fetchImpl=fetch}={}){
  if(typeof token!=='string'||token.length>16000||!audience||!workflowRef.startsWith(REPO+'/.github/workflows/'))throw Error('oidc_required');
  const p=token.split('.');if(p.length!==3)throw Error('oidc_encoding');
  const h=part(p[0]),c=part(p[1]);
  if(h.alg!=='RS256'||typeof h.kid!=='string'||h.kid.length>200||h.crit||h.jku||h.x5u||!/^[A-Za-z0-9_-]+$/.test(p[2]))throw Error('oidc_algorithm');
  const sec=Math.floor(now/1000);
  if(c.iss!==ISSUER||c.aud!==audience||c.repository!==REPO||c.repository_id!=='1157602630'||c.repository_owner_id!=='261544579'
    ||c.ref!=='refs/heads/main'||c.sub!=='repo:'+REPO+':ref:refs/heads/main'||c.workflow_ref!==workflowRef
    ||!['push','workflow_dispatch'].includes(c.event_name)||c.runner_environment!=='github-hosted'
    ||!/^\d{1,20}$/.test(c.run_id||'')||!/^\d{1,9}$/.test(c.run_attempt||'')||Number(c.run_attempt)<1
    ||!/^[a-f0-9]{40}$/.test(c.sha||'')||c.workflow_sha!==c.sha
    ||![c.iat,c.nbf,c.exp].every(Number.isSafeInteger)||c.iat>sec+30||c.nbf>sec+30||c.exp<=sec
    ||sec-c.iat>300||c.exp-c.iat>600||c.exp<=c.iat)throw Error('oidc_claims');
  const r=await fetchImpl(ISSUER+'/.well-known/jwks',{redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('oidc_jwks_unavailable');
  const text=await r.text();if(text.length>100000)throw Error('oidc_jwks_size');
  const set=JSON.parse(text),keys=set.keys?.filter(k=>k.kid===h.kid&&k.kty==='RSA'&&(!k.use||k.use==='sig')&&(!k.alg||k.alg==='RS256'));
  if(keys?.length!==1)throw Error('oidc_key_unknown');
  const key=await crypto.subtle.importKey('jwk',keys[0],{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  if(!await crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,bytes(p[2]),new TextEncoder().encode(p[0]+'.'+p[1])))throw Error('oidc_signature');
  return {run_id:c.run_id,run_attempt:Number(c.run_attempt),source_commit:c.sha,workflow_ref:c.workflow_ref};
}
export async function actionsOidcToken({env=process.env,audience,fetchImpl=fetch}={}){
  if(!env.ACTIONS_ID_TOKEN_REQUEST_URL||!env.ACTIONS_ID_TOKEN_REQUEST_TOKEN)throw Error('actions_oidc_not_available');
  const url=new URL(env.ACTIONS_ID_TOKEN_REQUEST_URL);
  if(url.protocol!=='https:'||url.port||url.username||url.password||url.hash||!url.hostname.endsWith('.actions.githubusercontent.com'))throw Error('actions_oidc_origin');
  url.searchParams.set('audience',audience);
  const r=await fetchImpl(url.href,{headers:{Authorization:'Bearer '+env.ACTIONS_ID_TOKEN_REQUEST_TOKEN},redirect:'error',signal:AbortSignal.timeout(15000)});
  if(!r.ok)throw Error('actions_oidc_http');
  const data=await r.json();if(typeof data.value!=='string'||data.value.length>16000)throw Error('actions_oidc_response');
  return data.value;
}
