# LTZZZ Multi-AI Treasury / Web3 核心项目

## 目标
建立一个由多个 AI 共同管理、但不能任意夺取全部资金权限的 Web3 Treasury。核心原则：AI 可以观、分析、提出交易并在受限额度内执行；生产资金的最终高风险权限必须可撤销、可审计、可分级。

## 核心架构

```text
多 AI
  ↓
Memory Gate（观 → 行深 → 查历史 → 查凭证）
  ↓
Policy Engine
  ↓
Transaction Queue
  ↓
Safe / 测试金库
  ↓
链上执行
  ↓
TxHash / Receipt / Balance Verification
  ↓
Result Center + Memory Center
```

## AI 角色
- GPT：总控、规划、风险检查、任务编排。
- XAI：Web3/代码安全、交易策略与执行器打磨。
- DeepSeek：中文规则、传统文化/装备论对照。
- Claude：长文本、审计说明、连续研究。
- 豆包：资产整理、内容与视频任务；不得自行注册账号或索取新凭证。
- Microsoft：西方文化/产品与合规研究。

## 资金权限分层
### L0 — 观察
读取余额、交易历史、Gas、Token、合约状态。

### L1 — 提案
AI 生成交易，不可广播。

### L2 — 测试金库
只允许使用专门 Safe 测试资金；设置单笔/每日 spending limit。

### L3 — 生产金库
默认 human-confirm。AI 不得自行扩大额度、替换收款地址、改变网络或关闭安全策略。

### L4 — 紧急停止
任何 AI、策略或异常检测可以触发 pause；恢复需要人工确认。

## 未来“AI 自动动生产资金”实验路线
第一阶段：Safe + spending limit + 测试资金。
第二阶段：AI transaction queue + 多 AI 交叉审查 + 自动小额执行。
第三阶段：生产资金仅开放极小额度，超过额度进入人工确认。
第四阶段：只有经过长期真实验证后，才研究 LTZZZ 自有智能合约/执行器。

禁止直接把生产钱包私钥交给模型。若未来研究自托管执行器，密钥必须进入硬件/阈值签名/受限执行环境，模型只能获得最小权限。

## 每笔交易必须记录
- proposal_id
- proposer AI
- memory_snapshot
- chain / token / amount
- destination address（完整地址）
- policy decision
- human approval（如需要）
- tx hash
- receipt / confirmations
- final balance
- result / failure reason

## 核心原则
1. 先观，后行。
2. 已有凭证不重复注册。
3. 已有任务不重复部署。
4. AI 的“完成”不是结果，链上 Receipt 才是结果证据。
5. 真金测试从小额、可撤销、可审计开始。
6. 任何资金自动化都必须能停、能查、能追责。
