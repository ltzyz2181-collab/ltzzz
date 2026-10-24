// Claude A1 re-review probe: REAL githubApi validator + fake GitHub (no network/secrets). Usage: node a1-claude-probe-rereview.mjs <checkout-root-of-PR-227-head-87f270d0>
const R=process.argv[2]||'.';
const O=await import(R+'/scripts/patchgate-observe.mjs');
const sha=c=>c.repeat(40);
const refs=new Map(),files=new Map(),log=[];
// Fake GitHub behind the REAL githubApi validator, so the validator is exercised on every call.
const fakeFetch=async(url,o)=>{
 const ep=url.replace('https://api.github.com','');log.push(o.method+' '+ep);
 const body=o.body?JSON.parse(o.body):undefined;
 const J=(status,data)=>({status,text:async()=>JSON.stringify(data)});
 if(o.method==='GET'&&/\/pulls\/(7|8)$/.test(ep)){const n=ep.endsWith('7')?7:8;return J(200,{number:n,author_association:'OWNER',base:{ref:'main',repo:{full_name:'ltzyz2181-collab/ltzzz'}},head:{sha:sha(n===7?'b':'e')},body:''})}
 if(o.method==='POST'&&ep.endsWith('/git/refs')){if(refs.has(body.ref))return J(422,{});refs.set(body.ref,body.sha);return J(201,{})}
 if(o.method==='GET'&&ep.includes('/git/ref/heads/')){const r='refs/heads/'+ep.split('/git/ref/heads/')[1];return refs.has(r)?J(200,{ref:r,object:{sha:refs.get(r)}}):J(404,{})}
 if(o.method==='PUT'){const p=ep.split('/contents/')[1];files.set(p,body);return J(201,{commit:{sha:sha('c')}})}
 return J(404,{})};
const api=O.githubApi({token:'t',fetchImpl:fakeFetch});
const boom=()=>{throw Error('simulated_large_diff_or_transient_git_error')};
const r1=await O.observe({api,prNumber:7,runnerSha:sha('a'),runId:'1',collect:boom,gitImpl:()=>sha('d')});
console.log('failure run  ->',r1.status,'| stage',r1.failure_stage,'| code',r1.error_code,'| failure record persisted:',!!r1.artifact);
const r2=await O.observe({api,prNumber:7,runnerSha:sha('a'),runId:'2',collect:boom,gitImpl:()=>sha('d')});
console.log('retry        ->',r2.status);
console.log('files written:',[...files.keys()].map(k=>k.replace(/[a-f0-9]{64}/,'<key>')));
// head moved between read and claim
let calls=0;const moving=async(m,e,b)=>{const r=await api(m,e,b);return r};
try{await O.observe({api,prNumber:8,runnerSha:sha('a'),runId:'3',expectedHead:sha('f'),collect:boom,gitImpl:()=>sha('d')})}catch(x){console.log('head-moved   ->',x.message)}
