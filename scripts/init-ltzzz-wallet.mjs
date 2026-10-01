// 初始化 LTZZZ 钱包：dry-run 生成本地模拟钱包；local 模式绑定自托管 EOA（私钥来自环境变量）
import { WALLET_DIR, loadPolicy, loadWallet, saveWallet, providerMode } from "./wallet-lib.mjs";

async function main() {
  const prov = providerMode();
  const policy = loadPolicy();
  const existing = loadWallet();
  console.log(`🔄 初始化 LTZZZ 钱包（模式: ${prov.mode}）`);
  console.log(`📋 策略版本 ${policy.policy_version} | 实验模式 ${policy.experiment_mode}`);

  if (prov.mode === "dry-run") {
    const w = {
      wallet_id: "DRYRUN-LOCAL",
      address: "0xDRYRUN000000000000000000000000000000000000",
      network: policy.network || "base",
      created_at: new Date().toISOString(),
      created_by: "init-ltzzz-wallet.mjs (dry-run)",
      status: "initialized_dry_run",
      simulated_balance_usdc: 0,
      note: "dry-run 模拟钱包，不产生真实链上地址。配置 LTZZZ_WALLET_PRIVATE_KEY 后重跑进入 local 模式。",
    };
    saveWallet(w);
    console.log("✅ 初始化完成（dry-run）：本地模拟钱包，余额 0");
    console.log("   下一步：treasury-refill.mjs 拨款，再 execute-agent-payment.mjs 实验");
    return;
  }

  // local 模式：从私钥推导地址并绑定（密钥仍在环境变量，不进文件）
  const { Wallet } = await import("ethers");
  const wallet = new Wallet(prov.privateKey);
  const w = {
    wallet_id: "LOCAL-SELF-HOSTED",
    address: wallet.address,
    network: policy.network || "base",
    created_at: existing.created_at || new Date().toISOString(),
    created_by: "init-ltzzz-wallet.mjs (local)",
    status: "initialized_local",
    note: "自托管 EOA：私钥仅在 GitHub Secret（LTZZZ_WALLET_PRIVATE_KEY），本文件只存公开地址。",
  };
  saveWallet(w);
  console.log(`✅ 钱包已绑定（local）：${wallet.address}`);
  console.log("   下一步：从 Safe 向该地址转入 Base USDC，再执行第一笔实验支付");
}

main().catch((e) => { console.error("初始化失败:", e.message); process.exit(1); });
