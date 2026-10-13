// LTZZZ 旧 Base Vault 迁移脚本（2026-10-13）
// 执行通道：GitHub Actions secret LTZZZ_WALLET_PRIVATE_KEY（唯一授权旧 guardian 签名通道）。
// 全程禁止从公开仓库/历史读取泄露私钥；禁止把资金重新投入旧 Vault。
// 顺序：安全门 -> withdrawUSDC 全量赎回 -> skim 回旧 guardian -> guardian 全部 USDC 转新金库 -> 0.002 ETH gas 转新金库。
// 每步 status=1 + 3 确认后才进行下一步；写出知识回执（不含任何密钥）。
import fs from 'node:fs';
import {Contract,JsonRpcProvider,Wallet,NonceManager,formatUnits,formatEther} from 'ethers';

const dir='knowledge/results/migrations';
const file=`${dir}/treasury-migration-${process.env.GITHUB_RUN_ID||'local'}.json`;
const OLD='0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';        // 旧 guardian（泄露风险，迁移后弃用）
const VAULT='0x872C322e886ccd3f2Bb63e0611a6d8c620D859Ab';      // 旧 Vault
const TREASURY='0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d';    // 新执行金库（Worker 受限接口签名）
const USDC='0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const AUSDC='0x4e65fE4DbA92790696d040ac24Aa414708F5c0AB';
const POOL='0xA238Dd80C259a72e81d7e4664a9801593F98d1c5';
const ETH_TO_TREASURY=2000000000000000n; // 0.002 Base ETH，作新金库 gas
const MAX_UINT=(1n<<256n)-1n;

const record={
  at:new Date().toISOString(),chainId:8453,
  execution_id:process.env.GITHUB_RUN_ID||'local',
  old_guardian:OLD,vault:VAULT,treasury:TREASURY,
  hypothesis:'Migrate legacy Base Aave position and guardian operating USDC to new treasury; never re-invest into old Vault',
  exit_plan:'withdraw all aUSDC -> skim to guardian -> transfer all guardian USDC to treasury -> 0.002 ETH gas to treasury',
  transactions:[],status:'started'
};
function save(){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(file,JSON.stringify(record,null,2));}
function txNote(step,name,tx,receipt){record.transactions.push({step,name,tx_hash:tx.hash,status:'confirmed',block:receipt.blockNumber,gas_used:String(receipt.gasUsed)});save();}

