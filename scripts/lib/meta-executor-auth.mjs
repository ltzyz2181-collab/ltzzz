import {createHmac} from 'node:crypto';
// Recoverable only inside existing managed executors. Never an API/model key,
// never a credential for the external Meta client, never stored in repository.
export function metaExecutorToken(env=process.env){
 if(env.META_WORKER_TOKEN)return env.META_WORKER_TOKEN;
 if(!env.CLOUDFLARE_API_TOKEN)throw Error('managed_meta_credential_missing');
 return createHmac('sha256',env.CLOUDFLARE_API_TOKEN).update('ltzzz-meta-hosted-control-v1').digest('hex');
}
