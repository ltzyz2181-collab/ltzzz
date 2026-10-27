// PR268: legacy financial IO is closed. No environment/request override or unlock.
export function denyLegacyFinancialExecution(exitId){throw Error('legacy_financial_exit_disabled:'+exitId);}
const blockedKeys=new Set(['__proto__','constructor','prototype','TREASURY_EXECUTOR_KEY','LTZZZ_WALLET_PRIVATE_KEY','FUNDING_EXECUTOR_KEY','OWNER_PK','DEPLOYER_PK','PRIVATE_KEY','AGENT_PRIVATE_KEY','GUARDIAN_PRIVATE_KEY']);
export function withoutFinancialCredentials(env={}){
 const safe=Object.create(null);
 // Skip names before reading properties: do not touch a secret getter, even briefly.
 for(const key of Object.keys(env))if(!blockedKeys.has(key))safe[key]=env[key];
 return safe;
}
const READ_RPC=new Set(['eth_chainId','net_version','web3_clientVersion','eth_blockNumber','eth_call','eth_getBalance','eth_getCode','eth_getLogs','eth_getTransactionReceipt','eth_getTransactionByHash','eth_getTransactionCount','eth_getBlockByNumber','eth_getBlockByHash','eth_estimateGas','eth_gasPrice','eth_maxPriorityFeePerGas','eth_feeHistory']);
export function assertReadOnlyRpc(method){if(!READ_RPC.has(method))denyLegacyFinancialExecution('rpc_'+String(method));}
export function assertReadOnlyRpcBody(body){
 let value;try{value=JSON.parse(typeof body==='string'?body:new TextDecoder().decode(body));}catch{throw Error('readonly_rpc_json_required');}
 const rows=Array.isArray(value)?value:[value];if(!rows.length)throw Error('readonly_rpc_method_required');
 for(const row of rows)assertReadOnlyRpc(row?.method);
}
export function assertReadOnlyExchange(method){if(method!=='GET')denyLegacyFinancialExecution('exchange_write');}
export async function legacyRelayReadFetch(url,options={}){
 if(new Headers(options.headers).has('PAYMENT-SIGNATURE'))denyLegacyFinancialExecution('x402_paid_relay');
 return fetch(url,options);
}
