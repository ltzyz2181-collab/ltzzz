import test from 'node:test';
import assert from 'node:assert/strict';
import {Interface} from 'ethers';
import {observeSafe, SAFE} from '../lib/safe-observation.mjs';
const iface = new Interface(['function getOwners() view returns(address[])', 'function getThreshold() view returns(uint256)', 'function nonce() view returns(uint256)']);
const owners = ['0xb99C6751f443842F4987bb2017580405572Df905', '0xD834a769b31447daf5a042009CF06fAFCE7e2F51', '0x394103e5E846f709CE5126c203b1EF38D7cA70a6'];
function network(overrides = () => undefined) {
  const requests = [];
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body); requests.push({url, ...request});
    const custom = overrides(url, request);
    if (custom instanceof Error) throw custom;
    if (custom !== undefined) return Response.json(custom);
    let result;
    if (request.method === 'eth_chainId') result = '0x1';
    else if (request.method === 'eth_blockNumber') result = '0x100';
    else if (request.method === 'eth_getBlockByNumber') result = {number: '0x100', hash: '0x' + 'a'.repeat(64)};
    else if (request.method === 'eth_getCode') result = '0x1234';
    else if (request.method === 'eth_call') {
      assert.equal(request.params[0].to, SAFE);
      const method = iface.parseTransaction({data: request.params[0].data}).name;
      result = iface.encodeFunctionResult(method, [method === 'getOwners' ? owners : method === 'getThreshold' ? 3 : 7]);
    } else throw Error('mutation_or_unexpected_RPC:' + request.method);
    return Response.json({jsonrpc: '2.0', id: 1, result});
  };
  return {fetchImpl, requests};
}
test('two providers must agree on owners, threshold, nonce, bytecode and pinned block', async () => {
  const n = network(), r = await observeSafe(n);
  assert.equal(r.verified, true); assert.equal(r.threshold, 3); assert.equal(r.nonce, '7'); assert.deepEqual(r.owners, owners);
  assert.equal(r.transactions_submitted, 0); assert.equal(r.tx_hash, null);
  for (const q of n.requests.filter(q => ['eth_call', 'eth_getCode'].includes(q.method))) assert.equal(q.params.at(-1), '0x100');
  assert.ok(n.requests.every(q => ['eth_chainId', 'eth_blockNumber', 'eth_getBlockByNumber', 'eth_getCode', 'eth_call'].includes(q.method)));
});
test('one successful provider is insufficient and never fabricates live owners', async () => {
  const n = network(url => url.includes('drpc') ? Error('timeout') : undefined), r = await observeSafe(n);
  assert.equal(r.verified, false); assert.equal(r.owners, undefined); assert.match(r.observations[1].error, /timeout/);
});
test('wrong chain, absent contract, malformed header and RPC errors remain unverified', async () => {
  for (const [method, body] of [['eth_chainId', {result: '0x2105'}], ['eth_getCode', {result: '0x'}], ['eth_getBlockByNumber', {result: {hash: 'bad'}}], ['eth_call', {error: {message: 'unsupported'}}]]) {
    const r = await observeSafe(network((url, q) => q.method === method ? body : undefined));
    assert.equal(r.verified, false); assert.equal(r.transactions_submitted, 0);
  }
});
test('conflicting state or block hash does not count as dual-provider confirmation', async () => {
  for (const method of ['nonce', 'getThreshold', 'getOwners', 'block_hash']) {
    const r = await observeSafe(network((url, q) => {
      if (!url.includes('drpc')) return;
      if (method === 'block_hash' && q.method === 'eth_getBlockByNumber') return {result: {number: '0x100', hash: '0x' + 'b'.repeat(64)}};
      if (q.method === 'eth_call' && iface.parseTransaction({data: q.params[0].data}).name === method) return {result: iface.encodeFunctionResult(method, [method === 'getOwners' ? [...owners].reverse() : 2])};
    }));
    assert.equal(r.verified, false); assert.equal(r.owners, undefined);
  }
});
