// Local workerd/SQLite smoke test. No provider, wallet or remote Worker calls.
// Install the existing deployment dependency first: npm install --no-save wrangler@4
import {createRequire} from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(process.env.WEP3_TEST_TOOLING || import.meta.url);
const {build} = require('esbuild');
const {Miniflare, convertV4MiniflareOptions} = require('miniflare');
fs.mkdirSync('work', {recursive:true});
const scratch = fs.mkdtempSync(path.resolve('work/wep3-runtime-'));
let mf;
try {
 const bundle = path.join(scratch,'worker.mjs');
 await build({entryPoints:['wep3-worker.js'],bundle:true,format:'esm',outfile:bundle});
 const options = {modules:true,scriptPath:bundle,compatibilityDate:'2026-09-30',kvNamespaces:['PAY_KV'],durableObjects:{WEP3_LEDGER:{className:'Wep3Ledger',useSQLite:true}},bindings:{LAB_PIN:'test',WEP3_RUNNER_TOKEN:'runner',LEGACY_KV_FROZEN:'1'}};
 mf = new Miniflare(convertV4MiniflareOptions ? convertV4MiniflareOptions(options) : options);
 const text='Concrete delivery: https://ltzzz.com/knowledge/results/wep3/test.json';
 const body={agent:'DeepSeek',worker:'Doubao',skill:'copy',max_usd:0.04,deliverable:text,evidence_path:'knowledge/results/wep3/test.json',audit_report:{accepted:true,auditor:'GPT',reason:'independent audit',deliverable_sha256:createHash('sha256').update(text).digest('hex')}};
 const call=async()=>{const r=await mf.dispatchFetch('https://test/hire',{method:'POST',headers:{'Content-Type':'application/json','X-Lab-Pin':'runner'},body:JSON.stringify(body)});return {http:r.status,...await r.json()};};
 const replies=await Promise.all(Array.from({length:20},call));
 assert.equal(replies.filter(x=>x.status==='HIRED').length,1,JSON.stringify(replies));
 assert.equal(replies.filter(x=>x.status==='ALREADY_SETTLED').length,19,JSON.stringify(replies));
 const ledger=await (await mf.dispatchFetch('https://test/ledger')).json();
 assert.equal(ledger.entries.filter(x=>x.type==='hire_settle').length,1);
 assert.ok(Math.abs(ledger.credit_sum+ledger.pool_nav-9)<0.000001);
 console.log('SQLite Durable Object: 20 concurrent hires, one settlement, conservation PASS');
} finally {
 if(mf)await mf.dispose();
 fs.rmSync(scratch,{recursive:true,force:true});
}
