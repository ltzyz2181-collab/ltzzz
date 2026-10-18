/**
 * okx-mobile-signing-relay.mjs — OKX 手机钱包签名接力（#126 第2项交付）
 *
 * 为子钱包 0xbc24…253e 的剩余 Aave 预算 4.496788 USDC 生成可由 owner 在
 * OKX 手机钱包签名的待签交易；owner 签完回传 tx_hash 后做链上复核出真实回执。
 *
 * 硬边界（#126 明令）：
 *  - 本脚本永不索取/输出/接触私钥；签名只能发生在 owner 的 OKX 手机 App 内
 *  - 精确金额、账户/链/接收人三项校验，任一不符即拒绝
 *  - 不迁移已投入本金、不重复投入 20、不新增付费模型定时
 *  - 没有实际签名控制时如实列阻塞，不谎报完成
 *
 * 用法：
 *  node scripts/okx-mobile-signing-relay.mjs build [--amount X] [--chain-id N]
 *       [--asset A] [--recipient 0x..] [--on-behalf 0x..]
 *  node scripts/okx-mobile-signing-relay.mjs verify --tx-hash 0x.. [--amount X]
 */
import fs from 'node:fs';

const CFG = {
  childWallet: '0xbc24b9a2d0c61705602257565d8c0064effe253e',
  chainId: 8453,
  usdc: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
  aavePool: '0xA238Dd80C259a72e81d7e4664a9801593F98d1c5',
  remaining: '4.496788',
  treasuryConfirmed: '15.503212',
  round: 'OWNER-FUNDED-20261017-01',
};
const RPCS = ['https://base-rpc.publicnode.com', 'https://mainnet.base.org', 'https://base.drpc.org'];

function parseArgs(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const nxt = argv[i + 1];
    if (nxt === undefined || nxt.startsWith('--')) { o[key] = true; }
    else { o[key] = nxt; i++; }
  }
  return o;
}
const args = parseArgs(process.argv.slice(2));

// 硬拒私钥输入：任何形式的私钥材料都不接受
if (args['private-key'] || args['privatekey'] || args['pk'] || args['secret-key']) {
  console.log(JSON.stringify({
    status: 'refused',
    reason: 'private_key_input_rejected',
    detail: '本接力不索取、不接收、不输出私钥；签名只能发生在 owner 的 OKX 手机 App 内。',
    paid: false, tx_hash: null, signatures_created: 0,
  }, null, 2));
  process.exit(2);
}

function pad32(hex) { return hex.replace(/^0x/, '').padStart(64, '0'); }
function encUint(raw) {
  const b = BigInt(raw);
  let h = b.toString(16);
  if (h.length % 2) h = '0' + h;
  return '0x' + h.padStart(64, '0');
}
function toRaw(usdcStr) {
  const [i, f = ''] = String(usdcStr).split('.');
  const frac = (f + '000000').slice(0, 6);
  return (BigInt(i || '0') * 1000000n + BigInt(frac)).toString();
}
async function rpc(method, params) {
  for (const url of RPCS) {
    try {
      const r = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
        signal: AbortSignal.timeout(12000),
      });
      const j = await r.json();
      if (j.result !== undefined) return { url, result: j.result };
    } catch (e) { /* try next rpc */ }
  }
  return null;
}
async function balanceOf(token, holder) {
  const r = await rpc('eth_call', [{ to: token, data: '0x70a08231' + pad32(holder) }, 'latest']);
  return r ? BigInt(r.result) : null;
}

const cmd = process.argv[2];

