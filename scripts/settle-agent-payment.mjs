// LTZZZ Pay Phase 2 · 第一笔真实 1U 结算测试（agent 雇 AI → 结算 → 推理锚定）
// 私钥来源：ltzzz-secrets.md（agent）/ 私钥.doc（guardian），仅内存使用，不落盘、不输出、不入库。
// 网络：Base 主网（mainnet.base.org）· 与主钱包/Safe 隔离的测试级资金（1 USDC）。
import { ethers } from 'ethers';
import fs from 'fs';

const RPC = 'https://mainnet.base.org';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const REGISTRY = '0x44Ee56e629768eBf4f83123aFEBE7983c52a2660';
const RECIPIENT = '0xA315E37028c0AFe95C7da3D101f83f0111fC491A'; // exp_001 测试收款（DeepSeek 席结算托管）
const AMOUNT = 1n * 1000000n; // 1 USDC

const USDC_ABI = ['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
const REG_ABI = ['function anchorReasoning(bytes32 root, uint256 txCount)', 'function getReasoningRoot(uint256) view returns (bytes32,uint256)'];

function readAgentKey() {
  const raw = fs.readFileSync('ltzzz-secrets.md', 'utf8');
  const m = raw.match(/## LTZZZ 自托管钱包[\s\S]*?私钥\s*[:=：]?\s*(0x[0-9a-fA-F]{64})/);
  if (!m) throw new Error('agent pk not found');
  return m[1];
}
function readGuardianKey() {
  // 私钥.doc = WPS OLE2 → 双偏移 UTF-16 扫描，候选逐个用钱包验证匹配 guardian 地址
  const buf = fs.readFileSync('C:/Users/李天柱/Desktop/私钥.doc');
  const candidates = [];
  for (const start of [0, 1]) {
    let text = '';
    for (let i = start; i + 1 < buf.length; i += 2) {
      const c = buf.readUInt16LE(i);
      text += (c >= 32 && c < 127) ? String.fromCharCode(c) : '\n';
    }
    for (const m of text.matchAll(/0x[0-9a-fA-F]{60,}/g)) candidates.push(m[0].toLowerCase());
    for (const m of text.matchAll(/[0-9a-fA-F]{64}/g)) candidates.push(m[0].toLowerCase());
  }
  for (const pk of [...new Set(candidates)]) {
    try {
      const w = new ethers.Wallet(pk.startsWith('0x') ? pk : '0x' + pk);
      if (w.address.toLowerCase().startsWith('0xd834a769')) return pk; // guardian 0xD834a769...
    } catch { }
  }
  throw new Error('guardian pk not found in 私钥.doc');
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const agentKey = readAgentKey();
  const guardianKey = readGuardianKey();
  const agent = new ethers.Wallet(agentKey, provider);
  const guardian = new ethers.Wallet(guardianKey, provider);
  if (agent.address.toLowerCase() !== '0x21f502f29294c50d9c37a30dc038d8d95eb97fdc') throw new Error('agent address mismatch');
  if (guardian.address.toLowerCase() !== '0xd834a769b31447daf5a042009cf06fafce7e2f51') throw new Error('guardian address mismatch');

  const usdc = new ethers.Contract(USDC, USDC_ABI, provider);
  const reg = new ethers.Contract(REGISTRY, REG_ABI, provider);

  // 1) 推理链（proof-of-reasoning：为什么花这 1 USDC）
  const reasoning = [
    'LTZZZ Pay Phase2 结算单 #001',
    '雇主 = did:ltzzz:orchestrator（千问总控派单）',
    '雇员 = did:ltzzz:deepseek（DeepSeek 席）',
    '任务 = 文明研究条目4：中华传统文化对照（对照项目理念）',
    '验收 = 条目交付并写入 ltzzz-memory/文明研究-入档.md',
    '薪酬 = 1 USDC',
    '结算地址 = ' + RECIPIENT + '（DeepSeek 席托管测试地址）',
    '网络 = Base 主网',
    '依据 = protocol/LTZZZ-PAY.md 雇佣订单流程（任务即订单/结算即记账/声誉即信用）'
  ].join('\n');
  const reasoningHash = ethers.keccak256(ethers.toUtf8Bytes(reasoning));
  // 同时给 SHA-256 作为第二哈希（与 Phase1 锚定格式一致）
  const sha256 = ethers.sha256(ethers.toUtf8Bytes(reasoning));

  const balBefore = await usdc.balanceOf(agent.address);
  const recvBefore = await usdc.balanceOf(RECIPIENT);

  // 2) 结算支付：agent → 雇员收款地址 1 USDC
  console.log('step1: settle 1 USDC...');
  const tx1 = await agent.sendTransaction({
    to: USDC,
    data: usdc.interface.encodeFunctionData('transfer', [RECIPIENT, AMOUNT]),
  });
  console.log('tx1:', tx1.hash);
  const r1 = await tx1.wait();

  // 3) 锚定：guardian 签名把推理哈希上链
  console.log('step2: anchor reasoning (guardian)...');
  const tx2 = await guardian.sendTransaction({
    to: REGISTRY,
    data: reg.interface.encodeFunctionData('anchorReasoning', [reasoningHash, 1]),
  });
  console.log('tx2:', tx2.hash);
  const r2 = await tx2.wait();

  // 4) 链上验证
  const balAfter = await usdc.balanceOf(agent.address);
  const recvAfter = await usdc.balanceOf(RECIPIENT);
  const root0 = await reg.getReasoningRoot(0);

  const receipt = {
    experiment_id: 'exp_002_pay_settle',
    date: new Date().toISOString(),
    network: 'base-mainnet',
    agent_wallet: agent.address,
    guardian: guardian.address,
    recipient: RECIPIENT,
    amount_usdc: '1',
    reasoning_hash_sha256: sha256,
    reasoning_hash_keccak: reasoningHash,
    tx_settle: tx1.hash,
    tx_settle_status: r1.status,
    tx_anchor: tx2.hash,
    tx_anchor_status: r2.status,
    usdc_agent_before: ethers.formatUnits(balBefore, 6),
    usdc_agent_after: ethers.formatUnits(balAfter, 6),
    usdc_recipient_before: ethers.formatUnits(recvBefore, 6),
    usdc_recipient_after: ethers.formatUnits(recvAfter, 6),
    onchain_root_batch0: root0[0],
    onchain_anchored: root0[0].toLowerCase() === reasoningHash.toLowerCase(),
    reasoning_summary: '第一笔 AI 雇 AI 结算：DeepSeek 席文明研究条目4 交付，1 USDC 结算，推理哈希由 guardian 锚定上链'
  };
  fs.writeFileSync('p2-settle-receipt.json', JSON.stringify(receipt, null, 2));
  console.log('RECEIPT_WRITTEN');
  console.log('settle:', receipt.tx_settle, 'anchor:', receipt.tx_anchor, 'anchored:', receipt.onchain_anchored);
}

main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
