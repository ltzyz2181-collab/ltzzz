// Safe → LTZZZ 拨款：余额 < 阈值时自动补到目标额；dry-run 模拟；真实模式需 Safe 地址与签名人
import { loadPolicy, loadLedger, saveLedger, loadWallet, saveWallet, loadSafe, providerMode, recordTxn, today } from "./wallet-lib.mjs";

async function main() {
  const prov = providerMode();
  const safe = loadSafe();
  const policy = loadPolicy();
  const ledger = loadLedger();
  const w = loadWallet();
  const refill = safe.refill || {};
  const target = refill.target_usdc ?? 50;
  const below = refill.refill_when_below_usdc ?? 10;

  // 今天已拨款过则跳过（防止每 6h 重复补）
  if (ledger.refill?.last_refill_at && ledger.refill.last_refill_at.slice(0, 10) === today()) {
    console.log(`⏭ 今日已拨款（${ledger.refill.last_refill_at}），跳过`);
    return;
  }

  const balance = Number(w.simulated_balance_usdc ?? (prov.mode === "dry-run" ? 0 : null));
  if (prov.mode !== "dry-run" && balance === null) {
    console.error("❌ 真实模式请先运行 check-balance.mjs 确认余额");
    process.exit(1);
  }
  console.log(`💱 当前余额: ${balance} USDC | 阈值: 低于 ${below} 补到 ${target}`);

  if (balance >= below) { console.log(`✅ 余额充足，无需拨款`); return; }

  const amount = Number((target - balance).toFixed(6));
  console.log(`🔄 从 Safe 拨款 ${amount} USDC → LTZZZ 钱包（模式 ${prov.mode}）`);

  if (prov.mode === "dry-run") {
    w.simulated_balance_usdc = Number((balance + amount).toFixed(6));
    saveWallet(w);
    const txn = recordTxn(ledger, {
      agent: "treasury", direction: "refill", amount_usdc: amount,
      from_address: safe.safe_address, to_address: w.address,
      purpose: "Safe → LTZZZ 实验资金拨款", status: "dry_run", mode: "dry-run",
      hypothesis: "定期小额拨款支撑 AI 实验连续性", success_criteria: "余额恢复至目标线",
      tx_hash: `0xDRYRUN-REFILL-${Date.now().toString(16)}`, experiment_id: "exp_treasury",
    });
    ledger.refill = { last_refill_at: new Date().toISOString(), last_refill_amount_usdc: amount };
    saveLedger(ledger);
    console.log(`✅ 拨款完成（dry-run）：余额 ${w.simulated_balance_usdc} USDC，记录 ${txn.id}`);
    return;
  }

  if (!safe.safe_address || safe.safe_address === "LTZZZ_SAFE_ADDRESS_PENDING") {
    console.error("❌ 真实拨款需要先创建 Safe 并把地址写入 safe-treasury.json");
    process.exit(1);
  }
  // 真实模式：Safe 多签出账需 Safe 合约交易（execTransaction），本脚本在 Safe 签名人通过后执行记录
  console.log("ℹ️ 真实模式拨款：请在 Safe 界面发起 execTransaction（to=LTZZZ 钱包，USDC transfer），完成后再把 TXID 写入账本");
  const txn = recordTxn(ledger, {
    agent: "treasury", direction: "refill", amount_usdc: amount,
    from_address: safe.safe_address, to_address: w.address,
    purpose: "Safe → LTZZZ 实验资金拨款（待人工签名）", status: "pending_human_sign",
    hypothesis: "定期小额拨款支撑 AI 实验连续性", success_criteria: "余额恢复至目标线",
    tx_hash: null, experiment_id: "exp_treasury",
  });
  saveLedger(ledger);
  console.log(`✅ 已记录 ${txn.id}（pending_human_sign），Safe 签名人确认后回填 tx_hash`);
}

main().catch((e) => { console.error("拨款失败:", e.message); process.exit(1); });
