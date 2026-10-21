// Service credentials belong to server-side executors, never public HTML.
export const PROXY_AUTH_REVISION = 'proxy-auth-v1';
export function proxyAuthState(env) {
  return {proxy_auth_revision:PROXY_AUTH_REVISION, auth_required:env.REQUIRE_TOKEN==='true', auth_configured:Boolean(env.LTZZZ_AGENT_TOKEN)};
}
async function sameSecret(a,b) {
  const hash=async value=>new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)));
  const [left,right]=await Promise.all([hash(a),hash(b)]);let difference=0;
  for(let i=0;i<left.length;i++)difference|=left[i]^right[i];
  return difference===0;
}
export async function proxyAuth(request,env,{required=env.REQUIRE_TOKEN==='true',legacyToken=null}={}) {
  if(!required&&!legacyToken)return null; // migration only; deployment explicitly enables the gate.
  const keys=[env.LTZZZ_AGENT_TOKEN,legacyToken].filter(v=>typeof v==='string'&&v.length>0);
  const reply=(error,status)=>Response.json({ok:false,error,model_calls:0},{status,headers:{'Access-Control-Allow-Origin':'*'}});
  if(!keys.length)return reply('service_auth_not_configured',503);
  const match=/^Bearer ([^\s]+)$/i.exec(request.headers.get('Authorization')||'');
  if(!match||match[1].length>8192)return reply('unauthorized',401);
  const matches=await Promise.all(keys.map(key=>sameSecret(match[1],key)));
  return matches.some(Boolean)?null:reply('unauthorized',401);
}
export async function authCheck(request,env,options={}) {
  return await proxyAuth(request,env,{...options,required:true})||Response.json({ok:true,authenticated:true,proxy_auth_revision:PROXY_AUTH_REVISION,model_calls:0,generation_verified:false});
}
