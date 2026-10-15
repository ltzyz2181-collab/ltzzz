import {createHmac} from 'node:crypto';
export function pulseToken(role,env=process.env){if(!['gpt','qianwen'].includes(role)||!env.CLOUDFLARE_API_TOKEN)throw Error('pulse_executor_credentials_missing');return createHmac('sha256',env.CLOUDFLARE_API_TOKEN).update('ltzzz-pulse-control-v1:'+role).digest('hex');}
