// LTZZZ Pay · J1 执行单（ORDER-20260930-001）结算闭环
// ① 结算 1 USDC（已由 exp_002 完成，tx 0x5da61452...）② 记账修正 ③ 订单 receipt 锚定(txCount=2)
// ④ 声誉回写（另脚本/手动）⑤ 回账：agent 注 gas → 0xA315 回 1 USDC → agent
// 私钥仅内存：agent/0xA315 在 ltzzz-secrets.md，guardian 在私钥.doc。零落盘零输出。
import { ethers } from 'ethers';
import fs from 'fs';

const RPC = 'https://mainnet.base.org';
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';
const REGISTRY = '0x44Ee56e629768eBf4f83123aFEBE7983c52a2660';
const AGENT = '0x21F502f29294c50d9C37A30dc038D8D95eB97fdc';
const RECV = '0xA315E37028c0AFe95C7da3D101f83f0111fC491A';
const USDC_ABI = ['function transfer(address,uint256) returns (bool)', 'function balanceOf(address) view returns (uint256)'];
const REG_ABI = ['function anchorReasoning(bytes32 root, uint256 txCount)', 'function anchoredRoots(bytes32) view returns (bool)'];

function findKeyInSecrets(sectionRe, re) {
  const raw = fs.readFileSync('ltzzz-secrets.md', 'utf8');
  const m = raw.match(sectionRe);
  if (!m) throw new Error('section not found: ' + sectionRe);
  const k = m[0].match(re);
  if (!k) throw new Error('key not found in section');
  return k[1];
}
function readGuardianKey() {
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
    try { const w = new ethers.Wallet(pk.startsWith('0x') ? pk : '0x' + pk); if (w.address.toLowerCase().startsWith('0xd834a769')) return pk; } catch { }
  }
  throw new Error('guardian pk not found');
}

async function main() {
  const provider = new ethers.JsonRpcProvider(RPC);
  const agent = new ethers.Wallet(findKeyInSecrets(/## LTZZZ 自托管钱包[\s\S]*?私钥\s*[:=：]?\s*(0x[0-9a-fA-F]{64})/, /(0x[0-9a-fA-F]{64})/), provider);
  const recv = new ethers.Wallet(findKeyInSecrets(/## 测试收款地址[\s\S]*?私钥\s*[:=：]?\s*(0x[0-9a-fA-F]{64})/, /(0x[0-9a-fA-F]{64})/), provider);
  const guardian = new ethers.Wallet(readGuardianKey(), provider);
  if (agent.address.toLowerCase() !== AGENT.toLowerCase()) throw new Error('agent mismatch');
  if (recv.address.toLowerCase() !== RECV.toLowerCase()) throw new Error('recv mismatch');
  if (guardian.address.toLowerCase() !== '0xd834a769b31447daf5a042009cf06fafce7e2f51') throw new Error('guardian mismatch');

  const usdc = new ethers.Contract(USDC, USDC_ABI, provider);
  const reg = new ethers.Contract(REGISTRY, REG_ABI, provider);

  // 订单专属 receipt 推理（ORDER-20260930-001）
  const receiptText = [
    'ORDER-20260930-001 结算 receipt',
    '雇主 = did:ltzzz:qianwen（总控，资金=agent 钱包运营池）',
    '受雇方 = did:ltzzz:kimi-global（国际版 Kimi）',
    '任务 = 账本 RPC 实测审计（4 笔链上交易状态+块号复测，发现汇总落后与手写块号两处缺陷）',
    '验收 = 总控独立核原文确认属实（ops/总控审计-20260930深夜-2）+ 双源可复现',
    '薪酬 = 1.00 USDC（Base 主网）',
    '收款 = 0xA315E37028c0AFe95C7da3D101f83f0111fC491A（登记测试回收地址，系统内循环）',
    '回账 = 结算后 1U 由 0xA315 转回 agent（可回收规则）',
    'ROI = success×1.5：kimi reputation 100→150',
    '网络 = Base 主网 · txCount=2（结算+回账两笔）'
  ].join('\n');
  const receiptHash = ethers.keccak256(ethers.toUtf8Bytes(receiptText));

  // 1) agent 注 gas 给 0xA315（回账用）
  console.log('step1: gas topup 0.0002 ETH -> 0xA315 ...');
  const txTopup = await agent.sendTransaction({ to: RECV, value: ethers.parseEther('0.0002') });
  console.log('topup tx:', txTopup.hash);
  await txTopup.wait();

  // 2) 回账：0xA315 -> agent 1 USDC
  console.log('step2: return 1 USDC 0xA315 -> agent ...');
  const txReturn = await recv.sendTransaction({ to: USDC, data: usdc.interface.encodeFunctionData('transfer', [AGENT, 1000000n]) });
  console.log('return tx:', txReturn.hash);
  const rReturn = await txReturn.wait();

  // 3) 订单 receipt 锚定（guardian，txCount=2）
  console.log('step3: anchor ORDER receipt (guardian, txCount=2) ...');
  const txAnchor = await guardian.sendTransaction({ to: REGISTRY, data: reg.interface.encodeFunctionData('anchorReasoning', [receiptHash, 2]) });
  console.log('anchor tx:', txAnchor.hash);
  const rAnchor = await txAnchor.wait();

  // 4) 验证
  const usdcAgent = await usdc.balanceOf(AGENT);
  const usdcRecv = await usdc.balanceOf(RECV);
  const anchored = await reg.anchoredRoots(receiptHash);

  const out = {
    order: 'ORDER-20260930-001',
    date: new Date().toISOString(),
    network: 'base-mainnet',
    receipt_hash: receiptHash,
    anchored: anchored,
    tx_gas_topup: txTopup.hash,
    tx_settle_return: txReturn.hash,
    tx_settle_return_status: rReturn.status,
    tx_anchor: txAnchor.hash,
    tx_anchor_status: rAnchor.status,
    usdc_agent: ethers.formatUnits(usdcAgent, 6),
    usdc_recv: ethers.formatUnits(usdcRecv, 6),
    note: '结算支出 1 USDC 已于 exp_002（tx 0x5da61452...）完成；本单完成注资+回账+订单 receipt 锚定'
  };
  fs.writeFileSync('j1-order-settle-receipt.json', JSON.stringify(out, null, 2));
  console.log('RECEIPT_WRITTEN');
  console.log('topup:', txTopup.hash);
  console.log('return:', txReturn.hash, 'status', rReturn.status);
  console.log('anchor:', txAnchor.hash, 'status', rAnchor.status, 'anchored:', anchored);
}

main().catch(e => { console.error('FAIL', e.message); process.exit(1); });
