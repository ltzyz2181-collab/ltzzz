// LTZZZ Pay Phase1: 部署 ReputationRegistry 到 Base 主网
// 私钥：运行时从 ltzzz-secrets.md 匹配 agent EOA（不输出、不落盘）
import { readFileSync, writeFileSync } from 'fs';
import { ethers } from 'ethers';
import solc from 'solc';

const SECRETS = 'ltzzz-secrets.md';
const AGENT_EOA = '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const GUARDIANS = [
  '0xD834a769b31447daf5a042009CF06fAFCE7e2F51',
  '0x01B80610D88E96C9888a19e30D73Abbe5E6E7D4C',
  '0xb99C6751f443842F4987bb2017580405572Df905'
];
const RPC = 'https://mainnet.base.org';

async function main() {
  // 1) 提取 agent EOA 私钥（脚本内匹配，不输出）
  const secText = readFileSync(SECRETS, 'utf8');
  const cands = new Set();
  for (const m of secText.matchAll(/0x([0-9a-f]{64})/gi)) cands.add(m[1]);
  for (const m of secText.matchAll(/(?<![0-9a-f])([0-9a-f]{64})(?![0-9a-f])/gi)) if (!/^0+$/.test(m[1])) cands.add(m[1]);
  let deployer = null;
  for (const k of cands) {
    const w = new ethers.Wallet('0x' + k);
    if (w.address.toLowerCase() === AGENT_EOA.toLowerCase()) { deployer = w; break; }
  }
  if (!deployer) { console.log('ERROR: agent EOA key not found'); process.exit(1); }
  console.log('deployer matched OK');

  // 2) 编译
  const source = readFileSync('contracts/ReputationRegistry.sol', 'utf8');
  const input = {
    language: 'Solidity',
    sources: { 'ReputationRegistry.sol': { content: source } },
    settings: { optimizer: { enabled: true, runs: 200 }, outputSelection: { '*': { '*': ['abi', 'evm.bytecode.object'] } } }
  };
  const out = JSON.parse(solc.compile(JSON.stringify(input)));
  const errs = (out.errors || []).filter(e => e.severity === 'error');
  if (errs.length) { console.log('COMPILE_ERR:', errs[0].message.slice(0, 300)); process.exit(1); }
  const c = out.contracts['ReputationRegistry.sol']['ReputationRegistry'];
  console.log('compile OK, abi len:', c.abi.length, 'bytecode len:', c.evm.bytecode.object.length);

  // 3) 部署
  const provider = new ethers.JsonRpcProvider(RPC);
  const bal = await provider.getBalance(AGENT_EOA);
  console.log('agent balance ETH:', ethers.formatEther(bal));
  if (bal === 0n) { console.log('ERROR: no gas'); process.exit(1); }
  const wallet = deployer.connect(provider);
  const factory = new ethers.ContractFactory(c.abi, '0x' + c.evm.bytecode.object, wallet);
  const contract = await factory.deploy(GUARDIANS);
  const tx = contract.deploymentTransaction();
  console.log('TX:', tx.hash);
  await contract.waitForDeployment();
  const addr = await contract.getAddress();
  console.log('CONTRACT_ADDR:', addr);
  writeFileSync('deploy-result.txt', JSON.stringify({
    contract: addr, txHash: tx.hash, network: 'base-mainnet', guardians: GUARDIANS,
    deployedAt: new Date().toISOString()
  }, null, 2));
  console.log('saved deploy-result.txt');
}
main().catch(e => { console.log('FAIL:', e.message.slice(0, 300)); process.exit(1); });
