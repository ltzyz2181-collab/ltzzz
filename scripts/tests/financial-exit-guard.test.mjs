import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import vm from 'node:vm';
import {denyLegacyFinancialExecution,withoutFinancialCredentials,assertReadOnlyRpc,assertReadOnlyRpcBody,assertReadOnlyExchange,legacyRelayReadFetch} from '../../lib/financial-exit-guard.js';
import {scanFinancialSource,inspectFinancialSources,checkFinancialInventory} from '../lib/financial-exit-inventory.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const retired=['scripts/settle-agent-payment.mjs','scripts/anchor-onchain.mjs','scripts/settle-order-j1.mjs','scripts/deploy-registry.mjs','scripts/aave-owner-funding.mjs','scripts/treasury-migration.mjs','invest-channel/scripts/deploy-vault.mjs','invest-channel/adapters/AaveAdapter.mjs'];
test('R1 no env or argument can enable retired egress',()=>{for(const id of ['new',...retired])assert.throws(()=>denyLegacyFinancialExecution(id),/legacy_financial_exit_disabled/);});
for(const p of retired)test('R1 retired CLI fails before credential discovery or network: '+p,()=>{const r=spawnSync(process.execPath,[path.join(root,p)],{cwd:root,env:{PATH:process.env.PATH,FUNDING_EXECUTE:'1'},encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/legacy_financial_exit_disabled/);assert.doesNotMatch(r.stderr,/ENOENT|MODULE_NOT_FOUND|pk not found/);});
test('R1 private-key getter is never read, including context reinjection',()=>{const env={LAB_PIN:'fixture',X402_RECEIVE_ADDRESS:'public',TREASURY_EXECUTOR_KEY:'not-a-key'};Object.defineProperty(env,'FUNDING_EXECUTOR_KEY',{enumerable:true,get(){throw Error('must_not_read');}});const safe=withoutFinancialCredentials(env);assert.deepEqual({...safe},{LAB_PIN:'fixture',X402_RECEIVE_ADDRESS:'public'});assert.equal('TREASURY_EXECUTOR_KEY' in withoutFinancialCredentials({...safe,TREASURY_EXECUTOR_KEY:'injected'}),false);});
for(const method of ['eth_sendRawTransaction','eth_sendTransaction','eth_signTypedData_v4','personal_sendTransaction','wallet_sendCalls','unknown'])test('R1 outgoing or unknown RPC is rejected '+method,()=>assert.throws(()=>assertReadOnlyRpc(method),/legacy_financial_exit_disabled/));
test('R1 readonly RPC query and batch remain available; hidden batch send rejected',()=>{assert.doesNotThrow(()=>assertReadOnlyRpcBody(JSON.stringify([{method:'eth_getBalance'},{method:'eth_call'}])));assert.throws(()=>assertReadOnlyRpcBody(JSON.stringify([{method:'eth_getBalance'},{method:'eth_sendRawTransaction'}])));assert.throws(()=>assertReadOnlyRpcBody('bad'));});
test('R1 exchange transfer/order POST cannot reach a credentialed client',()=>{assert.doesNotThrow(()=>assertReadOnlyExchange('GET'));for(const m of ['POST','DELETE','PUT'])assert.throws(()=>assertReadOnlyExchange(m));});
test('R1 default paid relay stops before fetch',async()=>{let calls=0;const old=globalThis.fetch;try{globalThis.fetch=async()=>{calls++;throw Error('must_not_network');};await assert.rejects(legacyRelayReadFetch('https://example.invalid',{headers:{'PAYMENT-SIGNATURE':'synthetic'}}),/legacy_financial_exit_disabled/);assert.equal(calls,0);}finally{globalThis.fetch=old;}});
for(const p of ['scripts/execute-agent-payment.mjs','scripts/run-agent-spending.mjs'])test('R4 old live caller exits before parsing/ledger/credential access '+p,()=>{const r=spawnSync(process.execPath,[path.join(root,p)],{env:{PATH:process.env.PATH,LTZZZ_WALLET_DRY_RUN:'false'},encoding:'utf8'});assert.notEqual(r.status,0);assert.match(r.stderr,/legacy_financial_exit_disabled/);});
test('R4 scheduled wallet path is simulation-only with no wallet private-key Secret',()=>{const w=fs.readFileSync(path.join(root,'.github/workflows/ltzzz-wallet-ops.yml'),'utf8');assert.doesNotMatch(w,/secrets\.LTZZZ_WALLET_PRIVATE_KEY|vars\.LTZZZ_WALLET_DRY_RUN/);assert.match(w,/LTZZZ_WALLET_DRY_RUN: 'true'/);assert.match(w,/node scripts\/run-agent-spending\.mjs/);});
test('R1 direct signer-construction export is not a bypass',async()=>{const {localWallet}=await import('../wallet-lib.mjs');await assert.rejects(localWallet({}),/wallet_signer_runtime_capability_required/);await assert.rejects(localWallet({privateKey:'not-a-key'},{}),/wallet_signer_runtime_capability_required/);});
test('R1 every financial source is registered with reviewed bytes and guard/scope evidence',()=>{const inventory=JSON.parse(fs.readFileSync(path.join(root,'config/financial-exit-inventory.json'),'utf8'));const r=checkFinancialInventory({sources:inspectFinancialSources(root),inventory,read:p=>fs.readFileSync(path.join(root,p),'utf8')});assert.equal(r.passed,true,JSON.stringify(r.errors));});
for(const code of ['await w.sendTransaction(x)','new ethers.Wallet(x)','await token.transfer(to,n)','await x.writeContract(y)','await provider.request({method:"eth_sendRawTransaction"})'])test('R1 new unregistered primitive fails CI '+code,()=>{const r=checkFinancialInventory({sources:[{path:'scripts/new-exit.mjs',sha256:'0'.repeat(64),matches:scanFinancialSource(code)}],inventory:{schema:'ltzzz.financial-exits.v1',exits:[]},read:()=>''});assert.equal(r.passed,false);assert.ok(r.errors.includes('unregistered_financial_primitive:scripts/new-exit.mjs'));});
test('R1 allowlisted source edit or removal of its guard cannot pass silently',()=>{const row={path:'known.mjs',sha256:'a',disposition:'readonly_IO_guard',guards:[{path:'guard.mjs',required:'DENY'}]};const r=checkFinancialInventory({sources:[{path:'known.mjs',sha256:'b',matches:[]}],inventory:{schema:'ltzzz.financial-exits.v1',exits:[row]},read:()=>''});assert.ok(r.errors.some(x=>x.startsWith('registered_source_changed')));assert.ok(r.errors.some(x=>x.startsWith('guard_missing')));});

test('R1 forwarded context cannot inject keys through __proto__',()=>{const e=JSON.parse('{"__proto__":{"TREASURY_EXECUTOR_KEY":"synthetic"}}');assert.equal(withoutFinancialCredentials(e).TREASURY_EXECUTOR_KEY,undefined);});
test('R1 executable source cannot hide behind a secret-like filename exclusion',()=>{const r=checkFinancialInventory({sources:[{path:'secrets.mjs',sensitive_name_not_read:true,matches:[]}],inventory:{schema:'ltzzz.financial-exits.v1',exits:[]},read:()=>{throw Error('must_not_read');}});assert.equal(r.passed,false);});
test('R1 real exchange client rejects before reading credential getters or fetching',async()=>{const {capitalClient}=await import('../lib/okx-capital-funding.mjs');let touched=0;const c={};for(const key of ['key','secret','pass'])Object.defineProperty(c,key,{get(){touched++;throw Error('credential_read');}});const client=capitalClient(c,{fetcher:async()=>{throw Error('must_not_fetch');}});await assert.rejects(client('POST','/api/v5/asset/transfer',{}),/legacy_financial_exit_disabled/);assert.equal(touched,0);});


const walletLabHtml = fs.readFileSync(path.join(root, 'wallet-lab.html'), 'utf8');
const walletLabScript = [...walletLabHtml.matchAll(/<script>([\s\S]*?)<\/script>/g)].at(-1)?.[1];
assert.ok(walletLabScript, 'wallet-lab inline transaction script must exist');

function mountWalletLab(chainResults = []) {
  const ids = ['donateAddr','donateLock','donateNet','settleAddr','settleNet','settleAsset','connect','status','send','to','amount','tx','donateAsset','donateAmount','donate','donateOut','sim','simAmount','simOut','refreshSettle','settleOut','settleEth','settleUsdc','settleTx'];
  const elements = Object.fromEntries(ids.map(id => [id, {textContent:'', value:'', onclick:null}]));
  elements.to.value = '0x' + '2'.repeat(40);
  elements.amount.value = '0.001';
  elements.donateAmount.value = '0.01';
  elements.donateAsset.value = 'USDC';
  const calls = [];
  const queue = [...chainResults];
  const provider = {request: async ({method, params}) => {
    calls.push({method, params});
    if (method === 'eth_requestAccounts') return ['0x' + '1'.repeat(40)];
    if (method === 'eth_chainId') {
      const value = queue.length ? queue.shift() : '0x1';
      if (value instanceof Error) throw value;
      return value;
    }
    if (method === 'eth_getBalance' || method === 'eth_call') return '0x0';
    if (method === 'eth_sendTransaction') return '0x' + 'a'.repeat(64);
    throw new Error('unexpected_provider_method:' + method);
  }};
  const window = {ethereum:provider, LTZZZ_SETTLEMENT_WALLET:{
    address:'0x' + 'b'.repeat(40), network:'Ethereum Mainnet', chainId:1, assets:['ETH','USDC']
  }};
  const stored = new Map();
  const localStorage = {
    getItem:key => stored.has(key) ? stored.get(key) : null,
    setItem:(key,value) => stored.set(key, String(value)),
  };
  const document = {getElementById:id => {
    assert.ok(elements[id], 'unexpected wallet-lab element: ' + id);
    return elements[id];
  }};
  const context = vm.createContext({window, document, localStorage});
  new vm.Script(walletLabScript, {filename:'wallet-lab.inline.js'}).runInContext(context);
  return {elements, calls, queue, stored};
}

test('wallet lab refuses all chain reads when the configured settlement network does not match', async () => {
  const h = mountWalletLab(['0x2105']);
  await h.elements.connect.onclick();
  assert.match(h.elements.status.textContent, /Ethereum Mainnet/);
  assert.equal(h.calls.some(x => ['eth_getBalance','eth_call','eth_sendTransaction'].includes(x.method)), false);
});

test('wallet lab rechecks chain immediately before arbitrary ETH send', async () => {
  const h = mountWalletLab(['0x1','0x2105']);
  await h.elements.send.onclick();
  assert.equal(h.calls.filter(x => x.method === 'eth_sendTransaction').length, 0);
  assert.match(h.elements.tx.textContent, /未发起链上操作/);
});

test('wallet lab rechecks chain immediately before USDC donation', async () => {
  const h = mountWalletLab(['0x1','0x2105']);
  await h.elements.donate.onclick();
  assert.equal(h.calls.filter(x => x.method === 'eth_sendTransaction').length, 0);
  assert.match(h.elements.donateOut.textContent, /未发起链上操作/);
});

test('wallet lab blocks settlement balance reads after the wallet changes networks', async () => {
  const h = mountWalletLab(['0x1']);
  await h.elements.connect.onclick();
  const before = h.calls.filter(x => x.method === 'eth_getBalance' || x.method === 'eth_call').length;
  h.queue.push('0x2105');
  await h.elements.refreshSettle.onclick();
  const after = h.calls.filter(x => x.method === 'eth_getBalance' || x.method === 'eth_call').length;
  assert.equal(after, before);
  assert.match(h.elements.settleOut.textContent, /未发起链上操作/);
});

test('wallet lab allows a mock transaction only when the configured chain id matches', async () => {
  const h = mountWalletLab(['0x1','0x1']);
  await h.elements.send.onclick();
  assert.equal(h.calls.filter(x => x.method === 'eth_sendTransaction').length, 1);
  assert.match(h.elements.tx.textContent, /交易已提交/);
});

test('wallet lab fails closed when chain id cannot be read', async () => {
  const h = mountWalletLab([new Error('provider_unavailable')]);
  await h.elements.connect.onclick();
  assert.match(h.elements.status.textContent, /无法确认当前钱包网络/);
  assert.equal(h.calls.some(x => ['eth_getBalance','eth_call','eth_sendTransaction'].includes(x.method)), false);
});
