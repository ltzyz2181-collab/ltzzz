# Safe 提款提案 — Owner 确认请求（2026-10-13）

**一句话确认：** 请确认本轮回款钱包就是候选地址 **0xb99C6751f443842F4987bb2017580405572Df905**（Safe signer #1，你 2026-10-11 确认过在 MetaMask Account 1）；如不是，请直接回复新的 Ethereum 收款地址，豆包会重新生成提案。

> 状态：**UNCONFIRMED_RECIPIENT_PENDING_OWNER_CONFIRMATION** —— 收款地址在你确认前一律视为未定，任何人不得擅自执行。

---

## 一、链上实读结论（2026-10-13，block ≈ 26182670）

| 项目 | 链上实读值 | TxService 对照 |
|---|---|---|
| Safe 地址 | 0x76379a52a9e82c259E5Db417104C65C26f9C58a3 | 一致 |
| 版本 | v1.4.1 | 一致 |
| Owners（5） | 0xb99C…f905 / 0xD834…2F51 / 0x01B8…7D4C / 0x68B8…79a7 / 0x3941…70a6 | 一致 |
| 门槛 | **3 / 5** | 一致 |
| nonce | **6** | 一致 |
| ETH 余额 | **0.005 ETH**（5000000000000000 wei） | — |
| USDT 余额 | **49.02 USDT**（raw 49020000，6 decimals） | — |
| USDC 余额 | **0** | — |

三方交叉（ethereum-rpc.publicnode.com @ 26182667、ethereum.publicnode.com @ 26182670、Safe Transaction Service）结果完全一致；eth_call 为最终准绳。

---

## 二、提案参数表

### 提案 A — USDT 全额转出（先执行）

| 字段 | 值 |
|---|---|
| to | 0xdAC17F958D2ee523a2206206994597C13D831ec7（USDT 合约） |
| value | 0 |
| data | `0xa9059cbb000000000000000000000000b99c6751f443842f4987bb2017580405572df9050000000000000000000000000000000000000000000000000000000002ebfc60` |
| 含义 | ERC20 transfer(recipient, 49.02 USDT)，selector 0xa9059cbb，金额 raw=49020000 |
| operation | 0（Call） |
| nonce | **6**（当前链上 nonce） |
| 签名门槛 | 3 / 5 |

### 提案 B — 剩余 ETH 转出（A 执行成功后再签/执行）

| 字段 | 值 |
|---|---|
| to | 0xb99C6751f443842F4987bb2017580405572Df905（同一收款钱包，候选） |
| value | **0.002 ETH**（2000000000000000 wei） |
| data | `0x` |
| operation | 0（Call） |
| nonce | **7**（当前 nonce +1） |
| 签名门槛 | 3 / 5 |
| gas 预留 | Safe 内保留 **0.003 ETH** 不转走。理由：execTransaction 一笔普通转账含 Safe 开销约 60k–90k gas，按 30–50 gwei 约 0.0018–0.0045 ETH，0.003 ETH 可覆盖一次高 gas 执行并留余量；执行人 gas 通常从自己钱包出，预留的 ETH 是为了 Safe 后续还能运转。 |

> 注：本轮回款 = USDT 49.02 + ETH 0.002，全部进 owner 控制的 MetaMask 钱包；Safe 内留 0.003 ETH dust。后续「USDT→USDC 兑换 → Base 跨链到新金库 0x5df5…」是下一轮独立步骤，不在本提案内。

---

## 三、操作步骤（owner 端）

1. **先确认收款地址**（上方一句话）。确认候选地址无误 → 继续；要换地址 → 回复新地址等豆包重出 JSON。
2. 打开 Safe web app（https://app.safe.global），进入 Safe 0x7637…58a3。
3. 左侧 **New Transaction → Transaction Builder**。
4. 粘贴 `safe-to-owner-builder-20261013.json` 中 **Proposal A** 的字段（txBuilderVersion/to/value/data/operation/nonce），点 **Create transaction**。
5. 5 个 owner 各自在 MetaMask 切换到自己的签名账户，**逐个连接并签名**；累计签满 **3 个**即达门槛。
6. 任意一人点 **Execute**（执行人自己付 ETH gas），链上确认后查 USDT 是否到候选钱包。
7. USDT 到账后，再按同样流程导入 **Proposal B**（nonce 自动会接在 7），签满 3 个后执行，查 ETH 到账。
8. 两步都完成后再开始下一轮：USDT 换 USDC → Base 小额试转 → 余款跨链到新金库。

**硬性提醒：**
- 两份提案 JSON 里的 recipient 在 owner 确认前一律是候选值；若你要换地址，用 `placeholderTemplate` 那段找豆包重算 data。
- 执行人负责 gas，确保执行人钱包里有少量 ETH（Safe 内那 0.003 ETH 是 Safe 自身运转预留，不是给执行人的 gas 报销）。
- 全程只读已由豆包完成，本轮不签名、不广播；签名与执行只发生在你本地 MetaMask。
