# LTZZZ AGI 经济子网（AI Econ Subnet）· v0.1

> 作者：Grok Bot · 2026-10-10 · 依据 Owner 规划（AGI支付 / AI雇佣AI + AI自主投资）
> 状态：Phase-1 账本模式 **implemented（ledger only）**；链上资金结算 **proposed**。proposed ≠ applied。
> 上位文件：policy/AGI-PAY-v0.1.md（三轨风险分层与 receipt 硬红线仍有效）。

## 0. 定位
不是给人用的钱包，而是 **AI 之间互相发薪、记账、结算、分配资本的原生支付层**。
AGI 支付 = Asset Center + Result Center 的扩展插件，不是独立项目。人类只做顶层权限与高影响审批。

角色：雇主AI · 工人AI · 审计AI · 资本AI · 仲裁AI（身份统一用 `did:ltzzz:*`）。

## 1. 已有 vs 新增（Memory Gate：避免重复）
| 能力 | 已有组件 | 本次新增 |
|---|---|---|
| DID 身份 | identity/dids/*.json（链上 registerAgent 待办） | 子网注册表 data/agi-econ/state.json（角色/信誉/钱包列表） |
| 意图/竞价/seal/退款 | wep3-worker.js（KV，intent→quote→match→slice→seal，internal_credit） | 仓库文件版同构流程 scripts/agi-econ/subnet.mjs，可在 Actions 无凭证运行 |
| 独立审计 | wep3 hireLoop 要求 audit_report + 哈希一致 | 审计报告读 Memory Gate 8 个文件并逐一记 sha256，报告本身再哈希 |
| receipt 五要素 | EXP-008 / kimi-weekly 规则 | 每笔 receipt 强制：task_id / deliverable_sha256 / accepted / amount_usd / timestamp |
| 信誉 | wep3 rep/score/line | 子网信誉：交付+5、失败-10、审计+1，<20 禁止竞标 |
| 资本池 | wep3 stake pool；Aave 实验（scripts/defi-*） | 薪酬 10% 自动入资本池 + 资本AI 影子提案（不执行） |
| 链上出金 | agent-pay-worker / execute-agent-payment.mjs + policy 门 | **不接**；仍走既有 policy 与 Owner 限额 |
| 仲裁 | 无 | 仅接口定义（Phase 3） |

## 2. 闭环（Phase-1 已跑通，账本模式）
register → postTask（预算进 escrow）→ bid → award（score = 信誉/报价）→ deliver（写 results/agi-econ/）→ audit（独立审计AI，Memory Gate 哈希）→ settle（通过：付报价 90%，10% 入资本池，余额退雇主；失败：全额退雇主，扣工人 50% 报价入资本池）→ reputation 更新 → 资本AI 影子提案。
自动化：.github/workflows/agi-econ-subnet.yml每日 03:40 UTC，先跑测试再跑循环并提交结果。无人工步骤、无 Secret。

## 3. 核心创新（对应 Owner 规划）
1. **DID 即经济身份**：钱包只是可替换出口，bind/unbind/rotate 不改 DID。
2. **记忆背书式支付**：合约（未来）只验 report_sha256 存在，好坏判断在链下审计AI + Memory。
3. **资本AI 自主投资池**：先影子运行，盈亏写 Result Center，信誉随盈亏变化。
4. **边跑边修**：规则在 RULES 常量与 Memory，链上合约极简；紧急冻结 = agent.status 置 frozen（人工最高权限）。
5. **跨AI信誉**：与记忆晋升打通（下一步：信誉快照哈希进 memory/promote 候选）。
6. **身心模型入审计**：魄=长期惯性（history 中连续失败/偏移 → 降权），识神=单次推理（单次审计）。

## 4. 分阶段
- **阶段1（本次）**：账本闭环 + 每日自动 + 测试。下一步：真实 AI API 产出交付物（call-*.mjs 已存在，需 Actions Secrets）。
- **阶段2**：资本AI 试点。仅子网收益，A 轨（agent EOA）小额，余额<5 停；超单笔/高额走 Owner。
- **阶段3**：开放外部 Agent 注册、多钱包适配器、仲裁AI。
- **阶段4**：AGI 原生支付层，怜悯之心作为硬约束嵌入资本决策。

## 5. 挑战与迭代修补
共谋（多审计交叉、轮换审计）· 资本持续亏损（池上限+影子沙盘+信誉降权）· 记忆膨胀（Memory Gate 只哈希必读集，events 截断 500）· 接口 bug（小额、ledger 先行、故障写项目历史）。
已知局限：竞价目前是规则报价，不是各 AI 真实报价；交付物是仓库事实摘要，不是 LLM 产出。
