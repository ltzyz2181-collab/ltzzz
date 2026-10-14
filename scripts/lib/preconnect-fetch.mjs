const safe=new Set(['ENOTFOUND','EAI_AGAIN','ECONNREFUSED','UND_ERR_CONNECT_TIMEOUT']);
export const networkCode=e=>String(e?.cause?.code||e?.code||'UNKNOWN').replace(/[^A-Z0-9_]/g,'').slice(0,60)||'UNKNOWN';
// A reset/response timeout may already be billed. Retry once only if connection never opened.
export async function preconnectFetch(url,options){
 try{return await fetch(url,options);}catch(e){if(!safe.has(networkCode(e)))throw e;await new Promise(resolve=>setTimeout(resolve,150));return fetch(url,options);}
}
