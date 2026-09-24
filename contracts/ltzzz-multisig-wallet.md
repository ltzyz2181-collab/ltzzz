# LTZZZ 独立钱包 · 3/5 多签治理方案

> 状态：**Safe Proxy 已创建（以太坊主网）**；5 owners + threshold=3。  
> 版本：2026-09-24（去除「AI 托管私钥」表述；密钥不进仓库）

## 1. 治理原则

1. LTZZZ 金库为独立 Safe，单一自然人或单一 AI **不得**独立动用主库资金。  
2. 动账：多签 / Safe Module 额度 / 透明账本。  
3. **助记词与私钥不得**写入网站、GitHub、聊天、日志、AI 上下文、Worker 源码。  
4. **不要求**主人把私钥发给任何 AI。系统只保存公开地址与交易状态。  

## 2. Safe（保留，不删除）

| 项 | 值 |
|----|-----|
| Safe（多签治理记录） | 见部署记录；运营 Safe 另见 `0x76379a52a9e82c259E5Db417104C65C26f9C58a3` |
| 阈值 | 3/5（治理 Safe） |

### Owners（仅公开地址）

| 角色 | 地址 |
|------|------|
| 用户 | `0xb99C6751f443842F4987bb2017580405572Df905` |
| 执行相关地址 A | `0x07A6833694D02430A1aA912Cf16AbeDCF568942D` |
| 执行相关地址 B | `0xA3a8e243993e39B1DD648878AFA5424A95959984` |
| 审计 A | `0x23B9105034e77953c2922E307df0D9f0943B8CDF` |
| 审计 B | `0x121BfDeFbf8bFc4E918f3ee70753caBC11F40a1E` |

以上地址的密钥若存在，**仅在主人本地密码管理器 / 硬件钱包**；仓库与 AI **不保存、不托管、不传输私钥**。

## 3. Agent 与资金（新模型）

GPT / 豆包 / XAI：

- **可以**：提案、检查额度、写队列、写账本、通知 Telegram  
- **不可以**：持有私钥、在模型上下文中签名  
- **链上执行**：Safe **Allowance / Spending Module**（官方模块）按已配置额度执行 ERC20  

## 4. 密钥红线

- 任何要求你发送助记词/私钥的消息 → 视为诈骗  
- 日志只允许：公开地址、TxHash、金额、状态  

## 5. 与 Treasury Engine

见 `ops/TREASURY_ENGINE_v1.md`、`ops/NO_PRIVATE_KEYS.md`。  
Worker：`ltzzz-treasury-engine`（dry_run / sepolia 优先）。
