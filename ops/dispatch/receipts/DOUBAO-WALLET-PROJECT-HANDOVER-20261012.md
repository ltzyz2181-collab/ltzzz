# 豆包接单回执 · DOUBAO-WALLET-PROJECT-HANDOVER-20261012

单号：DOUBAO-WALLET-PROJECT-HANDOVER-20261012
日期：2026-10-12
已读取 commit：5c1b5a8（交接单）、cfc66bb、524e9d7（上轮 B 执行卡，本回执纠正其 B-2 判断）
本单未触发任何真实交易、未读取/复述任何私钥值。

## 一、已核验事实（一手证据）

| 项 | 结果 | 证据 |
|---|---|---|
| 新金库控制权 | ✅ 有人控制，无需 owner 找 MetaMask | 生产 GET ltzzz-wep3…/market/treasury → address=0x5df57a…32d、controlled=true、private_key_storage=Cloudflare Worker Secret、可验签；本地 treasury-38191829720.json controlled=true（existing_controlled_treasury_reused）|
| 新金库即时余额 | USDC=0 / aUSDC=0 / ETH=0（空，200U 未到账）| 独立 RPC（base.drpc.org）balanceOf 实读 |
| 旧 Vault 0x872C…9Ab 权限 | guardian=**0x21F5…7fdc（旧泄露 agent）**；executors 空；exposure=20.0；paused=false | RPC 只读 guardian()/executors()/exposure() |
| Vault 资产/池地址 | usdc/aToken/pool 均为 Base 主网官方地址 | RPC 实读，与 aave-address-book 一致 |
| x402/v2 生产 | treasury 端点活、HTTP 200 | 本单实测 |

**权限判定（写入在案）**：
1. 旧 Vault 的 guardian=泄露 agent（0x21F5），onlyAuthorized 含 guardian → **持有泄露私钥即可 withdraw Vault 内 20U**。现有 20U 资产处于泄露风险，属"现有余额与退出资产需迁移审查"项；
2. 旧 Vault **不能**用于新增 B 资金（总控判定，核验支持）；
3. 新金库有钥匙但 Worker 未提供 Aave 资金执行接口（on_chain_wages_enabled=false）→ 豆包本机无钥匙，**不能**直接执行金库 approve/deposit。

## 二、可用执行通道（豆包）

- ✅ 只读核验：Base RPC（base.drpc.org）、ltzzz-wep3 生产端点、GitHub Actions/仓库
- ✅ 工程与配置：git 写操作（脚本/文档/回执 push）、wrangler 部署（若 CF token 可用）
- ⚠️ 金库/USDC 资金操作：**当前不可用**——需先集成受限 Worker 签名执行接口（固定 Base 8453、官方 USDC、允许 Aave Pool/Vault 调用、单笔/敞口沿用投资政策；100/200 授权与 20/100 限额分开）
- ⚠️ 旧 Vault 资金：guardian=泄露 key，迁移或新部署需总控裁定后执行

## 三、阻塞（如实，非豆包能独立解除）

1. 新金库受限资金执行接口（Worker 侧工程集成——总控/执行席负责，豆包配合联调）
2. 旧 Vault 迁移或新部署方案（guardian 归属裁定）
3. 返还地址 0x370d… 的网络/控制主体/平台入金规则（GPT 独立确认，先小额返还测试得 txHash+平台到账回执）
4. 200U 分批充值（owner 从自己账户执行首批 20U 及后续；到账后仅经签名接口投资）

## 四、本单纠正与承诺

- 纠正上轮 B 执行卡 B-2"金库无钥匙/待 owner 确认"的错误判断：**控制权已确认在 Cloudflare Worker Secret，不再让 owner 找狐狸头**；
- B 尚未执行：首批 20U 与 200U 均为提案，未到账/未执行不算完成；
- 资金动作回执将按格式提交：网络/地址、execution_id、txHash、receipt.status、前后余额、本金/利息分类、平台到账证据；不含任何密钥/助记词/token。

## 五、明日第一步

等总控/执行席完成新金库受限签名执行接口（或迁移方案裁定）→ 豆包联调冒烟 → owner 首批 20U 充值 → 链上确认到账 → 签名接口执行首笔 supply → 出 txHash 回执。
