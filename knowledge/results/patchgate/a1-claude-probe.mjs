// Claude A1 audit probe (fake fetch/API only; no network, no secrets). Usage: node a1-claude-probe.mjs <checkout-root-of-PR-227-head-bf18c9fa>
const R=process.argv[2]||'.';
const O=await import(R+'/scripts/patchgate-observe.mjs');
const sha=c=>c.repeat(40);
// 1. generic wrapper: can it issue a PR merge (PUT) or open an issue (POST)?
const calls=[];
const api=O.githubApi({token:'t',fetchImpl:async(u,o)=>{calls.push(o.method+' '+u.replace('https://api.github.com',''));return {status:200,text:async()=>'{}'}}});
for(const [m,e] of [['PUT','/repos/ltzyz2181-collab/ltzzz/pulls/1/merge'],['POST','/repos/ltzyz2181-collab/ltzzz/issues'],['PUT','/repos/ltzyz2181-collab/ltzzz/contents/config/patch-policy.json']]){
  try{await api(m,e,{});console.log('ALLOWED by wrapper:',m,e)}catch(x){console.log('blocked:',m,e,x.message)}}
// 2. claim then failure -> orphan claim, retry permanently blocked, no failure record
const refs=new Set();const writes=[];
const fake=async(m,e,b)=>{
 if(m==='GET'&&/\/pulls\/7$/.test(e))return {status:200,data:{number:7,base:{ref:'main',repo:{full_name:'ltzyz2181-collab/ltzzz'}},head:{sha:sha('b')},body:''}};
 if(m==='POST'&&e.endsWith('/git/refs')){ if(refs.has(b.ref))return {status:422,data:{}}; refs.add(b.ref);return {status:201,data:{}}}
 if(m==='GET'&&e.includes('/git/ref/heads/')){const r='refs/heads/'+e.split('/git/ref/heads/')[1];return refs.has(r)?{status:200,data:{ref:r,object:{sha:sha('a')}}}:{status:404,data:null}}
 if(m==='PUT'){writes.push(e);return {status:201,data:{commit:{sha:sha('c')}}}}
 return {status:404,data:null}};
const boom=()=>{throw Error('simulated_large_diff_or_transient_git_error')};
let r1;try{r1=await O.observe({api:fake,prNumber:7,runnerSha:sha('a'),runId:'1',collect:boom,gitImpl:()=>sha('d')})}catch(x){r1='THROWN '+x.message}
console.log('first run:',r1);
const r2=await O.observe({api:fake,prNumber:7,runnerSha:sha('a'),runId:'2',collect:boom,gitImpl:()=>sha('d')});
console.log('retry:',r2.status,'| writes so far:',writes.length);
