# Aave 个人提现回执（2026-10-13，第③项 · 已核实网页版可操作）

状态：**用户 2026-10-13 指示「AAVE 提u」；已核实 Aave Account 为非托管钱包且支持网页版操作（官方审计报告佐证），待 owner 在网页版/App 内发起转出并提供目标地址**。

## 一、产品形态核实（2026-10-13，修正此前"托管"判定）

- 官方 Zellic 安全审计报告（2026-05-26，aave.org/files/aave-account-web-app-audit-report-2026-05.pdf）原文：
  - "Aave Accounts: **A non-custodial wallet** and account infrastructure that lets end users create, recover, and use a crypto wallet through a familiar email/password experience, while keeping all sensitive key material **client-side encrypted**."
  - "An Aave Account (fka Family Account) is a cross-platform wallet. **A user can register on web**, log in on iOS, recover on React Native, and export a wallet back to web."
- **结论：Aave Account（原 Family Account）是非托管钱包，有网页版入口，可在网页端登录并操作（含转出）；此前回执"托管平台、仅 App 提现、平台不支持任意地址转出"的判定有误，予以修正。**

## 二、昨日查明事实（复述，不重新猜地址）

| 项 | 值 |
|---|---|
| 平台名称 | Aave Account（原 Family Account，非托管钱包，邮箱/密码登录、密钥客户端加密） |
| 实际网络 | Base 8453（App「存入 USDC」页显示 Base 充值地址） |
| 资产类型 | USDC 托管显示余额 ≈ $1,001.77（App 内可见；MetaMask 各账户 aUSDC=0，10-11 实测） |
| App 内充值地址 | 0x370dd04092b2EcE24372ff93C29b55f5D2c12FD5（10-13 链上实测 USDC/aUSDC/ETH 全 0——账户资金以 Account 钱包/协议仓位体现，非该地址余额） |
| 提现/转出入口 | **Aave Account 网页版或 App 内转出（客户端签名，可转任意地址）** |

## 三、待 owner 执行（网页版/App 内，凭据不进对话）

1. 登录 Aave Account（网页版或 App）→ 确认当前 USDC 余额。
2. **确认目标地址（Base，USDC）**——两个方案，建议先小额验证：
   - 方案 A（推荐，一步归集）：直接转到新金库 `0x5df57a78E0A13df2aE983BDAD69cFCBD3DD7a32d`（Base 8453，USDC 原生币种），先小额（$2–10）到账后再转余额。
   - 方案 B：先转到 owner 自有钱包（需 owner 提供 Base 地址），再转新金库。
3. 提交转出并记录平台回执；到账 txHash 交回做链上验证。

## 四、币安 AAVE 代币（仅记录，不执行）

- 币安内 1.58 AAVE **不是 USDC 仓位**；需 owner 兑换成 USDC 后选 Base 提到新金库（另行回执）。

## 五、约束

- 凭据不进入对话；不在公开仓库/聊天中放置任何私钥、助记词、token。
- 本回执未发生任何链上资金动作；转出由 owner 在 Aave Account 内发起。
