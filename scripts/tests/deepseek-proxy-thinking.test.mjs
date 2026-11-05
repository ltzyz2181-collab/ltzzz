import test from 'node:test';
import assert from 'node:assert/strict';
import proxy from '../../deepseek-proxy-worker-v2.js';
import {deepThinkingOptions} from '../../lib/deepseek-thinking.js';
const env={DEEPSEEK_API_KEY:'fixture-native-key',LTZZZ_AGENT_TOKEN:'fixture-service-identity',DEEPSEEK_MODEL:'deepseek-v4-pro'};
const ask=body=>proxy.fetch(new Request('https://proxy.test/',{method:'POST',headers:{Authorization:'Bearer '+env.LTZZZ_AGENT_TOKEN,'Content-Type':'application/json'},body:JSON.stringify({messages:[{role:'user',content:'Return a bounded review.'}],max_tokens:8192,...body})}),env);
async function observed(fn){
 const original=globalThis.fetch,calls=[];
 globalThis.fetch=async(url,options)=>{calls.push({url,body:JSON.parse(options.body)});return Response.json({id:'fixture-response',model:'deepseek-v4-pro',choices:[{message:{content:'Complete bounded fixture output.'},finish_reason:'stop'}],usage:{total_tokens:15}});};
 try{await fn(calls);}finally{globalThis.fetch=original;}
}
test('explicit coordinator thinking mode reaches upstream without model downgrade or budget change',async()=>observed(async calls=>{
 const response=await ask({thinking:{type:'disabled'}});assert.equal(response.status,200);
 assert.equal(calls.length,1);assert.deepEqual(calls[0].body.thinking,{type:'disabled'});assert.equal(calls[0].body.model,'deepseek-v4-pro');assert.equal(calls[0].body.max_tokens,8192);
 const result=await response.json();assert.equal(result.ltzzz_receipt.generation_verified,true);assert.equal(result.ltzzz_receipt.actual_model,'deepseek-v4-pro');
}));
test('callers omitting thinking retain provider default; explicit enabled remains supported',async()=>observed(async calls=>{
 await ask({});await ask({thinking:{type:'enabled'}});assert.equal(calls.length,2);
 assert.equal(Object.hasOwn(calls[0].body,'thinking'),false);assert.deepEqual(calls[1].body.thinking,{type:'enabled'});
}));
test('invalid thinking input is refused before a paid upstream attempt and is never retried',async()=>observed(async calls=>{
 for(const thinking of [null,[],true,'disabled',{}, {type:'invalid'},{type:'disabled',extra:'ignored'}]){
  const r=await ask({thinking});assert.equal(r.status,400);assert.equal((await r.json()).stage,'request_validation');
 }
 assert.equal(calls.length,0);
}));
test('Deep review counterexamples reject inherited/class/accessor/symbol options without evaluating getters',()=>{
 const inherited=Object.create({type:'enabled'});inherited.type='disabled';
 class Option {constructor(){this.type='disabled';}}
 let reads=0;const getter={get type(){reads++;return 'disabled';}};
 const extraSymbol={type:'disabled',[Symbol('extra')]:true};
 for(const value of [inherited,new Option(),Object.create(null),getter,extraSymbol])assert.throws(()=>deepThinkingOptions(value),TypeError);
 assert.equal(reads,0);
});
