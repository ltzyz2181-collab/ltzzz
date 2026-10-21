// Keep the already-funded API key and its official route together.
export function doubaoRoute(env){
 const url=new URL(env.DOUBAO_BASE_URL||'https://ark.cn-beijing.volces.com/api/v3');
 if(url.protocol!=='https:'||url.hostname!=='ark.cn-beijing.volces.com'||url.username||url.password||url.search||url.hash)throw Error('official_doubao_route_required');
 url.pathname=url.pathname.replace(/\/+$/,'');if(!url.pathname.endsWith('/chat/completions'))url.pathname+='/chat/completions';
 return {url:url.href,key:env.DOUBAO_API_KEY||env.ARK_API_KEY,key_source:env.DOUBAO_API_KEY?'DOUBAO_API_KEY':'ARK_API_KEY'};
}
