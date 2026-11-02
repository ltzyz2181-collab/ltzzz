import {createServer} from 'node:http';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
const html=readFileSync('wep3.html');
const server=createServer((req,res)=>{res.setHeader('content-type','text/html; charset=utf-8');res.end(html);});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const base='http://127.0.0.1:'+server.address().port,browser=await chromium.launch({headless:true});
const cases=[{name:'missing',receipt:{paid:false},expected:'字段缺失'},{name:'explicit-null',receipt:{paid:false,tx_hash:null},expected:'明确 null'},{name:'empty',receipt:{paid:false,tx_hash:''},expected:'空字符串'},{name:'whitespace',receipt:{paid:false,tx_hash:'  '},expected:'空字符串'},{name:'wrong-type',receipt:{paid:false,tx_hash:false},expected:'类型错误'},{name:'hash',receipt:{paid:true,tx_hash:'0x'+'a'.repeat(64)},expected:'0x'+'a'.repeat(64)},{name:'literal-html',receipt:{paid:false,tx_hash:'<img src=x onerror="document.body.dataset.injected=1">'},expected:'<img'}];
const results=[];
try{
  for(const [device,viewport]of [['desktop',{width:1280,height:900}],['mobile',{width:390,height:844}]]){
    const context=await browser.newContext({viewport}),page=await context.newPage();
    for(const c of cases){
      await page.route('**/knowledge/results/wep3/latest.json',route=>route.fulfill({json:{status:'live_contract_check_failed',...c.receipt}}));
      await page.goto(base);await page.waitForFunction(()=>document.querySelector('#money').textContent.includes('交易哈希'));
      const text=await page.locator('#money').textContent();assert.ok(text.includes(c.expected),device+' '+c.name+': '+text);assert.ok(text.includes('未独立链上核验'));
      assert.equal(await page.locator('#money img').count(),0);assert.equal(await page.locator('body').getAttribute('data-injected'),null);
      results.push({device,case:c.name,passed:true});await page.unroute('**/knowledge/results/wep3/latest.json');
    }
    await context.close();
  }
}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
const out='knowledge/results/wep3/swarm-atomic-browser-'+(process.env.GITHUB_RUN_ID||'local')+'.json';mkdirSync('knowledge/results/wep3',{recursive:true});writeFileSync(out,JSON.stringify({at_utc:new Date().toISOString(),source_commit:process.env.GITHUB_SHA||null,browser:'Chromium',scope:'local candidate HTML with fixture receipts; production acceptance separate',passed:results.length,failed:0,results},null,2)+'\n');console.log(JSON.stringify({browser_cases_passed:results.length,failed:0}));
