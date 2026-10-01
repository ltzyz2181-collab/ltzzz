// 查询余额：dry-run 读模拟余额；local 模式用 ethers 直连 Base RPC 查 USDC 真实余额（无 Privy）
import { loadWallet, saveWallet, providerMode, localWallet } from "./wallet-lib.mjs";
import { formatUnits } from "ethers";

async function main() {
  const prov = providerMode();
  const w = loadWallet();

  if (prov.mode === "dry-run") {
    console.log(`💱 LTZZZ 钱包余额（dry-run 模拟）: ${w.simulated_balance_usdc ?? 0} USDC`);
    console.log(`   钱包: ${w.address || "未初始化"}`);
    console.log(`   提示: 配置 LTZZZ_WALLET_PRIVATE_KEY 后查询链上真实余额`);
    return;
  }

  const { usdc, wallet } = await localWallet(prov);
  const bal = await usdc.balanceOf(wallet.address);
  saveWallet({ ...w, address: wallet.address, wallet_id: "LOCAL-SELF-HOSTED", status: "initialized_local" });
  console.log(`💱 LTZZZ 钱包真实余额: ${formatUnits(bal, 6)} USDC（Base）`);
  console.log(`   钱包地址: ${wallet.address}`);
}

main().catch((e) => { console.error("查询失败:", e.message); process.exit(1); });
