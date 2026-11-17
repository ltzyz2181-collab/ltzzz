import test from 'node:test';import assert from 'node:assert/strict';import vm from 'node:vm';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import {execFileSync} from 'node:child_process';import {fileURLToPath} from 'node:url';
const root=new URL('../../',import.meta.url),read=p=>fs.readFileSync(new URL(p,root),'utf8');
test('catalogue remains usable while unconfigured payment cannot call cloud or requestPayment',()=>{
 let page,calls=0;const wx={showToast:()=>{},cloud:{callFunction:()=>{calls++;}},requestPayment:()=>{calls++;},setNavigationBarTitle:()=>{}};
 vm.runInNewContext(read('miniprogram/pages/product/index.js'),{Page:p=>page=p,wx,require:p=>p.includes('products')?{products:[{id:'source-check',title:'Source'}]}:{payEnabled:true,cloudEnv:''}});
 page.setData=function(v){Object.assign(this.data,v);};page.onLoad({id:'source-check'});page.data.agreed=true;page.onBuy();assert.equal(page.data.product.id,'source-check');assert.equal(page.data.payEnabled,false);assert.equal(calls,0);
 // 页面层只认 cloudEnv：即便 config.payEnabled 打开，没有云环境也不能发起支付。
 // config 侧只断言开关是布尔值——线上已把 payEnabled 设为 true，硬编码 false 会让本测试长期误红。
 const config={module:{exports:{}}};vm.runInNewContext(read('miniprogram/config/index.js'),config);assert.equal(typeof config.module.exports.payEnabled,'boolean');
});
function queryFixture({openid='owner',orderOwner='owner',proof={}}={}){
 let requests=0,writes=0;const order={_id:'one',openid:orderOwner,out_trade_no:'ORDER1',amount:990,status:'pending'};
 const db={collection:()=>({where:condition=>({get:async()=>({data:Object.entries(condition).every(([k,v])=>order[k]===v)?[order]:[]}),update:async({data})=>{if(Object.entries(condition).every(([k,v])=>order[k]===v)){Object.assign(order,data);writes++;}return {};}})})};
 const cloud={init:()=>{},database:()=>db,getWXContext:()=>({OPENID:openid,APPID:'wx-target'})};
 const pay={MCHID:'merchant',isConfigured:()=>true,request:async()=>{requests++;return {statusCode:200,body:{out_trade_no:'ORDER1',appid:'wx-target',mchid:'merchant',payer:{openid:'owner'},amount:{total:990,currency:'CNY'},transaction_id:'TX1',trade_state:'SUCCESS',...proof}};}};
 const exports={};vm.runInNewContext(read('miniprogram/cloudfunctions/order-query/index.js'),{exports,require:p=>p==='wx-server-sdk'?cloud:pay,console:{error:()=>{}}});
 return {run:()=>exports.main({outTradeNo:'ORDER1'}),requests:()=>requests,writes:()=>writes};
}
test('orders cannot be queried anonymously or across OPENIDs, before any upstream payment read',async()=>{
 for(const f of [queryFixture({openid:null}),queryFixture({orderOwner:'another'})]){assert.equal((await f.run()).paid,false);assert.equal(f.requests(),0);assert.equal(f.writes(),0);}
});
test('paid requires matching owner, merchant, AppID, amount and order; confirmed update is idempotent',async()=>{
 for(const proof of [{amount:{total:1,currency:'CNY'}},{mchid:'other'},{appid:'other'},{out_trade_no:'OTHER'},{payer:{openid:'other'}},{transaction_id:''}]){const f=queryFixture({proof});assert.equal((await f.run()).paid,false);assert.equal(f.writes(),0);}
 const f=queryFixture();assert.equal((await f.run()).paid,true);assert.equal((await f.run()).paid,true);assert.equal(f.writes(),1);
});
test('CI cannot upload the enterprise project to the historical secret AppID or a guessed default',()=>{
 for(const appid of ['wx0b43a6cf2cb2b07d',null]){
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'mini-target-'));try{fs.mkdirSync(path.join(dir,'miniprogram'));fs.writeFileSync(path.join(dir,'miniprogram/project.config.json'),JSON.stringify({appid:'wx562bcb6057346fb2'}));execFileSync(process.execPath,[fileURLToPath(new URL('../../scripts/miniprogram-upload.mjs',import.meta.url))],{cwd:dir,env:{PATH:process.env.PATH,...(appid?{MINI_APPID:appid}:{})},stdio:'pipe'});const r=JSON.parse(fs.readFileSync(path.join(dir,'results/commerce/miniprogram-upload-latest.json')));assert.equal(r.status,'blocked_appid_mismatch');assert.equal(r.upload_attempted,false);assert.equal(r.uploaded,false);}finally{fs.rmSync(dir,{recursive:true,force:true});}
 }
});
