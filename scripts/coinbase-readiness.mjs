import fs from 'node:fs';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {getAddress, verifyMessage, JsonRpcProvider, Contract} from 'ethers';
export const ETHEREUM_AAVE=getAddress('0x7fc66500c84a76ad7e9c93437bfc5ac33e2ddae9');

export async function probeEthereumAave(address, provider) {
  if((await provider.getNetwork()).chainId!==1n)throw Error('ethereum_network_required');
  if(await provider.getCode(ETHEREUM_AAVE)==='0x')throw Error('aave_token_code_missing');
  const token=new Contract(ETHEREUM_AAVE,['function symbol() view returns(string)','function decimals() view returns(uint8)','function balanceOf(address) view returns(uint256)'],provider);
  if(await token.symbol()!=='AAVE'||await token.decimals()!==18n)throw Error('aave_token_mismatch');
  return {chain_id:1,network:'ethereum',asset:'AAVE',token:ETHEREUM_AAVE,decimals:18,balance_raw:String(await token.balanceOf(address)),verified:true};
}

export async function coinbaseReadiness(env, makeClient, probe=probeEthereumAave) {
  const apiKeyId=env.CDP_API_KEY_ID||env.CDP_API_KEY_NAME||env.COINBASE_API_KEY_ID;
  const apiKeySecret=env.CDP_API_KEY_SECRET||env.COINBASE_API_KEY_SECRET;
  const walletSecret=env.CDP_WALLET_SECRET||env.COINBASE_WALLET_SECRET;
  const report={at:new Date().toISOString(),provider:'coinbase_cdp_server_wallet',status:'started',
    source_commit:env.GITHUB_SHA||null,run_id:env.GITHUB_RUN_ID||'local',
    credential_presence:{api_key_id:Boolean(apiKeyId),api_key_secret:Boolean(apiKeySecret),wallet_secret:Boolean(walletSecret)},
    model_calls:0,transactions_submitted:0,funds_moved:false,tx_hash:null,
    existing_base_treasury:'0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d',
    treasury_replaced:false,aave_deposit_ready:false};
  if(!apiKeyId||!apiKeySecret)return {...report,status:'blocked_configuration',missing:[...(!apiKeyId?['CDP_API_KEY_ID']:[]),...(!apiKeySecret?['CDP_API_KEY_SECRET']:[])]};
  try {
    const client=await makeClient({apiKeyId,apiKeySecret,walletSecret});
    await client.evm.listAccounts({pageSize:1});
    report.api_authenticated=true;
    if(!walletSecret)return {...report,status:'api_verified_wallet_secret_missing',missing:['CDP_WALLET_SECRET']};
    const name=env.CDP_EVM_ACCOUNT_NAME||'ltzzz-ops-v1';
    if(!/^[a-zA-Z0-9-]{1,36}$/.test(name))return {...report,status:'invalid_account_name'};
    const account=env.CDP_CREATE_ACCOUNT==='1'
      ?await client.evm.getOrCreateAccount({name})
      :await client.evm.getAccount({name});
    const address=getAddress(account.address);
    if(['0x21f502f29294c50d9c37a30dc038d8d95eb97fdc','0x1893a134aa6ea22e8c08518b559e1706f4da0ef7'].includes(address.toLowerCase()))return {...report,status:'blocked_legacy_address'};
    // Fixed proof of control; not a payment, transaction or arbitrary user message.
    const message=`LTZZZ CDP wallet control check | account=${name} | run=${report.run_id} | no spending authorization`;
    const signed=await client.evm.signMessage({address,message});
    if(getAddress(verifyMessage(message,signed.signature))!==address)return {...report,status:'control_proof_failed',address};
    const ready={...report,status:'wallet_control_verified',account_name:name,address,control_verified:true,
      control_message_sha256:createHash('sha256').update(message).digest('hex'),
      creation_allowed:env.CDP_CREATE_ACCOUNT==='1',
      role:'separate CDP execution account; existing WEP3 treasury unchanged',
      deposit_blocker:'Choose Ethereum/ERC20 on Binance and verify the AAVE contract before funding; Base USDC is a separate asset'};
    if(env.CDP_VERIFY_ETHEREUM_AAVE==='1'){
      try {
        ready.asset_probe=await probe(address,new JsonRpcProvider(env.LTZZZ_ETHEREUM_RPC||'https://ethereum-rpc.publicnode.com'));
        if(ready.asset_probe?.verified!==true||ready.asset_probe.chain_id!==1||ready.asset_probe.token?.toLowerCase()!==ETHEREUM_AAVE.toLowerCase())throw Error('invalid_asset_probe');
        ready.aave_deposit_ready=true;
        ready.deposit_blocker='User must explicitly select Ethereum/ERC20 on Binance; no withdrawal or swap is executed by this probe';
      }catch{ready.status='wallet_control_verified_asset_probe_failed';}
    }
    return ready;
  } catch(error) {
    // Never print raw SDK errors: they can contain request headers or credentials.
    const status=Number(error?.statusCode||error?.response?.status)||null;
    return {...report,status:'provider_operation_failed',provider_http_status:status,retryable:status===429||status===null||status>=500};
  }
}

if(process.argv[1]&&pathToFileURL(process.argv[1]).href===import.meta.url){
  const report=await coinbaseReadiness(process.env,async options=>{
    const {CdpClient}=await import('@coinbase/cdp-sdk');return new CdpClient(options);
  });
  fs.mkdirSync('knowledge/results/wallet',{recursive:true});
  fs.writeFileSync(`knowledge/results/wallet/coinbase-${report.run_id}-attempt-${process.env.GITHUB_RUN_ATTEMPT||'1'}.json`,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,address:report.address||null,missing:report.missing||[],transactions_submitted:0}));
  if(report.status!=='wallet_control_verified')process.exitCode=1;
}