let phase='init';
try{
  const p=new JsonRpcProvider(process.env.LTZZZ_BASE_RPC||'https://mainnet.base.org');
  if((await p.getNetwork()).chainId!==8453n)throw Error('chain');
  const token=new Contract(USDC,['function balanceOf(address) view returns(uint256)','function transfer(address,uint256) returns(bool)'],p);
  const a=new Contract(AUSDC,['function balanceOf(address) view returns(uint256)'],p);
  const vault=new Contract(VAULT,['function guardian() view returns(address)','function usdc() view returns(address)','function aavePool() view returns(address)','function aToken() view returns(address)','function paused() view returns(bool)','function humanVetoed() view returns(bool)','function getExposure() view returns(uint256)','function withdrawUSDC(uint256)','function skim()'],p);

  const block=await p.getBlockNumber();
  const snap=async()=>({
    block:await p.getBlockNumber(),
    vault_ausdc:formatUnits(await a.balanceOf(VAULT),6),
    vault_usdc:formatUnits(await token.balanceOf(VAULT),6),
    exposure_usdc:formatUnits(await vault.getExposure(),6),
    guardian_usdc:formatUnits(await token.balanceOf(OLD),6),
    guardian_eth:formatEther(await p.getBalance(OLD)),
    treasury_usdc:formatUnits(await token.balanceOf(TREASURY),6),
    treasury_ausdc:formatUnits(await a.balanceOf(TREASURY),6),
    treasury_eth:formatEther(await p.getBalance(TREASURY))
  });
  const before=await snap();
  record.snapshot_before=before;save();

  // ── 安全门（不可逆资金动作：全部通过才继续）──
  const [guardian,paused,vetoed,usdcCfg,poolCfg,aCfg] = await Promise.all([vault.guardian(),vault.paused(),vault.humanVetoed(),vault.usdc(),vault.aavePool(),vault.aToken()]);
  if(guardian.toLowerCase()!==OLD.toLowerCase())throw Error('vault_guardian_mismatch');
  if(usdcCfg.toLowerCase()!==USDC.toLowerCase()||poolCfg.toLowerCase()!==POOL.toLowerCase()||aCfg.toLowerCase()!==AUSDC.toLowerCase())throw Error('vault_identity_mismatch');
  if(paused)throw Error('gate_paused');
  if(vetoed)throw Error('gate_human_vetoed');

  const exposure=await vault.getExposure();
  const vaultA=await a.balanceOf(VAULT),vaultU=await token.balanceOf(VAULT);
  if(exposure===0n&&vaultA===0n&&vaultU===0n){
    const treasuryU=await token.balanceOf(TREASURY);
    record.status=treasuryU>0n?'already_migrated':'no_position_to_migrate';
    record.note='No legacy position found; nothing sent. Treasury USDC='+formatUnits(treasuryU,6);
    save();console.log(JSON.stringify(record));process.exit(0);
  }

  // 签名者校验（GitHub Actions secret；绝不从仓库读取密钥）
  const key=process.env.LTZZZ_WALLET_PRIVATE_KEY;
  if(!key){record.status='blocked_missing_wallet_secret';save();process.exit(0);}
  const signer=new Wallet(key,p);
  if(signer.address.toLowerCase()!==OLD.toLowerCase())throw Error('signer_address_mismatch');
  const managed=new NonceManager(signer);
  const writeVault=vault.connect(managed),writeToken=token.connect(managed);

  async function send(step,name,fn){
    phase=step;
    const tx=await fn();
    record.transactions.push({step,name,tx_hash:tx.hash,status:'submitted'});save();
    const receipt=await tx.wait(3);
    if(!receipt||receipt.status!==1)throw Error('tx_reverted_'+step);
    txNote(step,name,tx,receipt);
  }

  // t1: 全量赎回 aUSDC。优先 max-uint（Aave V3 语义=全部含利息）；estimateGas 模拟若失败则退回 withdrawUSDC(0)（EXP-006 E1 已验证路径）。
  phase='t1_withdraw';
  const wi=vault.interface.encodeFunctionData('withdrawUSDC',[MAX_UINT]);
  let useMax=true;
  try{await p.estimateGas({from:OLD,to:VAULT,data:wi});}catch{useMax=false;}
  const w0=await token.balanceOf(VAULT);
  await send('t1_withdraw','withdrawUSDC('+(useMax?'max':'0')+')',()=>writeVault.withdrawUSDC(useMax?MAX_UINT:0n));
  const afterWithdraw={vault_usdc:formatUnits(await token.balanceOf(VAULT),6),exposure:formatUnits(await vault.getExposure(),6),vault_ausdc:formatUnits(await a.balanceOf(VAULT),6)};
  record.step_t1={method:useMax?'max_uint':'zero_exposure',vault_usdc_before:formatUnits(w0,6),after:afterWithdraw};save();

  // t2: skim 回旧 guardian
  await send('t2_skim','skim()',()=>writeVault.skim());
  record.step_t2={guardian_usdc:formatUnits(await token.balanceOf(OLD),6),vault_usdc:formatUnits(await token.balanceOf(VAULT),6)};save();

  // t3: guardian 全部 USDC 转新金库（重新实读余额，绝不使用预估）
  const guardianU=await token.balanceOf(OLD);
  if(guardianU===0n){record.status='blocked_no_guardian_usdc';save();throw Error('guardian_usdc_zero');}
  await send('t3_usdc_to_treasury','USDC.transfer(TREASURY,'+formatUnits(guardianU,6)+')',()=>writeToken.transfer(TREASURY,guardianU));
  record.step_t3={sent_usdc:formatUnits(guardianU,6),guardian_remaining_usdc:formatUnits(await token.balanceOf(OLD),6)};save();

  // t4: 0.002 ETH gas 转新金库（先核 guardian ETH 覆盖 0.002 + 交易费缓冲）
  const guardianEth=await p.getBalance(OLD);
  if(guardianEth<ETH_TO_TREASURY+100000000000000n)throw Error('guardian_eth_insufficient_for_gas_transfer');
  await send('t4_eth_to_treasury','0.002 ETH gas transfer',()=>managed.sendTransaction({to:TREASURY,value:ETH_TO_TREASURY}));
  record.step_t4={sent_eth:'0.002',guardian_remaining_eth:formatEther(await p.getBalance(OLD))};save();

  // ── 终核 ──
  const after=await snap();
  record.snapshot_after=after;
  const usdcDelta=Number(after.treasury_usdc)-Number(before.treasury_usdc);
  const ethDelta=Number(after.treasury_eth)-Number(before.treasury_eth);
  record.final_check={
    treasury_usdc_delta:usdcDelta.toFixed(6),
    treasury_eth_delta:ethDelta.toFixed(6),
    expected_usdc_delta:(Number(before.guardian_usdc)+Number(before.vault_ausdc)).toFixed(6),
    vault_ausdc_dust:after.vault_ausdc,
    vault_usdc_dust:after.vault_usdc,
    guardian_usdc_dust:after.guardian_usdc,
    exposure_dust:after.exposure_usdc
  };
  const ok=Math.abs(usdcDelta-(Number(before.guardian_usdc)+Number(before.vault_ausdc)))<0.01
    && Math.abs(ethDelta-0.002)<0.0001
    && Number(after.vault_ausdc)<0.001
    && Number(after.vault_usdc)<0.001
    && Number(after.exposure_usdc)<0.001;
  record.status=ok?'verified_migrated':'balance_mismatch';
  record.tx_hashes=Object.fromEntries(record.transactions.map(t=>[t.step,t.tx_hash]));
  save();
  console.log(JSON.stringify(record,null,2));
}catch(e){
  record.status='blocked_or_failed';record.phase=phase;
  record.note='See confirmed/submitted transaction evidence; no raw key-bearing RPC error printed.';
  record.error=(e.shortMessage||e.message||'').slice(0,160);
  save();console.error(JSON.stringify(record,null,2));process.exitCode=1;
}
