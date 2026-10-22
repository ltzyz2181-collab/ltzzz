import {pathToFileURL, fileURLToPath} from 'node:url';
import fs from 'node:fs';import os from 'node:os';import path from 'node:path';import assert from 'node:assert/strict';
// Executes the official package, but all its fetch calls are fixtures. No real Key is used.
const [packageRoot, outputPath] = process.argv.slice(2);
if (!packageRoot || !outputPath) throw new Error('Usage: node inspect-official-mcp.mjs <installed-package-dir> <new-report-path>');
const root=path.resolve(packageRoot);
const metadata=JSON.parse(fs.readFileSync(path.join(root,'package.json'),'utf8'));
assert.equal(metadata.name,'rentahuman-mcp');assert.equal(metadata.version,'3.17.4');
const {Client}=await import(pathToFileURL(path.join(root,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js')));
const {StdioClientTransport}=await import(pathToFileURL(path.join(root,'node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js')));
const fixture=fileURLToPath(new URL('./fixtures/offline-fetch.mjs',import.meta.url));
let catalog;
const payload={agentType:'other',title:'Guangzhou public opening hours check',description:'Verify opening hours of three public shops and photograph storefronts from public areas; no faces, private premises or purchases. Preview only.',completionCriteria:'Three opening-hour notes and three public storefront photos without people or private information.',evidenceTypes:['text','photo'],estimatedHours:0.5,priceType:'fixed',price:3,currency:'USD',spotsAvailable:1,category:'labor-gigs',location:{city:'Guangzhou',country:'CN',isRemoteAllowed:false},dryRun:true,idempotencyKey:'RAH-S2A-20261022'};
const results=[];
async function probe(mode){
 const scratch=fs.mkdtempSync(path.join(os.tmpdir(),'rah-offline-review-'));
 const env={...process.env};for(const k of Object.keys(env))if(k.startsWith('RENTAHUMAN_')||k.startsWith('RAH_TEST_'))delete env[k];
 Object.assign(env,{RENTAHUMAN_IDENTITY_DIR:path.join(scratch,'identities'),RAH_TEST_REQUEST_LOG:path.join(scratch,'requests.jsonl'),RAH_TEST_MODE:mode});
 if(mode!=='no_key')env.RENTAHUMAN_API_KEY='ltzzz-nonfunctional-test-fixture';
 if(mode==='mock')env.RENTAHUMAN_MOCK_MODE='true';
 const transport=new StdioClientTransport({command:process.execPath,args:['--import',fixture,path.join(root,'dist/serve.js')],env,stderr:'pipe'});
 const client=new Client({name:'LTZZZ-offline-boundary-review',version:'1.0.0'});
 try{
  await client.connect(transport);
  const listed=await client.listTools();
  if(mode==='no_key') catalog={tool_count:listed.tools.length,selected_tools:listed.tools.filter(t=>['search_humans','create_bounty','get_wallet_balance','check_account_status'].includes(t.name)).map(t=>({name:t.name,required:t.inputSchema?.required??[],fields:Object.keys(t.inputSchema?.properties??{})}))};
  let body;
  if(mode==='no_key'){
   const raw=await client.callTool({name:'search_humans',arguments:{city:'Guangzhou',country:'CN',limit:5}});
   body=JSON.parse(raw.content.find(x=>x.type==='text').text);
   assert.equal(body.success,true);
  }else{
   const raw=await client.callTool({name:'create_bounty',arguments:payload});
   body=JSON.parse(raw.content.find(x=>x.type==='text').text);
   assert.equal(body.success,true);assert.equal(body.dryRun,true);
   assert.equal(body.serverValidation,mode==='mock'?'skipped':'unavailable');
  }
  // Startup registration is concurrent with requests. Wait at most one second for its intercepted fixture.
  if(mode!=='no_key')for(let n=0;n<20;n++){
   const log=fs.existsSync(env.RAH_TEST_REQUEST_LOG)?fs.readFileSync(env.RAH_TEST_REQUEST_LOG,'utf8'):'';
   if(log.includes('/api/keys/register-identity'))break;
   await new Promise(resolve=>setTimeout(resolve,50));
  }
  // Read only method/path logs, never request bodies or authentication headers.
  const requests=fs.existsSync(env.RAH_TEST_REQUEST_LOG)?fs.readFileSync(env.RAH_TEST_REQUEST_LOG,'utf8').trim().split('\n').filter(Boolean).map(JSON.parse):[];
  if(mode==='no_key')assert.equal(requests.some(r=>r.path.endsWith('register-identity')),false);
  else assert.equal(requests.some(r=>r.path==='/api/keys/register-identity'&&r.method==='POST'),true);
  results.push({case:mode,passed:true,tool_count:listed.tools.length,api_key_kind:mode==='no_key'?'absent':'nonfunctional_test_fixture',tool_success:body.success,server_validation:body.serverValidation??null,real_provider_validation:false,intercepted_requests:requests});
 }finally{await client.close();await transport.close();fs.rmSync(scratch,{recursive:true,force:true});}
}
for(const mode of ['no_key','offline','mock'])await probe(mode);
const r={at:new Date().toISOString(),package:'rentahuman-mcp',version:'3.17.4',test_kind:'actual_official_stdio_server_with_fetch_stubbed',real_credentials_used:false,real_network_requests:0,real_identity_bindings:0,real_bounties_created:0,paid:false,tx_hash:null,catalog,cases:results};
fs.mkdirSync(path.dirname(outputPath),{recursive:true});fs.writeFileSync(outputPath,JSON.stringify(r,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify({report:outputPath,cases_passed:r.cases.length,real_provider_validation:false,real_network_requests:0}));
