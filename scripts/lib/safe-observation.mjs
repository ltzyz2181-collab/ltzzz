import {Interface, getAddress} from 'ethers';

export const SAFE = '0x76379a52a9e82c259E5Db417104C65C26f9C58a3';
export const RPCS = ['https://ethereum-rpc.publicnode.com', 'https://eth.drpc.org'];
const abi = new Interface([
  'function getOwners() view returns(address[])',
  'function getThreshold() view returns(uint256)',
  'function nonce() view returns(uint256)'
]);
const norm = value => getAddress(String(value).toLowerCase());

// Only fixed, public Ethereum reads. There is no wallet, key, signing or broadcast API.
export async function observeSafe({fetchImpl = fetch, now = () => new Date().toISOString()} = {}) {
  const observations = [];
  let block;
  for (const url of RPCS) {
    try {
      const rpc = async (method, params = []) => {
        const response = await fetchImpl(url, {method: 'POST', headers: {'Content-Type': 'application/json'},
          body: JSON.stringify({jsonrpc: '2.0', id: 1, method, params}), signal: AbortSignal.timeout(10000)});
        if (!response.ok) throw Error('rpc_http_' + response.status);
        const result = await response.json();
        if (result.error || result.result === undefined) throw Error('rpc_invalid_result');
        return result.result;
      };
      if (BigInt(await rpc('eth_chainId')) !== 1n) throw Error('chain_mismatch');
      const pinned = block || await rpc('eth_blockNumber');
      const [header, code, ...values] = await Promise.all([
        rpc('eth_getBlockByNumber', [pinned, false]), rpc('eth_getCode', [SAFE, pinned]),
        ...['getOwners', 'getThreshold', 'nonce'].map(method => rpc('eth_call', [{to: SAFE, data: abi.encodeFunctionData(method)}, pinned]))
      ]);
      if (!/^0x[0-9a-f]{64}$/i.test(header?.hash) || header.number !== pinned || !/^0x[0-9a-f]+$/i.test(code) || code === '0x') throw Error('invalid_block_or_contract');
      const owners = [...abi.decodeFunctionResult('getOwners', values[0])[0]].map(norm);
      const threshold = Number(abi.decodeFunctionResult('getThreshold', values[1])[0]);
      const nonce = abi.decodeFunctionResult('nonce', values[2])[0].toString();
      if (!owners.length || new Set(owners).size !== owners.length || threshold < 1 || threshold > owners.length) throw Error('invalid_safe_state');
      block = pinned;
      observations.push({rpc: url, block, block_hash: header.hash, code, owners, threshold, nonce});
    } catch (error) { observations.push({rpc: url, error: error.message}); }
  }
  const valid = observations.filter(item => !item.error);
  const same = valid.length === 2 && ['block', 'block_hash', 'code', 'owners', 'threshold', 'nonce'].every(key => JSON.stringify(valid[0][key]) === JSON.stringify(valid[1][key]));
  return {chain_id: 1, safe: SAFE, observed_at: now(), status: same ? 'dual_rpc_verified' : 'blocked_rpc_unverified',
    verified: same, observations, ...(same ? {block: valid[0].block, block_hash: valid[0].block_hash, owners: valid[0].owners, threshold: valid[0].threshold, nonce: valid[0].nonce} : {}),
    transactions_submitted: 0, tx_hash: null};
}