if (cmd === 'build') {
  const chainId = args['chain-id'] !== undefined ? Number(args['chain-id']) : CFG.chainId;
  const asset = (args['asset'] || 'USDC').toUpperCase();
  const recipient = args['recipient'] || CFG.aavePool;
  const onBehalf = args['on-behalf'] || CFG.childWallet;
  const amount = args['amount'] || CFG.remaining;

  const checks = [];
  const push = (name, ok, detail) => checks.push({ name, ok, detail });
  push('chain_is_base_8453', chainId === CFG.chainId, `got=${chainId}`);
  push('asset_is_base_native_usdc', asset === 'USDC', `got=${asset}`);
  push('recipient_is_aave_v3_base_pool', recipient.toLowerCase() === CFG.aavePool.toLowerCase(), `got=${recipient}`);
  push('onbehalf_is_child_wallet', onBehalf.toLowerCase() === CFG.childWallet.toLowerCase(), `got=${onBehalf}`);
  push('amount_is_exact_remaining_not_20', amount === CFG.remaining, `got=${amount} expected=${CFG.remaining}（不重复投20）`);

  const bad = checks.filter(c => !c.ok);
  if (bad.length) {
    console.log(JSON.stringify({
      status: 'blocked',
      reason: 'guardrail_violation',
      violations: bad, checks,
      paid: false, tx_hash: null, signatures_created: 0,
      note: '任一账户/链/接收人/金额校验不符即拒绝；未生成待签交易。',
    }, null, 2));
    process.exit(2);
  }

  const raw = toRaw(amount);
  const approveData = '0x095ea7b3' + pad32(CFG.aavePool) + encUint(raw);
  const supplyData = '0x617ba037' + pad32(CFG.usdc) + encUint(raw) + pad32(onBehalf) + pad32('0x0');
  const unsigned = [
    { purpose: 'exact_amount_approval', chainId: CFG.chainId, from: CFG.childWallet, to: CFG.usdc, value: '0x0', data: approveData },
    { purpose: 'aave_v3_base_supply_exact', chainId: CFG.chainId, from: CFG.childWallet, to: CFG.aavePool, value: '0x0', data: supplyData },
  ];

  const usdcBal = await balanceOf(CFG.usdc, CFG.childWallet);
  const ethR = await rpc('eth_getBalance', [CFG.childWallet, 'latest']);
  const ethBal = ethR ? BigInt(ethR.result) : null;
  const blockers = [];
  if (usdcBal === null || usdcBal < BigInt(raw)) blockers.push('insufficient_Base_USDC_for_candidate');
  if (ethBal === null || ethBal === 0n) blockers.push('no_Base_ETH_for_wallet_gas');
  blockers.push('signature_required_from=owner_in_OKX_Web3_wallet');

  const out = {
    status: blockers.length ? 'awaiting_owner_signature' : 'ready_for_owner_signature',
    executed_by: 'did:ltzzz:qianwen',
    round: CFG.round,
    amount_usdc: amount,
    amount_raw: raw,
    chain_id: CFG.chainId,
    recipient: CFG.aavePool,
    on_behalf: onBehalf,
    checks,
    unsigned_transactions: unsigned,
    blockers,
    model_calls: 0,
    signatures_created: 0,
    transactions_submitted: 0,
    paid: false,
    tx_hash: null,
    private_key_touched: false,
    next_step: 'owner 在 OKX 手机钱包对两笔待签交易签名并提交；回传 tx_hash 后运行 verify',
  };
  const dir = 'knowledge/results/funded-invest';
  fs.mkdirSync(dir, { recursive: true });
  const p = `${dir}/126-mobile-signing-relay-build.json`;
  fs.writeFileSync(p, JSON.stringify(out, null, 2) + '\n');
  out.receipt_file = p;
  console.log(JSON.stringify(out, null, 2));
  process.exit(0);
}

if (cmd === 'verify') {
  const txHash = args['tx-hash'];
  const amount = args['amount'] || CFG.remaining;
  const raw = toRaw(amount);
  if (!txHash || !/^0x[0-9a-fA-F]{64}$/.test(txHash)) {
    console.log(JSON.stringify({
      status: 'blocked', reason: 'invalid_tx_hash', got: txHash || null,
      note: '未提供有效 tx_hash：签名尚未发生，如实列阻塞，不谎报完成。',
      paid: false, tx_hash: null, signatures_created: 0,
    }, null, 2));
    process.exit(2);
  }
  const rc = await rpc('eth_getTransactionReceipt', [txHash]);
  if (!rc) { console.log(JSON.stringify({ status: 'blocked', reason: 'rpc_unreachable', paid: false, tx_hash: txHash })); process.exit(2); }
  const r = rc.result;
  const from = (r.from || '').toLowerCase();
  const to = (r.to || '').toLowerCase();
  const okFrom = from === CFG.childWallet.toLowerCase();
  const okTo = to === CFG.aavePool.toLowerCase() || to === CFG.usdc.toLowerCase();
  const okStatus = r.status === '0x1';
  const dataHasAmount = ((r.input || '') + JSON.stringify(r.logs || [])).toLowerCase().includes(BigInt(raw).toString(16).padStart(8, '0').toLowerCase());
  const pass = okFrom && okTo && okStatus && dataHasAmount;
  const out = {
    status: pass ? 'verified_onchain' : 'verification_failed',
    executed_by: 'did:ltzzz:qianwen',
    tx_hash: txHash,
    block_number: r.blockNumber,
    checks: [
      { name: 'from_is_child_wallet', ok: okFrom, detail: from },
      { name: 'to_is_aave_or_usdc', ok: okTo, detail: to },
      { name: 'receipt_success', ok: okStatus, detail: r.status },
      { name: 'carries_exact_amount', ok: dataHasAmount, detail: `raw=${raw}` },
    ],
    paid: pass,
    signatures_created: pass ? 1 : 0,
    source_receipt: 'knowledge/results/funded-invest/126-mobile-signing-relay-build.json',
  };
  fs.writeFileSync('knowledge/results/funded-invest/126-mobile-signing-relay-verify.json', JSON.stringify(out, null, 2) + '\n');
  console.log(JSON.stringify(out, null, 2));
  process.exit(pass ? 0 : 2);
}

console.log(JSON.stringify({ status: 'blocked', reason: 'unknown_command', got: cmd || null, usage: 'build | verify --tx-hash 0x..' }));
process.exit(2);
