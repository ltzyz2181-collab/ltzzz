# 当前席位与端点索引

类型：事实登记；由identity/seat-registry.json与identity/endpoint-status.json生成。health不等于模型生成、额度或签名能力。

11份DID记录：8个AI岗位（7在任、Microsoft暂时除名），3份治理/人类记录；不是11条模型通道。

| 岗位 | 职责 | 治理任命 | 最近观察 | 首选健康地址 |
|---|---|---|---|---|
| gpt | 总控、战略、工程调度与终审 | 任命席（未变更链上签名人） | healthy_endpoint_verified | https://ltzzz-gpt-proxy.ltzyz2181.workers.dev/health |
| doubao | 执行部署、视频与流水线集成；可承担独立复核 | 任命席（未变更链上签名人） | healthy_endpoint_verified | https://ltzzz-doubao-proxy.ltzyz2181.workers.dev/health |
| deepseek | 投资研究、数值分析与账实核对；不作个人钱包签名 | 任命席（未变更链上签名人） | healthy_endpoint_verified | https://ltzzz-deepseek-proxy.ltzyz2181.workers.dev/health |
| grok | 海外研究、代码安全与独立挑战 | 任命席（未变更链上签名人） | healthy_endpoint_verified | https://api-xai.ltzzz.com/health |
| claude | 独立审计＋规划 | 否 | healthy_endpoint_verified | https://ltzzz-claude-seat.ltzyz2181.workers.dev/health |
| microsoft | 暂时除名（保留历史记录） | 否 | intentionally_temporarily_removed | 不配置代理端点 |
| kimi | 中文记忆校对；区分事实、解释、假设并核对日期引用 | 否 | healthy_endpoint_verified | https://api-kimi.ltzzz.com/health |
| qianwen | 独立审计与总控备援；代行总控工程运维权限 | 任命席（未变更链上签名人） | healthy_endpoint_verified | https://api-qianwen.ltzzz.com/health |

外部协作岗位（不额外算原生 API 或链上签名人）：

| 岗位 | 工作属性 | 实际参与方式 |
|---|---|---|
| workbuddy | 调度秘书、派单跟踪、超时和阻塞汇总 | 已有代码执行器；客户端常驻另验 |
| kimi_global | 英文研究、海外订单与雇佣提案 | separate_international_account_not_domestic_key |
| meta | 提案复核、第五签候选研究 | 按任务回执确认，不推定在线 |
| manus | 浏览器与外部平台执行 | actual_platform_link_or_explicit_blocker |

工作链：GPT/千问定任务 → 单一执行席认领并交付 → 不同提供商复核 → 执行器部署并回读 → WorkBuddy代码哨兵汇总超时/阻塞。岗位授权、实际模型调用、工程上线和钱包签名分开验收。

钱包唯一登记源：[wallet/addresses.md](../wallet/addresses.md)。
