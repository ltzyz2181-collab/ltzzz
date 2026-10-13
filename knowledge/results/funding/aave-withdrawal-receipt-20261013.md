# Aave 个人提现回执（2026-10-13，第③项）

状态：**仅回执，本轮不执行任何提现操作**。依据 2026-10-11 排查记录（knowledge/results/funding/aave-owner-address-probe-20261011.md）与用户 2026-10-13 附件截图（Aave 手机 App「存入 USDC」页）。

## 一、昨日查明事实（复述，不重新猜地址）

| 项 | 值 |
|---|---|
| 平台名称 | **Aave Account（Family 托管账户，非自托管）** |
| 实际网络 | **Base 8453**（该托管账户的入金/出金口走 Base） |
| 资产类型 | **USDC 托管余额 ≈ $1,001.77**（在 Aave 托管内；MetaMask 各账户 aUSDC=0，10-11 实测） |
| 入金/返还地址 | 0x370dd04092b2EcE24372ff93C29b55f5D2c12FD5（= Aave App「存入 USDC」页的 Base 充值地址；附件截图：最低 $2、仅 USDC 走 Base、显示 6.25%） |
| 提现入口 | **Aave App 自带提现**（托管平台不支持任意地址链上转出）→ 提到 owner 自有钱包 |

## 二、待执行路径（owner 配合时按此操作）

1. 打开 Aave App → Withdraw USDC → 提到 **owner 自有钱包**（Ethereum/Base 网络按平台实际选项）。
2. 到账后如需进入新金库投资：把 USDC 经 **Base** 提到新金库 0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d；先小额到账再转余款；留回执（txHash + 平台到账证据）。

## 三、币安 AAVE 代币（仅记录，不执行）

- 币安内 1.58 AAVE **不是 USDC 仓位**，不能直接作为 Base USDC 投资。
- 需要 owner 将计划投入部分兑换成 USDC，再选 Base 网络提到新金库；兑换与跨链回执另行记录。

## 四、约束

- 凭据不进入对话；不在公开仓库/聊天中放置任何私钥、助记词、token。
- 本回执未发生任何资金动作。
