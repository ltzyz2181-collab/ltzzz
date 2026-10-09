import proxy from '../../kimi-proxy-worker.js';
export default {async fetch(request,env){
 const path=new URL(request.url).pathname;
 if(request.method==='GET'&&path==='/health')return Response.json({slot:'kimi-domestic',region:'cn',base:'https://api.moonshot.cn/v1/chat/completions',has_key:Boolean(env.KIMI_API_KEY),auth_configured:Boolean(env.KIMI_WORKER_TOKEN)});
 if(request.method==='POST'){
  if(!env.KIMI_WORKER_TOKEN)return Response.json({error:'auth_not_configured'},{status:503});
  if(request.headers.get('Authorization')!==`Bearer ${env.KIMI_WORKER_TOKEN}`)return Response.json({error:'unauthorized'},{status:401});
 }
 return proxy.fetch(request,{...env,KIMI_BASE_URL:'https://api.moonshot.cn/v1/chat/completions'});
}};
