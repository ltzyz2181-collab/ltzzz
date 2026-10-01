// 真实锚定：guardian 签名调 ReputationRegistry.anchorReasoning(root, txCount)
// 私钥从私钥.doc 运行时匹配 guardian 地址（不输出、不落盘）
import { readFileSync, writeFileSync } from 'fs';
import { ethers } from 'ethers';

const GUARDIAN = '0xD834a769b31447daf5a042009CF06fAFCE7e2F51'; // Safe owner[1]
const AGENT_EOA = '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const CONTRACT = '0x44Ee56e629768eBf4f83123aFEBE7983c52a2660';
const ROOT = '0x63b8d50cac4273baeb6da0552fe8a6ca71e099f9e4a50575aee6bd1da8113225';
const RPC = 'https://mainnet.base.org';

const provider = new ethers.JsonRpcProvider(RPC);
const gBal = await provider.getBalance(GUARDIAN);
const aBal = await provider.getBalance(AGENT_EOA);
console.log('guardian ETH:', ethers.formatEther(gBal), '| agent ETH:', ethers.formatEther(aBal));

// 1) 若 guardian gas 不足，agent EOA 转 0.001 ETH（自己人补 gas，非外部地址）
if (gBal < 300000000000000n) { // < 0.0003 ETH
  const secText = readFileSync('ltzzz-secrets.md', 'utf8');
  const cands = new Set();
  for (const m of secText.matchAll(/0x([0-9a-f]{64})/gi)) cands.add(m[1]);
  for (const m of secText.matchAll(/(?<![0-9a-f])([0-9a-f]{64})(?![0-9a-f])/gi)) if (!/^0+$/.test(m[1])) cands.add(m[1]);
  let agent = null;
  for (const k of cands) { const w = new ethers.Wallet('0x' + k); if (w.address.toLowerCase() === AGENT_EOA.toLowerCase()) { agent = w; break; } }
  if (!agent) { console.log('ERROR: agent key not found'); process.exit(1); }
  const w = agent.connect(provider);
  const tx = await w.sendTransaction({ to: GUARDIAN, value: 1000000000000000n }); // 0.001 ETH
  console.log('gas topup tx:', tx.hash);
  await tx.wait();
  console.log('topup done');
}

// 2) guardian 私钥（从私钥.doc 匹配）签名锚定
const docText = Buffer.from(readFileSync('C:/Users/李天柱/Desktop/私钥.doc')).toString('utf16le').replace(/\0/g, '');
const docKeys = new Set();
for (const m of docText.matchAll(/0x([0-9a-f]{64})/gi)) docKeys.add(m[1]);
for (const m of docText.matchAll(/(?<![0-9a-f])([0-9a-f]{64})(?![0-9a-f])/gi)) if (!/^0+$/.test(m[1])) docKeys.add(m[1]);
let guardian = null;
for (const k of docKeys) { const w = new ethers.Wallet('0x' + k); if (w.address.toLowerCase() === GUARDIAN.toLowerCase()) { guardian = w; break; } }
if (!guardian) { console.log('ERROR: guardian key not found in 私钥.doc'); process.exit(1); }
console.log('guardian matched OK');

const IFS = ['function anchorReasoning(bytes32 root, uint256 txCount) external'];
const c = new ethers.Contract(CONTRACT, IFS, guardian.connect(provider));
const tx = await c.anchorReasoning(ROOT, 1);
console.log('ANCHOR_TX:', tx.hash);
const rec = await tx.wait();
console.log('status:', rec.status, 'gasUsed:', rec.gasUsed.toString());
const [root, txCount] = await new ethers.Contract(CONTRACT, ['function getReasoningRoot(uint256) view returns (bytes32,uint256)'], provider).getReasoningRoot(0);
console.log('chain batch[0] root:', root);
console.log('chain batch[0] txCount:', txCount.toString());
writeFileSync('anchor-result.txt', JSON.stringify({ root: ROOT, txHash: tx.hash, status: rec.status, chainRoot: root, chainTxCount: txCount.toString(), anchoredAt: new Date().toISOString() }, null, 2));
console.log('DONE');
