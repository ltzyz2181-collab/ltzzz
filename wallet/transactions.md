# 全部分录

入金 + 出金 + 错网 + 手续费。字段与 schema 一致。

| ID | 时间 | 资产 | 金额 | 网络 | 发送地址 | 接收地址 | TXID | 手续费 | 状态 | 用途 | 人工确认 |
|----|------|------|------|------|----------|----------|------|--------|------|------|----------|
| TX-INIT | 2026-09-21 | — | 0 | — | — | — | — | — | confirmed | 建立 wallet/ 账本 | 是（结构） |
| TX-XLAYER-USDT | 待核 | USDT | 待核 | X Layer（错网） | 待核 | 待核 | `0x1ba8…`（完整哈希由主人补） | 待核 | wrong-network | 历史错网，不自动追款 | 否 |
| TX-20260925-1U-UCARD | 2026-09-25 | USDT | 1 | Ethereum | LTZZZ Safe `0x76379a52…f9C58a3`（报告） | U卡地址（主人侧） | `0x3df2e54b7eed234a7556f54cc21695326bf62e50261d1557923d3da9198754da` | 链上 gas（ETH） | confirmed（豆包报告；Etherscan 主人再核） | 3/5 多签最小额测试 → U卡 | 是（豆包+GPT+主人） |
| TX-20261001-UCARD-BLOCKED | 2026-10-01 | — | 0（未发生） | 待定（须与提现网络一致） | 交易所提现（**不经**旧泄露钱包 `0x21F5…7fdc`） | U卡地址 `0x1893…0eF7` | 无（未执行，不伪造 txid） | — | blocked | 流程 F 的 5U 链路测试；前置 0/3 满足：①10-01 本机命令通道故障（已修复）②交易所地址簿未添加 0x1893 ③网络未确认 | 否（等 owner 动作） |

> **2026-10-02 千问巡检合并注记**：上行为 `wallet/PENDING-2026-10-01.md` 原样合并入账（通道恢复后执行），合并后 PENDING 文件删除。
> - `0x1893…0eF7` 为收款方地址，无私钥暴露，可正常收 U；旧自托管钱包 `0x21F5…7fdc` 私钥曾随 `ltzzz-secrets.md` 进过仓库，**只查余额、不收真钱、不作任何转账来源**。
> - TX-20261001-UCARD-BLOCKED 为 blocked 记录，**无链上交易发生、无 receipt**，按真实性四公式不得计为已完成。
> - 10-01 补充事实：U 卡到账 5.99U（见 deployment-status 补充5），为外部收款，非流程 F 测试转账。
>
> **2026-10-09 千问巡检·U 卡地址链上核账（公开 RPC 只读，无新交易，故不加分录行）**：`0x1893…0eF7` 实测 Base 主网 ETH=0 / USDC=0、Ethereum 主网 USDT=0 / ETH≈0.0010865（gas 零头）。**5.99U 在当前余额不可见 → 标 NEEDS_CHECK**，历史流水待 owner 用 Etherscan/Basescan 核对（余额 0 不否定历史到账，只说明已划转或不在所测链币）。主网 USDC 合约地址本轮无法独立核实，不采信任何猜测数字。流程 F 前置 ②交易所地址簿 ③网络确认 仍未满足，本窗口无 txid、无 receipt。
>
> **2026-10-10 千问巡检·U 卡续核（公开 RPC 只读，余额与 10-09 一致 → 本窗口无新交易、无 receipt）**：Ethereum 主网 ETH≈0.0010866、USDT=0，Base ETH=0（两独立节点一致）。**新增取证**：本账唯一完整 txid 的 TX-20260925-1U-UCARD（`0x3df2e54b…98754da`）经 `eth_getTransactionByHash` 实测**交易真实存在**（blockHash `0x8d6fe5cc…`），但 `to=` LTZZZ Safe 合约 `0x76379a52…c58a3` 本身、`value=0`——系对 Safe 的多签执行调用；公共节点 `eth_getTransactionReceipt` 返 null（archive 索引缺口，不据此否定交易）。**"USDT 是否最终入 0x1893"无法在本机独立取证 → NEEDS_CHECK，请 owner 用 Etherscan 查该 tx 内部 call 与 token 事件**。5.99U 与 1U 去向合并为同一笔待核流水。
