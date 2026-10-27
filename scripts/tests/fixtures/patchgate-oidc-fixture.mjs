import {generateKeyPairSync,sign} from 'node:crypto';
import {REPO,ISSUER,ENROLL_WORKFLOW} from '../../../patchgate-oidc.mjs';
const pair=generateKeyPairSync('rsa',{modulusLength:2048});
export const fixtureJwk={...pair.publicKey.export({format:'jwk'}),kid:'fixture-key',use:'sig',alg:'RS256'};
export const fixtureEnv={GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ID:'987654',GITHUB_RUN_ATTEMPT:'1',GITHUB_WORKFLOW_REF:ENROLL_WORKFLOW,ACTIONS_ID_TOKEN_REQUEST_URL:'https://oidc.actions.githubusercontent.com/request',ACTIONS_ID_TOKEN_REQUEST_TOKEN:'fixture-actions-oidc-request-token',CLOUDFLARE_ACCOUNT_ID:'fixture',CLOUDFLARE_API_TOKEN:'fixture-cf-token'};
export function fixtureJwt(audience,patch={},header={}){
 const sec=Math.floor(Date.now()/1000),c={iss:ISSUER,aud:audience,repository:REPO,repository_id:'1157602630',repository_owner_id:'261544579',ref:'refs/heads/main',sub:'repo:'+REPO+':ref:refs/heads/main',workflow_ref:ENROLL_WORKFLOW,sha:fixtureEnv.GITHUB_SHA,workflow_sha:fixtureEnv.GITHUB_SHA,event_name:'workflow_dispatch',runner_environment:'github-hosted',run_id:fixtureEnv.GITHUB_RUN_ID,run_attempt:fixtureEnv.GITHUB_RUN_ATTEMPT,iat:sec,nbf:sec,exp:sec+300,...patch};
 const encode=x=>Buffer.from(JSON.stringify(x)).toString('base64url'),body=encode({alg:'RS256',kid:'fixture-key',typ:'JWT',...header})+'.'+encode(c);
 return body+'.'+sign('RSA-SHA256',Buffer.from(body),pair.privateKey).toString('base64url');
}
export const fixtureJwksFetch=async(url,o)=>{if(url!==ISSUER+'/.well-known/jwks'||o.redirect!=='error')throw Error('unexpected_fixture_jwks_url');return Response.json({keys:[fixtureJwk]});};
